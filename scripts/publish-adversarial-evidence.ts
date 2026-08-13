#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from './collect-adversarial-context.ts';
import { validatePromotionReport } from './evaluate-adversarial-reviewer.ts';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';
import { evaluateAdversarialExceptions, type ExceptionEvaluation } from './apply-adversarial-exceptions.ts';
import { loadAgentRegistration } from './validate-adversarial-agent-registry.ts';

type JsonObject = Record<string, unknown>;

interface PublisherConfig {
  version: string;
  artifactVersion: string;
  manifestVersion: string;
  checkNamePrefix: string;
  githubApiVersion: string;
  retentionDays: number;
  limits: {
    maxAnnotationsPerRequest: number;
    maxAnnotationsTotal: number;
    maxAnnotationTitleCharacters: number;
    maxAnnotationMessageBytes: number;
    maxAnnotationDetailsBytes: number;
    maxCheckSummaryBytes: number;
    maxCheckTextBytes: number;
  };
}

interface CalibrationAttribution {
  reportSha256: string;
  fingerprintSha256: string;
  policyVersion: string;
  calibratedAt: string;
}

interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'failure' | 'warning';
  title: string;
  message: string;
  raw_details: string;
}

interface CheckOutput {
  title: string;
  summary: string;
  text: string;
  annotations?: CheckAnnotation[];
}

interface CheckRunRequest {
  name: string;
  head_sha?: string;
  external_id: string;
  status: 'completed';
  conclusion: 'success' | 'neutral' | 'failure';
  started_at: string;
  completed_at: string;
  output: CheckOutput;
}

interface PublishedCheckMetadata {
  version: '1.0.0';
  runFingerprint: string;
  findingFingerprints: string[];
  supersededFindingFingerprints: string[];
}

interface CheckRunRecord {
  id: number;
  name: string;
  headSha: string;
  externalId: string | null;
  metadata?: PublishedCheckMetadata;
}

interface GitHubChecksTransport {
  listCheckRuns(repository: string, headSha: string, checkName: string): Promise<CheckRunRecord[]>;
  createCheckRun(repository: string, request: CheckRunRequest): Promise<CheckRunRecord>;
  updateCheckRun(repository: string, checkRunId: number, request: CheckRunRequest): Promise<CheckRunRecord>;
}

interface EvidenceManifest extends JsonObject {
  manifestVersion: string;
  publisherVersion: string;
  artifactFile: string;
  artifactSha256: string;
  artifactBytes: number;
  checkRunId: number;
  checkName: string;
  repository: string;
  issueNumber: number;
  pullRequestNumber: number;
  headSha: string;
  agentName: string;
  runFingerprint: string;
  findingFingerprints: string[];
  supersedesRunFingerprint: string | null;
  supersededFindingFingerprints: string[];
  publishedAt: string;
  retention: JsonObject;
}

interface PublishOptions {
  repoRoot: string;
  repository: string;
  issueNumber: number;
  pullRequestNumber: number;
  headSha: string;
  result: unknown;
  calibration: CalibrationAttribution;
  outputDirectory: string;
  transport: GitHubChecksTransport;
  previousManifest?: unknown;
  exceptionBundle?: unknown;
  now?: () => Date;
}

interface PublicationResult {
  checkRunId: number;
  checkName: string;
  conclusion: 'success' | 'neutral' | 'failure';
  created: boolean;
  annotationCount: number;
  annotationBatchSizes: number[];
  runFingerprint: string;
  findingFingerprints: string[];
  supersedesRunFingerprint: string | null;
  supersededFindingFingerprints: string[];
  artifactPath: string;
  manifestPath: string;
}

const METADATA_PREFIX = '<!-- adversarial-publication:';
const METADATA_SUFFIX = ' -->';
const SENSITIVE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(api[_-]?key|client[_-]?secret|password)\s*[:=]\s*["']?[^\s"',;]{8,}/gi,
];

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseJsonObject(filePath: string): JsonObject {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(parsed)) throw new Error(`${filePath} must contain a JSON object`);
  return parsed;
}

function loadPublisherConfig(repoRoot: string): PublisherConfig {
  const config = parseJsonObject(
    path.join(repoRoot, 'config/adversarial-agents/github-publisher.json'),
  ) as unknown as PublisherConfig;
  if (
    config.version !== '1.0.0' ||
    config.artifactVersion !== '1.0.0' ||
    config.manifestVersion !== '1.0.0' ||
    config.limits.maxAnnotationsPerRequest !== 50 ||
    config.limits.maxAnnotationsTotal > 1000 ||
    config.limits.maxCheckSummaryBytes > 65535 ||
    config.limits.maxCheckTextBytes > 65535 ||
    config.retentionDays < 1
  ) {
    throw new Error('GitHub publisher configuration is invalid or exceeds reviewed limits');
  }
  return config;
}

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Repository must use owner/name format');
  }
}

function validateSha(value: string, field: string): void {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`${field} must be a full lowercase commit SHA`);
}

function validateCalibration(value: CalibrationAttribution): void {
  if (
    !isObject(value) ||
    !/^[a-f0-9]{64}$/.test(String(value.reportSha256)) ||
    !/^[a-f0-9]{64}$/.test(String(value.fingerprintSha256)) ||
    !/^\d+\.\d+\.\d+$/.test(String(value.policyVersion)) ||
    typeof value.calibratedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.calibratedAt))
  ) {
    throw new Error('Calibration attribution is incomplete or invalid');
  }
}

function redactString(value: string): { value: string; redactions: number } {
  let redacted = value;
  let redactions = 0;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, () => {
      redactions += 1;
      return '[REDACTED:SENSITIVE_CONTENT]';
    });
  }
  return { value: redacted, redactions };
}

function redactSensitiveContent(value: unknown): { value: unknown; redactions: number } {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) {
    let redactions = 0;
    const sanitized = value.map((item) => {
      const result = redactSensitiveContent(item);
      redactions += result.redactions;
      return result.value;
    });
    return { value: sanitized, redactions };
  }
  if (isObject(value)) {
    let redactions = 0;
    const sanitized = Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const result = redactSensitiveContent(item);
        redactions += result.redactions;
        return [key, result.value];
      }),
    );
    return { value: sanitized, redactions };
  }
  return { value, redactions: 0 };
}

function containsSensitiveContent(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function findingFingerprint(value: unknown): string {
  if (!isObject(value)) return sha256(stableStringify(value));
  return sha256(stableStringify(Object.fromEntries(Object.entries(value).filter(([property]) => property !== 'id'))));
}

function deduplicateFindings(findings: unknown[]): Array<{ finding: JsonObject; fingerprint: string }> {
  const entries = findings
    .filter(isObject)
    .map((finding) => ({ finding, fingerprint: findingFingerprint(finding) }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const seen = new Set<string>();
  return entries.filter(({ fingerprint }) => {
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function utf8Truncate(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const suffix = '…';
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle) + suffix) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return value.slice(0, low) + suffix;
}

function validateCitation(citation: JsonObject): void {
  const citationPath = citation.path;
  const startLine = citation.startLine;
  const endLine = citation.endLine;
  if (
    typeof citationPath !== 'string' ||
    citationPath.startsWith('/') ||
    citationPath.includes('\\') ||
    citationPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('Finding citation paths must be safe repository-relative paths');
  }
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    Number(startLine) < 1 ||
    Number(endLine) < Number(startLine) ||
    Number(endLine) > 2147483647
  ) {
    throw new Error('Finding citation lines are outside GitHub annotation limits');
  }
}

function primaryCitation(finding: JsonObject): JsonObject {
  const citations = isObject(finding.citations) ? finding.citations : {};
  const testFiles = Array.isArray(citations.testFiles) ? citations.testFiles : [];
  const productionFiles = Array.isArray(citations.productionFiles) ? citations.productionFiles : [];
  const allCitations = [...testFiles, ...productionFiles];
  for (const citation of allCitations) {
    if (!isObject(citation)) throw new Error('Finding citation must be an object');
    validateCitation(citation);
  }
  const primary = allCitations.find(isObject);
  if (!primary) throw new Error('Finding must contain an exact GitHub annotation citation');
  return primary;
}

function findingAnnotation(finding: JsonObject, config: PublisherConfig, excepted: boolean): CheckAnnotation {
  const citation = primaryCitation(finding);
  const blocking = finding.severity === 'BLOCKING' && finding.confidence === 'HIGH';
  return {
    path: String(citation.path),
    start_line: Number(citation.startLine),
    end_line: Number(citation.endLine),
    annotation_level: blocking && !excepted ? 'failure' : 'warning',
    title: String(finding.title).slice(0, config.limits.maxAnnotationTitleCharacters),
    message: utf8Truncate(
      `${String(finding.description)} Suggested test: ${String(finding.suggestedTest)}`,
      config.limits.maxAnnotationMessageBytes,
    ),
    raw_details: utf8Truncate(
      `Missing scenario: ${String(finding.missingScenario)}\nExpected failure signal: ${String(
        finding.expectedFailureSignal,
      )}`,
      config.limits.maxAnnotationDetailsBytes,
    ),
  };
}

function encodeMetadata(metadata: PublishedCheckMetadata): string {
  return `${METADATA_PREFIX}${Buffer.from(stableStringify(metadata)).toString('base64url')}${METADATA_SUFFIX}`;
}

function decodeMetadata(text: unknown): PublishedCheckMetadata | undefined {
  if (typeof text !== 'string') return undefined;
  const start = text.indexOf(METADATA_PREFIX);
  const end = text.indexOf(METADATA_SUFFIX, start + METADATA_PREFIX.length);
  if (start < 0 || end < 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(text.slice(start + METADATA_PREFIX.length, end), 'base64url').toString('utf8'),
    );
    if (
      !isObject(parsed) ||
      parsed.version !== '1.0.0' ||
      typeof parsed.runFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(parsed.runFingerprint) ||
      !Array.isArray(parsed.findingFingerprints) ||
      parsed.findingFingerprints.some(
        (fingerprint) => typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint),
      ) ||
      stableStringify(parsed.findingFingerprints) !==
        stableStringify([...new Set(parsed.findingFingerprints)].sort()) ||
      !Array.isArray(parsed.supersededFindingFingerprints) ||
      parsed.supersededFindingFingerprints.some(
        (fingerprint) => typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint),
      ) ||
      stableStringify(parsed.supersededFindingFingerprints) !==
        stableStringify([...new Set(parsed.supersededFindingFingerprints)].sort())
    ) {
      return undefined;
    }
    return parsed as unknown as PublishedCheckMetadata;
  } catch {
    return undefined;
  }
}

function conclusionFor(result: JsonObject, exceptions: ExceptionEvaluation): 'success' | 'neutral' | 'failure' {
  const verdict = isObject(result.verdict) ? result.verdict : {};
  if (verdict.decision === 'ERROR' || exceptions.unexceptedBlockingFindingFingerprints.length > 0) {
    return 'failure';
  }
  return verdict.severity === 'ADVISORY' || exceptions.applications.length > 0 ? 'neutral' : 'success';
}

function checkSummary(result: JsonObject, findingCount: number, exceptions: ExceptionEvaluation): string {
  const verdict = isObject(result.verdict) ? result.verdict : {};
  return [
    `Decision: **${String(verdict.decision)}** (${String(verdict.severity)}).`,
    `${findingCount} unique actionable finding(s).`,
    `${exceptions.applications.length} exact, audited exception(s) applied; ${exceptions.unexceptedBlockingFindingFingerprints.length} blocking finding(s) remain.`,
    String(verdict.policyDecisionRationale),
    'The retained JSON artifact is the authoritative complete evidence.',
  ].join(' ');
}

function expirationDate(publishedAt: Date, retentionDays: number): string {
  return new Date(publishedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function validatePreviousManifest(
  value: unknown,
  options: {
    repository: string;
    issueNumber: number;
    pullRequestNumber: number;
    headSha: string;
    agentName: string;
  },
): EvidenceManifest | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('Previous evidence manifest must be an object');
  if (
    value.manifestVersion !== '1.0.0' ||
    value.repository !== options.repository ||
    value.issueNumber !== options.issueNumber ||
    value.pullRequestNumber !== options.pullRequestNumber ||
    value.headSha !== options.headSha ||
    value.agentName !== options.agentName ||
    typeof value.runFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.runFingerprint) ||
    !Array.isArray(value.findingFingerprints) ||
    value.findingFingerprints.some(
      (fingerprint) => typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint),
    ) ||
    stableStringify(value.findingFingerprints) !== stableStringify([...new Set(value.findingFingerprints)].sort())
  ) {
    throw new Error('Previous evidence manifest does not match this agent and head SHA');
  }
  return value as EvidenceManifest;
}

function validateOutputDirectory(repoRoot: string, outputDirectory: string): string {
  const resolvedOutput = path.resolve(outputDirectory);
  const resolvedRoot = path.resolve(repoRoot);
  if (resolvedOutput !== resolvedRoot && !resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Evidence output directory must remain within the repository workspace');
  }
  return resolvedOutput;
}

async function prepareOutputDirectory(repoRoot: string, outputDirectory: string): Promise<string> {
  const resolvedOutput = validateOutputDirectory(repoRoot, outputDirectory);
  await fs.promises.mkdir(resolvedOutput, { recursive: true });
  const [realOutputDirectory, realRepoRoot] = await Promise.all([
    fs.promises.realpath(resolvedOutput),
    fs.promises.realpath(repoRoot),
  ]);
  if (realOutputDirectory !== realRepoRoot && !realOutputDirectory.startsWith(`${realRepoRoot}${path.sep}`)) {
    throw new Error('Evidence output directory must not escape through a symbolic link');
  }
  return resolvedOutput;
}

async function writeEvidenceBundle(options: {
  repoRoot: string;
  outputDirectory: string;
  config: PublisherConfig;
  checkRunId: number;
  checkName: string;
  repository: string;
  issueNumber: number;
  pullRequestNumber: number;
  headSha: string;
  agentName: string;
  runFingerprint: string;
  findingFingerprints: string[];
  supersedesRunFingerprint: string | null;
  supersededFindingFingerprints: string[];
  publishedAt: Date;
  calibration: CalibrationAttribution;
  sanitizedResult: JsonObject;
  exceptionEvaluation: ExceptionEvaluation;
  redactionCount: number;
}): Promise<{ artifactPath: string; manifestPath: string; manifest: EvidenceManifest }> {
  const outputDirectory = await prepareOutputDirectory(options.repoRoot, options.outputDirectory);
  const artifactFile = `${options.agentName}-${options.headSha}-${options.runFingerprint}.evidence.json`;
  const manifestFile = `${options.agentName}-${options.headSha}.manifest.json`;
  const artifactPath = path.join(outputDirectory, artifactFile);
  const manifestPath = path.join(outputDirectory, manifestFile);
  const attribution = options.sanitizedResult.attribution as JsonObject;
  const summary = isObject(options.sanitizedResult.summary) ? options.sanitizedResult.summary : {};
  const artifact = {
    artifactVersion: options.config.artifactVersion,
    publisherVersion: options.config.version,
    retention: {
      policy: 'github-actions-artifact',
      days: options.config.retentionDays,
      expiresAt: expirationDate(options.publishedAt, options.config.retentionDays),
      classification: 'NON_SENSITIVE_ENGINEERING_EVIDENCE',
      containsSensitiveContent: false,
      redactionCount: options.redactionCount,
    },
    attribution: {
      issueNumber: options.issueNumber,
      pullRequestNumber: options.pullRequestNumber,
      repository: options.repository,
      headSha: options.headSha,
      agentName: attribution.agentName,
      agentVersion: attribution.agentVersion,
      modelDeployment: attribution.modelDeployment,
      promptVersion: attribution.promptVersion,
      promptContentHash: attribution.promptContentHash,
      schemaVersion: options.sanitizedResult.schemaVersion,
      policyVersion: attribution.policyVersion,
      toolsVersion: attribution.toolsVersion,
      calibration: options.calibration,
      reviewedAt: attribution.timestamp,
      publishedAt: options.publishedAt.toISOString(),
      tokensUsed: summary.tokensUsed ?? 0,
      estimatedCostUsd: summary.estimatedCost ?? 0,
      latencyMs: summary.reviewDurationMs ?? 0,
      runFingerprint: options.runFingerprint,
      findingFingerprints: options.findingFingerprints,
      supersedesRunFingerprint: options.supersedesRunFingerprint,
      supersededFindingFingerprints: options.supersededFindingFingerprints,
    },
    exceptions: options.exceptionEvaluation,
    result: options.sanitizedResult,
  };
  const artifactContent = `${stableStringify(artifact, 2)}\n`;
  const artifactHash = sha256(artifactContent);
  const manifest: EvidenceManifest = {
    manifestVersion: options.config.manifestVersion,
    publisherVersion: options.config.version,
    artifactFile,
    artifactSha256: artifactHash,
    artifactBytes: Buffer.byteLength(artifactContent),
    checkRunId: options.checkRunId,
    checkName: options.checkName,
    repository: options.repository,
    issueNumber: options.issueNumber,
    pullRequestNumber: options.pullRequestNumber,
    headSha: options.headSha,
    agentName: options.agentName,
    runFingerprint: options.runFingerprint,
    findingFingerprints: options.findingFingerprints,
    supersedesRunFingerprint: options.supersedesRunFingerprint,
    supersededFindingFingerprints: options.supersededFindingFingerprints,
    publishedAt: options.publishedAt.toISOString(),
    retention: artifact.retention,
  };
  const manifestContent = `${stableStringify(manifest, 2)}\n`;
  if (containsSensitiveContent(`${artifactContent}\n${manifestContent}`)) {
    throw new Error('Sensitive content remained after evidence redaction');
  }
  await fs.promises.writeFile(artifactPath, artifactContent, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.writeFile(manifestPath, manifestContent, { encoding: 'utf8', mode: 0o600 });
  return { artifactPath, manifestPath, manifest };
}

async function validateEvidenceManifest(
  repoRoot: string,
  manifestPath: string,
): Promise<{ valid: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  let manifest: JsonObject;
  try {
    manifest = parseJsonObject(manifestPath);
  } catch {
    return { valid: false, reasons: ['Evidence manifest is missing or invalid JSON.'] };
  }
  const artifactFile = manifest.artifactFile;
  if (
    manifest.manifestVersion !== '1.0.0' ||
    typeof artifactFile !== 'string' ||
    path.basename(artifactFile) !== artifactFile
  ) {
    return { valid: false, reasons: ['Evidence manifest structure is invalid.'] };
  }
  const artifactPath = path.join(path.dirname(manifestPath), artifactFile);
  let artifactContent: string;
  try {
    artifactContent = await fs.promises.readFile(artifactPath, 'utf8');
  } catch {
    return { valid: false, reasons: ['Evidence artifact is missing.'] };
  }
  if (manifest.artifactSha256 !== sha256(artifactContent)) reasons.push('Evidence artifact hash mismatch.');
  if (manifest.artifactBytes !== Buffer.byteLength(artifactContent)) reasons.push('Evidence artifact size mismatch.');
  let artifact: JsonObject | undefined;
  try {
    const parsed: unknown = JSON.parse(artifactContent);
    if (isObject(parsed)) artifact = parsed;
  } catch {
    // Reported below.
  }
  if (!artifact || !isObject(artifact.result)) {
    reasons.push('Evidence artifact structure is invalid.');
  } else {
    const resultAttribution = isObject(artifact.result.attribution) ? artifact.result.attribution : {};
    try {
      const validation = new AdversarialFindingValidator(repoRoot, String(resultAttribution.agentName ?? '')).validate(
        artifact.result,
      );
      if (!validation.valid) reasons.push('Evidence artifact result is not valid reviewer output.');
    } catch {
      reasons.push('Evidence artifact agent registration is invalid.');
    }
    if (stableStringify(artifact.retention) !== stableStringify(manifest.retention)) {
      reasons.push('Evidence retention metadata does not match its manifest.');
    }
    const attribution = isObject(artifact.attribution) ? artifact.attribution : {};
    const retention = isObject(artifact.retention) ? artifact.retention : {};
    const exceptions = isObject(artifact.exceptions) ? artifact.exceptions : {};
    const expectedManifestValues: Array<[string, unknown]> = [
      ['repository', attribution.repository],
      ['issueNumber', attribution.issueNumber],
      ['pullRequestNumber', attribution.pullRequestNumber],
      ['headSha', attribution.headSha],
      ['agentName', attribution.agentName],
      ['runFingerprint', attribution.runFingerprint],
      ['findingFingerprints', attribution.findingFingerprints],
      ['supersedesRunFingerprint', attribution.supersedesRunFingerprint],
      ['supersededFindingFingerprints', attribution.supersededFindingFingerprints],
      ['publishedAt', attribution.publishedAt],
    ];
    if (
      artifact.artifactVersion !== '1.0.0' ||
      artifact.publisherVersion !== manifest.publisherVersion ||
      retention.containsSensitiveContent !== false ||
      retention.classification !== 'NON_SENSITIVE_ENGINEERING_EVIDENCE' ||
      !Number.isInteger(retention.days) ||
      Number(retention.days) < 1 ||
      typeof retention.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(retention.expiresAt))
    ) {
      reasons.push('Evidence artifact retention or version metadata is invalid.');
    }
    if (
      exceptions.version !== '1.0.0' ||
      exceptions.agentName !== attribution.agentName ||
      exceptions.agentVersion !== attribution.agentVersion ||
      exceptions.repository !== attribution.repository ||
      exceptions.headSha !== attribution.headSha ||
      exceptions.runFingerprint !== attribution.runFingerprint ||
      !Array.isArray(exceptions.applications) ||
      !Array.isArray(exceptions.applicationFingerprints) ||
      !Array.isArray(exceptions.exceptedFindingFingerprints) ||
      !Array.isArray(exceptions.unexceptedBlockingFindingFingerprints) ||
      new Set(exceptions.applicationFingerprints).size !== exceptions.applicationFingerprints.length ||
      new Set(exceptions.exceptedFindingFingerprints).size !== exceptions.exceptedFindingFingerprints.length
    ) {
      reasons.push('Evidence exception attribution or audit metadata is invalid.');
    }
    if (
      expectedManifestValues.some(
        ([property, expected]) => stableStringify(manifest[property]) !== stableStringify(expected),
      )
    ) {
      reasons.push('Evidence manifest attribution does not match its artifact.');
    }
    if (
      typeof manifest.runFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(manifest.runFingerprint) ||
      artifactFile !==
        `${String(manifest.agentName)}-${String(manifest.headSha)}-${manifest.runFingerprint}.evidence.json`
    ) {
      reasons.push('Evidence artifact filename or run fingerprint is invalid.');
    }
  }
  if (containsSensitiveContent(`${artifactContent}\n${stableStringify(manifest)}`)) {
    reasons.push('Evidence contains sensitive content.');
  }
  return { valid: reasons.length === 0, reasons };
}

async function publishAdversarialEvidence(options: PublishOptions): Promise<PublicationResult> {
  validateRepository(options.repository);
  validateSha(options.headSha, 'headSha');
  if (!Number.isInteger(options.issueNumber) || options.issueNumber < 1) {
    throw new Error('issueNumber must be a positive integer');
  }
  if (!Number.isInteger(options.pullRequestNumber) || options.pullRequestNumber < 1) {
    throw new Error('pullRequestNumber must be a positive integer');
  }
  validateCalibration(options.calibration);
  const config = loadPublisherConfig(options.repoRoot);
  const sanitized = redactSensitiveContent(options.result);
  if (!isObject(sanitized.value)) throw new Error('Reviewer output is missing');
  const sanitizedResult = sanitized.value;
  const selectedAttribution = isObject(sanitizedResult.attribution) ? sanitizedResult.attribution : {};
  const validation = new AdversarialFindingValidator(
    options.repoRoot,
    String(selectedAttribution.agentName ?? ''),
  ).validate(sanitizedResult);
  if (!validation.valid) {
    throw new Error(`Reviewer output is invalid: ${validation.errors.map((error) => error.field).join(', ')}`);
  }
  const attribution = sanitizedResult.attribution as JsonObject;
  const summary = isObject(sanitizedResult.summary) ? sanitizedResult.summary : {};
  const verdict = isObject(sanitizedResult.verdict) ? sanitizedResult.verdict : {};
  if (
    attribution.repositoryCommit !== options.headSha ||
    (verdict.decision !== 'ERROR' &&
      (summary.pullRequestCommit !== options.headSha || !Number.isInteger(summary.pullRequestNumber))) ||
    (Number.isInteger(summary.pullRequestNumber) && summary.pullRequestNumber !== options.pullRequestNumber)
  ) {
    throw new Error('Reviewer output does not match the requested pull-request head SHA');
  }
  const agentName = String(attribution.agentName);
  const registration = loadAgentRegistration(options.repoRoot, agentName);
  const checkName = registration.checkName;
  if (checkName !== `${config.checkNamePrefix} / ${agentName}`) {
    throw new Error('Agent check registration does not match the publisher namespace');
  }
  const checkExternalId = sha256(`${config.version}\n${options.repository}\n${agentName}\n${options.headSha}`);
  const uniqueFindings = deduplicateFindings(Array.isArray(sanitizedResult.findings) ? sanitizedResult.findings : []);
  if (uniqueFindings.length > config.limits.maxAnnotationsTotal) {
    throw new Error('Validated findings exceed the reviewed GitHub annotation limit');
  }
  const runFingerprint = sha256(stableStringify(sanitizedResult));
  const publishedAt = options.now?.() ?? new Date();
  if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() < Date.parse(String(attribution.timestamp))) {
    throw new Error('Publication timestamp is invalid or precedes the reviewed result');
  }
  const exceptionBundle =
    options.exceptionBundle ??
    parseJsonObject(path.join(options.repoRoot, 'config/adversarial-agents/exceptions.json'));
  const exceptionEvaluation = evaluateAdversarialExceptions({
    repoRoot: options.repoRoot,
    repository: options.repository,
    issueNumber: options.issueNumber,
    headSha: options.headSha,
    result: sanitizedResult,
    bundle: exceptionBundle,
    now: () => publishedAt,
  });
  const exceptedFingerprints = new Set(exceptionEvaluation.exceptedFindingFingerprints);
  const findingFingerprints = uniqueFindings.map(({ fingerprint }) => fingerprint);
  const annotationsByFingerprint = new Map(
    uniqueFindings.map(({ finding, fingerprint }) => [
      fingerprint,
      findingAnnotation(finding, config, exceptedFingerprints.has(fingerprint)),
    ]),
  );
  await prepareOutputDirectory(options.repoRoot, options.outputDirectory);
  const existingRuns = await options.transport.listCheckRuns(options.repository, options.headSha, checkName);
  if (existingRuns.length > 1) {
    throw new Error('Multiple check runs already exist for this agent and head SHA');
  }
  const existing = existingRuns[0];
  if (
    existing &&
    (existing.name !== checkName || existing.headSha !== options.headSha || existing.externalId !== checkExternalId)
  ) {
    throw new Error('Existing check run attribution does not match this agent and head SHA');
  }
  const previousManifest = validatePreviousManifest(options.previousManifest, {
    repository: options.repository,
    issueNumber: options.issueNumber,
    pullRequestNumber: options.pullRequestNumber,
    headSha: options.headSha,
    agentName,
  });
  const previousMetadata = existing?.metadata;
  if (existing && !previousMetadata && !previousManifest) {
    throw new Error('Existing check run lacks trusted finding deduplication metadata');
  }
  const priorFingerprintCandidate = previousManifest?.runFingerprint ?? previousMetadata?.runFingerprint ?? null;
  const priorRunFingerprint = priorFingerprintCandidate === runFingerprint ? null : priorFingerprintCandidate;
  const previouslyPublishedFindings = new Set([
    ...(previousManifest?.findingFingerprints ?? []),
    ...(previousMetadata?.findingFingerprints ?? []),
  ]);
  const supersededFindingFingerprints = [...previouslyPublishedFindings]
    .filter((fingerprint) => !findingFingerprints.includes(fingerprint))
    .sort();
  const annotations = uniqueFindings
    .filter(({ fingerprint }) => !previouslyPublishedFindings.has(fingerprint))
    .map(({ fingerprint }) => annotationsByFingerprint.get(fingerprint))
    .filter((annotation): annotation is CheckAnnotation => annotation !== undefined);
  const annotationBatches: CheckAnnotation[][] = [];
  for (let index = 0; index < annotations.length; index += config.limits.maxAnnotationsPerRequest) {
    annotationBatches.push(annotations.slice(index, index + config.limits.maxAnnotationsPerRequest));
  }
  const conclusion = conclusionFor(sanitizedResult, exceptionEvaluation);
  const metadata: PublishedCheckMetadata = {
    version: '1.0.0',
    runFingerprint,
    findingFingerprints,
    supersededFindingFingerprints,
  };
  const output: CheckOutput = {
    title:
      conclusion === 'failure'
        ? 'Adversarial review requires action'
        : conclusion === 'neutral'
          ? 'Adversarial review has advisory findings'
          : 'Adversarial review passed',
    summary: utf8Truncate(
      checkSummary(sanitizedResult, uniqueFindings.length, exceptionEvaluation),
      config.limits.maxCheckSummaryBytes,
    ),
    text: utf8Truncate(
      [
        `Issue: #${options.issueNumber}`,
        `Head SHA: \`${options.headSha}\``,
        `Run fingerprint: \`${runFingerprint}\``,
        priorRunFingerprint ? `Supersedes run: \`${priorRunFingerprint}\`` : 'Supersedes run: none',
        `${supersededFindingFingerprints.length} prior finding(s) superseded.`,
        `${exceptionEvaluation.applicationFingerprints.length} audited exception application(s).`,
        encodeMetadata(metadata),
      ].join('\n\n'),
      config.limits.maxCheckTextBytes,
    ),
  };
  const requestBase: CheckRunRequest = {
    name: checkName,
    external_id: checkExternalId,
    status: 'completed',
    conclusion,
    started_at: String(attribution.timestamp),
    completed_at: publishedAt.toISOString(),
    output,
  };
  let checkRun: CheckRunRecord;
  let created = false;
  const firstBatch = annotationBatches.shift();
  if (existing) {
    checkRun = await options.transport.updateCheckRun(options.repository, existing.id, {
      ...requestBase,
      output: { ...output, ...(firstBatch ? { annotations: firstBatch } : {}) },
    });
  } else {
    created = true;
    checkRun = await options.transport.createCheckRun(options.repository, {
      ...requestBase,
      head_sha: options.headSha,
      output: { ...output, ...(firstBatch ? { annotations: firstBatch } : {}) },
    });
  }
  const validatePublishedCheck = (record: CheckRunRecord): void => {
    if (record.headSha !== options.headSha || record.name !== checkName || record.externalId !== checkExternalId) {
      throw new Error('GitHub returned a check run for stale or mismatched attribution');
    }
  };
  validatePublishedCheck(checkRun);
  for (const batch of annotationBatches) {
    const updated = await options.transport.updateCheckRun(options.repository, checkRun.id, {
      ...requestBase,
      output: { ...output, annotations: batch },
    });
    validatePublishedCheck(updated);
  }
  const bundle = await writeEvidenceBundle({
    repoRoot: options.repoRoot,
    outputDirectory: options.outputDirectory,
    config,
    checkRunId: checkRun.id,
    checkName,
    repository: options.repository,
    issueNumber: options.issueNumber,
    pullRequestNumber: options.pullRequestNumber,
    headSha: options.headSha,
    agentName,
    runFingerprint,
    findingFingerprints,
    supersedesRunFingerprint: priorRunFingerprint,
    supersededFindingFingerprints,
    publishedAt,
    calibration: options.calibration,
    sanitizedResult,
    exceptionEvaluation,
    redactionCount: sanitized.redactions,
  });
  const bundleValidation = await validateEvidenceManifest(options.repoRoot, bundle.manifestPath);
  if (!bundleValidation.valid) {
    throw new Error(`Written evidence bundle failed validation: ${bundleValidation.reasons.join(' ')}`);
  }
  return {
    checkRunId: checkRun.id,
    checkName,
    conclusion,
    created,
    annotationCount: annotations.length,
    annotationBatchSizes: [
      ...(firstBatch ? [firstBatch.length] : []),
      ...annotationBatches.map((batch) => batch.length),
    ],
    runFingerprint,
    findingFingerprints,
    supersedesRunFingerprint: priorRunFingerprint,
    supersededFindingFingerprints,
    artifactPath: bundle.artifactPath,
    manifestPath: bundle.manifestPath,
  };
}

class GitHubRestChecksTransport implements GitHubChecksTransport {
  private readonly token: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly apiVersion: string;

  constructor(token: string, options: { fetchImplementation?: typeof fetch; apiVersion?: string } = {}) {
    if (!token.trim()) throw new Error('A GitHub App installation token is required');
    this.token = token;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.apiVersion = options.apiVersion ?? '2022-11-28';
  }

  private async request(method: string, url: string, body?: unknown): Promise<JsonObject> {
    const response = await this.fetchImplementation(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': this.apiVersion,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub Checks API request failed with HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isObject(value)) throw new Error('GitHub Checks API returned an invalid response');
    return value;
  }

  private record(value: unknown): CheckRunRecord {
    if (!isObject(value) || !Number.isInteger(value.id) || typeof value.name !== 'string') {
      throw new Error('GitHub Checks API returned an invalid check run');
    }
    const output = isObject(value.output) ? value.output : {};
    return {
      id: Number(value.id),
      name: value.name,
      headSha: String(value.head_sha ?? ''),
      externalId: typeof value.external_id === 'string' ? value.external_id : null,
      metadata: decodeMetadata(output.text),
    };
  }

  async listCheckRuns(repository: string, headSha: string, checkName: string): Promise<CheckRunRecord[]> {
    validateRepository(repository);
    validateSha(headSha, 'headSha');
    const [owner, repo] = repository.split('/');
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/commits/${headSha}/check-runs`,
    );
    url.searchParams.set('check_name', checkName);
    url.searchParams.set('filter', 'all');
    url.searchParams.set('per_page', '100');
    const response = await this.request('GET', url.toString());
    if (!Array.isArray(response.check_runs)) throw new Error('GitHub Checks API returned no check run list');
    if (Number(response.total_count) > 1) {
      throw new Error('Multiple check runs already exist for this agent and head SHA');
    }
    return response.check_runs.map((value) => this.record(value));
  }

  async createCheckRun(repository: string, request: CheckRunRequest): Promise<CheckRunRecord> {
    const [owner, repo] = repository.split('/');
    const response = await this.request(
      'POST',
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`,
      request,
    );
    return this.record(response);
  }

  async updateCheckRun(repository: string, checkRunId: number, request: CheckRunRequest): Promise<CheckRunRecord> {
    const [owner, repo] = repository.split('/');
    const response = await this.request(
      'PATCH',
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs/${checkRunId}`,
      request,
    );
    return this.record(response);
  }
}

function parseArguments(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key ?? '<missing>'}`);
    args[key.slice(2)] = value;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? '.');
  for (const required of [
    'result',
    'repository',
    'issue',
    'pull-request',
    'head',
    'output-dir',
    'calibration-report',
  ]) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  const result = parseJsonObject(path.resolve(args.result));
  const exceptionBundle = args.exceptions
    ? parseJsonObject(path.resolve(args.exceptions))
    : parseJsonObject(path.join(repoRoot, 'config/adversarial-agents/exceptions.json'));
  const calibrationReport = parseJsonObject(path.resolve(args['calibration-report']));
  const calibrationValidation = validatePromotionReport(repoRoot, calibrationReport);
  if (!calibrationValidation.promotable) {
    throw new Error(`Calibration report is not promotable: ${calibrationValidation.reasons.join(' ')}`);
  }
  const fingerprint = isObject(calibrationReport.calibrationFingerprint)
    ? calibrationReport.calibrationFingerprint
    : {};
  const calibration: CalibrationAttribution = {
    reportSha256: String(calibrationReport.reportSha256 ?? ''),
    fingerprintSha256: String(fingerprint.sha256 ?? ''),
    policyVersion: String(calibrationReport.promotionPolicyVersion ?? ''),
    calibratedAt: String(calibrationReport.generatedAt ?? ''),
  };
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for live GitHub publication');
  const config = loadPublisherConfig(repoRoot);
  const publication = await publishAdversarialEvidence({
    repoRoot,
    repository: args.repository,
    issueNumber: Number(args.issue),
    pullRequestNumber: Number(args['pull-request']),
    headSha: args.head,
    result,
    calibration,
    outputDirectory: path.resolve(args['output-dir']),
    transport: new GitHubRestChecksTransport(token, { apiVersion: config.githubApiVersion }),
    previousManifest: args['previous-manifest'] ? parseJsonObject(path.resolve(args['previous-manifest'])) : undefined,
    exceptionBundle,
  });
  console.log(stableStringify(publication, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  GitHubRestChecksTransport,
  decodeMetadata,
  findingFingerprint,
  publishAdversarialEvidence,
  validateEvidenceManifest,
};
export type {
  CalibrationAttribution,
  CheckRunRecord,
  CheckRunRequest,
  EvidenceManifest,
  GitHubChecksTransport,
  PublicationResult,
};
