#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from './collect-adversarial-context.ts';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

type JsonObject = Record<string, unknown>;

interface CalibrationAttestationPolicy {
  version: string;
  predicateType: string;
  digestAlgorithm: 'sha256';
  minimumGitHubCliVersion: string;
  attestationAction: {
    repository: string;
    version: string;
    commit: string;
  };
  repository: {
    nameWithOwner: string;
    ownerId: string;
    repositoryId: string;
    visibility: string;
    protectedRef: string;
  };
  trustedBuilder: {
    workflowName: string;
    workflowPath: string;
    signerWorkflow: string;
    subjectAlternativeName: string;
    environment: string;
    event: string;
    runnerEnvironment: string;
    oidcIssuer: string;
    workloadIdentitySubject: string;
  };
  azureDeployment: {
    subscriptionId: string;
    resourceId: string;
    endpoint: string;
    deploymentId: string;
    modelName: string;
    modelVersion: string;
    modelSku: string;
    region: string;
    credentialScope: string;
  };
  freshness: {
    maximumAttestationAgeSeconds: number;
    maximumClockSkewSeconds: number;
    maximumWorkflowDurationSeconds: number;
  };
  requiredReportFingerprintComponents: string[];
}

interface AttestationRunContext {
  agentName: string;
  reportPath: string;
  artifactId: string;
  artifactName: string;
  artifactDigest: string;
  repository: string;
  repositoryId: string;
  repositoryOwnerId: string;
  ref: string;
  headSha: string;
  workflowName: string;
  workflowPath: string;
  workflowRef: string;
  workflowSha: string;
  workflowStartedAt: string;
  runId: string;
  runAttempt: number;
  eventName: string;
  environment: string;
  azureTenantId: string;
  azureClientId: string;
  azureResourceId: string;
  azureEndpoint: string;
}

interface CreatePredicateOptions extends AttestationRunContext {
  repoRoot: string;
  attestedAt: string;
}

interface VerifyOptions extends AttestationRunContext {
  repoRoot: string;
  bundlePath: string;
  now?: string;
}

interface CommandResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

type CommandExecutor = (command: string, args: string[]) => CommandResult;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HEAD_SHA_PATTERN = /^[a-f0-9]{40}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const POLICY_PATH = 'config/adversarial-agents/gilfoyle-security-architect/calibration-attestation-policy.json';

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadJson(filePath: string): JsonObject {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value)) throw new Error(`${filePath} must contain a JSON object.`);
  return value;
}

function loadCalibrationAttestationPolicy(repoRoot: string): CalibrationAttestationPolicy {
  return loadJson(path.join(repoRoot, POLICY_PATH)) as unknown as CalibrationAttestationPolicy;
}

function parseIsoTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO timestamp.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a normalized ISO timestamp.`);
  }
  return parsed;
}

function normalizedDigest(value: string, label: string): string {
  const normalized = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a SHA-256 digest.`);
  return normalized;
}

function safeRepositoryPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

function repositoryFile(repoRoot: string, repositoryPath: unknown, label: string): string {
  if (!safeRepositoryPath(repositoryPath)) throw new Error(`${label} is not a safe repository path.`);
  return path.join(repoRoot, repositoryPath);
}

function fileHash(repoRoot: string, repositoryPath: unknown, label: string): string {
  return sha256(fs.readFileSync(repositoryFile(repoRoot, repositoryPath, label)));
}

function fileVersion(repoRoot: string, repositoryPath: unknown, label: string): string {
  const version = loadJson(repositoryFile(repoRoot, repositoryPath, label)).version;
  if (typeof version !== 'string' || version.length === 0) throw new Error(`${label} has no version.`);
  return version;
}

function registeredAgent(
  repoRoot: string,
  agentName: string,
): {
  registry: JsonObject;
  registration: JsonObject;
} {
  const registryPath = path.join(repoRoot, 'config/adversarial-agents/agents-config.json');
  const registry = loadJson(registryPath);
  const validation = validateAgentRegistry(repoRoot, registry);
  if (!validation.valid) {
    throw new Error(`Adversarial agent registry is invalid: ${validation.errors.join(' ')}`);
  }
  const registration = validation.agents.find((agent) => agent.name === agentName);
  if (!registration) throw new Error(`Adversarial agent is not registered: ${agentName}`);
  return { registry, registration };
}

function expectedReportFingerprintComponents(repoRoot: string, agentName: string): JsonObject {
  const { registration } = registeredAgent(repoRoot, agentName);
  const enginePath = repositoryFile(repoRoot, registration.engineConfigFile, 'engineConfigFile');
  const engine = loadJson(enginePath);
  const systemPolicyFile = engine.systemPolicyFile;
  if (!safeRepositoryPath(systemPolicyFile)) throw new Error('Reviewer system policy file is invalid.');
  return {
    modelDeployment: registration.modelDeployment,
    modelVersion: registration.modelVersion,
    promptVersion: registration.promptVersion,
    promptContentHash: registration.promptContentHash,
    toolsVersion: registration.toolsVersion,
    toolsConfigContentHash: registration.toolsConfigContentHash,
    contextConfigVersion: registration.contextConfigVersion,
    contextConfigContentHash: registration.contextConfigContentHash,
    schemaVersion: fileVersion(repoRoot, registration.schemaFile, 'schemaFile'),
    schemaContentHash: registration.schemaContentHash,
    policyVersion: fileVersion(repoRoot, registration.policyFile, 'policyFile'),
    policyContentHash: registration.policyContentHash,
    systemPolicyVersion: engine.systemPolicyVersion,
    systemPolicyContentHash: fileHash(repoRoot, systemPolicyFile, 'systemPolicyFile'),
    reviewerEngineConfigVersion: engine.version,
    reviewerEngineConfigContentHash: registration.engineConfigContentHash,
    benchmarkCorpusVersion: fileVersion(repoRoot, registration.benchmarkCorpusFile, 'benchmarkCorpusFile'),
    benchmarkCorpusContentHash: registration.benchmarkCorpusContentHash,
    promotionPolicyVersion: fileVersion(repoRoot, registration.promotionPolicyFile, 'promotionPolicyFile'),
    promotionPolicyContentHash: registration.promotionPolicyContentHash,
    architectureContentHash: sha256(fs.readFileSync(path.join(repoRoot, 'docs/architecture.md'))),
  };
}

function agentConfigurationFingerprint(repoRoot: string, agentName: string): JsonObject {
  const { registry, registration } = registeredAgent(repoRoot, agentName);
  const components = expectedReportFingerprintComponents(repoRoot, agentName);
  const value: JsonObject = {
    registryVersion: registry.registryVersion,
    agentName,
    agentVersion: registration.version,
    promptFile: registration.promptFile,
    toolsConfigFile: registration.toolsConfigFile,
    contextConfigFile: registration.contextConfigFile,
    schemaFile: registration.schemaFile,
    policyFile: registration.policyFile,
    engineConfigFile: registration.engineConfigFile,
    benchmarkCorpusFile: registration.benchmarkCorpusFile,
    promotionPolicyFile: registration.promotionPolicyFile,
    attestationPolicyFile: POLICY_PATH,
    attestationPolicySha256: sha256(fs.readFileSync(path.join(repoRoot, POLICY_PATH))),
    components,
  };
  return { ...value, sha256: sha256(stableStringify(value)) };
}

function benchmarkInputs(repoRoot: string, agentName: string): JsonObject {
  const { registration } = registeredAgent(repoRoot, agentName);
  const corpusPath = repositoryFile(repoRoot, registration.benchmarkCorpusFile, 'benchmarkCorpusFile');
  const corpus = loadJson(corpusPath);
  if (!Array.isArray(corpus.cases)) throw new Error('Benchmark corpus cases are malformed.');
  const caseIds = corpus.cases.map((candidate) => {
    if (!isObject(candidate) || typeof candidate.id !== 'string' || candidate.id.length === 0) {
      throw new Error('Benchmark corpus contains a case without an ID.');
    }
    return candidate.id;
  });
  if (new Set(caseIds).size !== caseIds.length) throw new Error('Benchmark corpus case IDs are duplicated.');
  const sortedCaseIds = [...caseIds].sort();
  return {
    file: registration.benchmarkCorpusFile,
    version: corpus.version,
    sha256: sha256(fs.readFileSync(corpusPath)),
    caseCount: caseIds.length,
    caseIdsSha256: sha256(stableStringify(sortedCaseIds)),
  };
}

function reportHash(report: JsonObject): string {
  const unsigned = Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'reportSha256'));
  return sha256(stableStringify(unsigned));
}

function validateCalibrationReport(
  repoRoot: string,
  reportPath: string,
  agentName: string,
): {
  report: JsonObject;
  generatedAt: string;
  fileSha256: string;
  internalSha256: string;
  fingerprintSha256: string;
} {
  const reportBytes = fs.readFileSync(reportPath);
  const report = loadJson(reportPath);
  if (report.runMode !== 'azure') throw new Error('Only an Azure calibration report can be attested.');
  const generatedAt = report.generatedAt;
  parseIsoTimestamp(generatedAt, 'report.generatedAt');
  if (typeof report.reportSha256 !== 'string' || report.reportSha256 !== reportHash(report)) {
    throw new Error('Calibration report integrity hash is invalid.');
  }
  const fingerprint = report.calibrationFingerprint;
  if (
    !isObject(fingerprint) ||
    !isObject(fingerprint.components) ||
    typeof fingerprint.sha256 !== 'string' ||
    fingerprint.sha256 !== sha256(stableStringify(fingerprint.components))
  ) {
    throw new Error('Calibration report fingerprint is invalid.');
  }
  const expectedComponents = expectedReportFingerprintComponents(repoRoot, agentName);
  const policy = loadCalibrationAttestationPolicy(repoRoot);
  if (
    stableStringify(Object.keys(expectedComponents).sort()) !==
    stableStringify([...policy.requiredReportFingerprintComponents].sort())
  ) {
    throw new Error('Calibration attestation policy fingerprint components are incomplete.');
  }
  if (stableStringify(fingerprint.components) !== stableStringify(expectedComponents)) {
    throw new Error('Calibration report does not bind the registered agent configuration.');
  }
  const benchmark = benchmarkInputs(repoRoot, agentName);
  if (report.corpusVersion !== benchmark.version) {
    throw new Error('Calibration report benchmark version is stale.');
  }
  return {
    report,
    generatedAt,
    fileSha256: sha256(reportBytes),
    internalSha256: report.reportSha256,
    fingerprintSha256: fingerprint.sha256,
  };
}

function validateRunContext(policy: CalibrationAttestationPolicy, context: AttestationRunContext): void {
  const expectedWorkflowRef = `${policy.repository.nameWithOwner}/${policy.trustedBuilder.workflowPath}@${policy.repository.protectedRef}`;
  if (
    context.agentName !== 'gilfoyle-security-architect' ||
    context.repository !== policy.repository.nameWithOwner ||
    context.repositoryId !== policy.repository.repositoryId ||
    context.repositoryOwnerId !== policy.repository.ownerId ||
    context.ref !== policy.repository.protectedRef ||
    context.workflowName !== policy.trustedBuilder.workflowName ||
    context.workflowPath !== policy.trustedBuilder.workflowPath ||
    context.workflowRef !== expectedWorkflowRef ||
    context.eventName !== policy.trustedBuilder.event ||
    context.environment !== policy.trustedBuilder.environment
  ) {
    throw new Error('Calibration context is not the trusted protected workflow.');
  }
  if (
    !HEAD_SHA_PATTERN.test(context.headSha) ||
    !HEAD_SHA_PATTERN.test(context.workflowSha) ||
    context.workflowSha !== context.headSha
  ) {
    throw new Error('Calibration workflow and repository commit are not the same exact protected head.');
  }
  if (
    !/^[1-9]\d*$/.test(context.runId) ||
    !Number.isInteger(context.runAttempt) ||
    context.runAttempt < 1 ||
    !/^[1-9]\d*$/.test(context.artifactId) ||
    context.artifactName.length === 0
  ) {
    throw new Error('Calibration run or artifact identity is invalid.');
  }
  normalizedDigest(context.artifactDigest, 'artifactDigest');
  if (
    !UUID_PATTERN.test(context.azureTenantId) ||
    !UUID_PATTERN.test(context.azureClientId) ||
    context.azureResourceId !== policy.azureDeployment.resourceId ||
    context.azureEndpoint.replace(/\/$/, '') !== policy.azureDeployment.endpoint
  ) {
    throw new Error('Azure workload or deployment identity is not trusted.');
  }
}

function replayNonce(value: JsonObject): string {
  return sha256(stableStringify(value));
}

function buildCalibrationAttestationPredicate(options: CreatePredicateOptions): JsonObject {
  const policy = loadCalibrationAttestationPolicy(options.repoRoot);
  validateRunContext(policy, options);
  const report = validateCalibrationReport(options.repoRoot, options.reportPath, options.agentName);
  const workflowStartedAt = parseIsoTimestamp(options.workflowStartedAt, 'workflowStartedAt');
  const reportGeneratedAt = parseIsoTimestamp(report.generatedAt, 'report.generatedAt');
  const attestedAt = parseIsoTimestamp(options.attestedAt, 'attestedAt');
  const maximumClockSkewMs = policy.freshness.maximumClockSkewSeconds * 1000;
  if (
    reportGeneratedAt < workflowStartedAt ||
    reportGeneratedAt > attestedAt + maximumClockSkewMs ||
    attestedAt - workflowStartedAt > policy.freshness.maximumWorkflowDurationSeconds * 1000
  ) {
    throw new Error('Calibration timestamps are inconsistent or exceed the bounded workflow duration.');
  }
  const artifactDigest = normalizedDigest(options.artifactDigest, 'artifactDigest');
  const configuration = agentConfigurationFingerprint(options.repoRoot, options.agentName);
  const benchmark = benchmarkInputs(options.repoRoot, options.agentName);
  const expiresAt = new Date(attestedAt + policy.freshness.maximumAttestationAgeSeconds * 1000).toISOString();
  const replayInputs = {
    repositoryId: options.repositoryId,
    headSha: options.headSha,
    workflowSha: options.workflowSha,
    runId: options.runId,
    runAttempt: options.runAttempt,
    artifactId: options.artifactId,
    artifactDigest,
    reportSha256: report.fileSha256,
    agentConfigurationSha256: configuration.sha256,
  };
  return {
    schemaVersion: policy.version,
    repository: {
      nameWithOwner: options.repository,
      ownerId: options.repositoryOwnerId,
      repositoryId: options.repositoryId,
      ref: options.ref,
      headSha: options.headSha,
    },
    workflow: {
      name: options.workflowName,
      path: options.workflowPath,
      ref: options.workflowRef,
      sha: options.workflowSha,
      event: options.eventName,
      environment: options.environment,
      runId: options.runId,
      runAttempt: options.runAttempt,
      runInvocationUri: `https://github.com/${options.repository}/actions/runs/${options.runId}/attempts/${options.runAttempt}`,
    },
    workloadIdentity: {
      oidcIssuer: policy.trustedBuilder.oidcIssuer,
      subject: policy.trustedBuilder.workloadIdentitySubject,
      tenantId: options.azureTenantId,
      clientId: options.azureClientId,
    },
    azureDeployment: {
      ...policy.azureDeployment,
      resourceId: options.azureResourceId,
      endpoint: options.azureEndpoint.replace(/\/$/, ''),
    },
    agentConfiguration: configuration,
    benchmarkInputs: benchmark,
    calibrationReport: {
      fileName: path.basename(options.reportPath),
      fileSha256: report.fileSha256,
      internalSha256: report.internalSha256,
      fingerprintSha256: report.fingerprintSha256,
      corpusVersion: report.report.corpusVersion,
      reportVersion: report.report.reportVersion,
      repetitionsPerCase: report.report.repetitionsPerCase,
      artifactId: options.artifactId,
      artifactName: options.artifactName,
      artifactSha256: artifactDigest,
    },
    timestamps: {
      workflowStartedAt: options.workflowStartedAt,
      reportGeneratedAt: report.generatedAt,
      attestedAt: options.attestedAt,
      expiresAt,
    },
    replayProtection: {
      strategy: 'exact-protected-run-and-artifact',
      nonceSha256: replayNonce(replayInputs),
    },
  };
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is missing.`);
  return value;
}

function verifyCertificate(
  policy: CalibrationAttestationPolicy,
  certificate: JsonObject,
  options: VerifyOptions,
): void {
  const repositoryUri = `https://github.com/${policy.repository.nameWithOwner}`;
  const owner = policy.repository.nameWithOwner.split('/')[0];
  const expected = {
    subjectAlternativeName: policy.trustedBuilder.subjectAlternativeName,
    issuer: policy.trustedBuilder.oidcIssuer,
    buildSignerURI: policy.trustedBuilder.subjectAlternativeName,
    buildSignerDigest: options.workflowSha,
    runnerEnvironment: policy.trustedBuilder.runnerEnvironment,
    sourceRepositoryURI: repositoryUri,
    sourceRepositoryDigest: options.headSha,
    sourceRepositoryRef: policy.repository.protectedRef,
    sourceRepositoryIdentifier: policy.repository.repositoryId,
    sourceRepositoryOwnerURI: `https://github.com/${owner}`,
    sourceRepositoryOwnerIdentifier: policy.repository.ownerId,
    buildConfigURI: policy.trustedBuilder.subjectAlternativeName,
    buildConfigDigest: options.workflowSha,
    buildTrigger: policy.trustedBuilder.event,
    runInvocationURI: `https://github.com/${policy.repository.nameWithOwner}/actions/runs/${options.runId}/attempts/${options.runAttempt}`,
    sourceRepositoryVisibilityAtSigning: policy.repository.visibility,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (certificate[field] !== expectedValue) {
      throw new Error(`Verified signer certificate does not match trusted ${field}.`);
    }
  }
}

function verifiedTimestampBounds(
  policy: CalibrationAttestationPolicy,
  timestamps: unknown,
  now: string,
): { earliest: number; latest: number } {
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    throw new Error('Attestation has no verified transparency or timestamp authority time.');
  }
  const values = timestamps.map((candidate) => {
    if (
      !isObject(candidate) ||
      !['Tlog', 'TimestampAuthority'].includes(String(candidate.type)) ||
      typeof candidate.uri !== 'string'
    ) {
      throw new Error('Attestation contains an untrusted timestamp source.');
    }
    return parseIsoTimestamp(candidate.timestamp, 'verified timestamp');
  });
  const earliest = Math.min(...values);
  const latest = Math.max(...values);
  const nowMs = parseIsoTimestamp(now, 'verification time');
  const maximumClockSkewMs = policy.freshness.maximumClockSkewSeconds * 1000;
  if (
    latest - earliest > maximumClockSkewMs ||
    earliest > nowMs + maximumClockSkewMs ||
    nowMs - latest > policy.freshness.maximumAttestationAgeSeconds * 1000
  ) {
    throw new Error('Attestation timestamp is stale, future-dated, or inconsistent.');
  }
  return { earliest, latest };
}

function validateVerifiedAttestation(
  options: VerifyOptions,
  verifiedOutput: unknown,
): { valid: true; attestationSha256: string; verifiedAt: string } {
  const policy = loadCalibrationAttestationPolicy(options.repoRoot);
  validateRunContext(policy, options);
  if (!Array.isArray(verifiedOutput) || verifiedOutput.length !== 1 || !isObject(verifiedOutput[0])) {
    throw new Error('Exactly one verified attestation is required; duplicates and replay are rejected.');
  }
  const verificationResult = verifiedOutput[0].verificationResult;
  if (!isObject(verificationResult)) throw new Error('Verified attestation result is malformed.');
  const signature = verificationResult.signature;
  if (!isObject(signature) || !isObject(signature.certificate)) {
    throw new Error('Attestation is unsigned or lacks a trusted workload certificate.');
  }
  verifyCertificate(policy, signature.certificate, options);
  const statement = verificationResult.statement;
  if (!isObject(statement) || statement.predicateType !== policy.predicateType) {
    throw new Error('Attestation predicate type is not trusted.');
  }
  if (!Array.isArray(statement.subject) || statement.subject.length !== 1 || !isObject(statement.subject[0])) {
    throw new Error('Attestation must contain exactly one report subject.');
  }
  const subjectDigest = statement.subject[0].digest;
  const reportFileSha256 = sha256(fs.readFileSync(options.reportPath));
  if (!isObject(subjectDigest) || subjectDigest.sha256 !== reportFileSha256) {
    throw new Error('Attested report subject digest does not match the report artifact.');
  }
  if (!isObject(statement.predicate)) throw new Error('Attestation predicate is malformed.');
  const timestamps = statement.predicate.timestamps;
  if (!isObject(timestamps)) throw new Error('Attestation predicate timestamps are missing.');
  const attestedAt = expectString(timestamps.attestedAt, 'timestamps.attestedAt');
  const expectedPredicate = buildCalibrationAttestationPredicate({
    ...options,
    attestedAt,
  });
  if (stableStringify(statement.predicate) !== stableStringify(expectedPredicate)) {
    throw new Error('Attestation predicate does not match the exact run, configuration, deployment, or artifact.');
  }
  const now = options.now ?? new Date().toISOString();
  const timestampBounds = verifiedTimestampBounds(policy, verificationResult.verifiedTimestamps, now);
  const attestedAtMs = parseIsoTimestamp(attestedAt, 'timestamps.attestedAt');
  const expiresAtMs = parseIsoTimestamp(timestamps.expiresAt, 'timestamps.expiresAt');
  const maximumClockSkewMs = policy.freshness.maximumClockSkewSeconds * 1000;
  if (
    Math.abs(attestedAtMs - timestampBounds.latest) > maximumClockSkewMs ||
    expiresAtMs !== attestedAtMs + policy.freshness.maximumAttestationAgeSeconds * 1000 ||
    parseIsoTimestamp(now, 'verification time') > expiresAtMs
  ) {
    throw new Error('Attestation freshness window is invalid or expired.');
  }
  return {
    valid: true,
    attestationSha256: sha256(stableStringify(verifiedOutput[0])),
    verifiedAt: now,
  };
}

function defaultExecutor(command: string, args: string[]): CommandResult {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function verifyCalibrationAttestation(
  options: VerifyOptions,
  executor: CommandExecutor = defaultExecutor,
): { valid: true; attestationSha256: string; verifiedAt: string } {
  const policy = loadCalibrationAttestationPolicy(options.repoRoot);
  const result = executor('gh', [
    'attestation',
    'verify',
    options.reportPath,
    '--bundle',
    options.bundlePath,
    '--repo',
    policy.repository.nameWithOwner,
    '--signer-workflow',
    policy.trustedBuilder.signerWorkflow,
    '--source-ref',
    policy.repository.protectedRef,
    '--source-digest',
    options.headSha,
    '--signer-digest',
    options.workflowSha,
    '--cert-oidc-issuer',
    policy.trustedBuilder.oidcIssuer,
    '--deny-self-hosted-runners',
    '--no-public-good',
    '--predicate-type',
    policy.predicateType,
    '--format',
    'json',
  ]);
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error('Cryptographic GitHub attestation verification failed closed.');
  }
  let verifiedOutput: unknown;
  try {
    verifiedOutput = JSON.parse(result.stdout);
  } catch {
    throw new Error('GitHub attestation verification returned malformed output.');
  }
  return validateVerifiedAttestation(options, verifiedOutput);
}

function parseArguments(args: string[]): { command: 'create' | 'verify'; values: Map<string, string> } {
  const command = args[0];
  if (command !== 'create' && command !== 'verify') {
    throw new Error('Expected calibration attestation command: create or verify.');
  }
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--') || values.has(key)) {
      throw new Error(`Invalid or duplicated argument: ${key ?? ''}`);
    }
    values.set(key, value);
  }
  return { command, values };
}

function requiredValue(values: Map<string, string>, name: string, environmentName?: string): string {
  const value = values.get(name) ?? (environmentName ? process.env[environmentName] : undefined);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function ensureInsideRepository(repoRoot: string, value: string, label: string): string {
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the repository.`);
  }
  return resolved;
}

function contextFromEnvironment(repoRoot: string, values: Map<string, string>): AttestationRunContext {
  const policy = loadCalibrationAttestationPolicy(repoRoot);
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_SERVER_URL !== 'https://github.com') {
    throw new Error('Calibration attestations may only run in GitHub Actions.');
  }
  const workflowPath = policy.trustedBuilder.workflowPath;
  return {
    agentName: requiredValue(values, '--agent'),
    reportPath: ensureInsideRepository(repoRoot, requiredValue(values, '--report'), 'report'),
    artifactId: requiredValue(values, '--artifact-id'),
    artifactName: requiredValue(values, '--artifact-name'),
    artifactDigest: requiredValue(values, '--artifact-digest'),
    repository: requiredValue(values, '--repository', 'GITHUB_REPOSITORY'),
    repositoryId: requiredValue(values, '--repository-id', 'GITHUB_REPOSITORY_ID'),
    repositoryOwnerId: requiredValue(values, '--repository-owner-id', 'GITHUB_REPOSITORY_OWNER_ID'),
    ref: requiredValue(values, '--ref', 'GITHUB_REF'),
    headSha: requiredValue(values, '--head-sha', 'GITHUB_SHA'),
    workflowName: requiredValue(values, '--workflow-name', 'GITHUB_WORKFLOW'),
    workflowPath,
    workflowRef: requiredValue(values, '--workflow-ref', 'GITHUB_WORKFLOW_REF'),
    workflowSha: requiredValue(values, '--workflow-sha', 'GITHUB_WORKFLOW_SHA'),
    workflowStartedAt: requiredValue(values, '--workflow-started-at'),
    runId: requiredValue(values, '--run-id', 'GITHUB_RUN_ID'),
    runAttempt: Number(requiredValue(values, '--run-attempt', 'GITHUB_RUN_ATTEMPT')),
    eventName: requiredValue(values, '--event-name', 'GITHUB_EVENT_NAME'),
    environment: requiredValue(values, '--environment', 'CALIBRATION_ENVIRONMENT'),
    azureTenantId: requiredValue(values, '--azure-tenant-id', 'AZURE_TENANT_ID'),
    azureClientId: requiredValue(values, '--azure-client-id', 'AZURE_CLIENT_ID'),
    azureResourceId: requiredValue(values, '--azure-resource-id', 'AZURE_OPENAI_DEPLOYMENT_RESOURCE_ID'),
    azureEndpoint: requiredValue(values, '--azure-endpoint', 'AZURE_OPENAI_ENDPOINT'),
  };
}

function main(): void {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { command, values } = parseArguments(process.argv.slice(2));
  const context = contextFromEnvironment(repoRoot, values);
  if (command === 'create') {
    const predicate = buildCalibrationAttestationPredicate({
      ...context,
      repoRoot,
      attestedAt: new Date().toISOString(),
    });
    const outputPath = ensureInsideRepository(repoRoot, requiredValue(values, '--output'), 'predicate output');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${stableStringify(predicate, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${outputPath}\n`);
    return;
  }
  const bundlePath = ensureInsideRepository(repoRoot, requiredValue(values, '--bundle'), 'bundle');
  const result = verifyCalibrationAttestation({
    ...context,
    repoRoot,
    bundlePath,
  });
  process.stdout.write(`${stableStringify(result, 2)}\n`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export {
  agentConfigurationFingerprint,
  benchmarkInputs,
  buildCalibrationAttestationPredicate,
  expectedReportFingerprintComponents,
  loadCalibrationAttestationPolicy,
  reportHash,
  validateCalibrationReport,
  validateVerifiedAttestation,
  verifyCalibrationAttestation,
};
export type { AttestationRunContext, CommandExecutor, CreatePredicateOptions, VerifyOptions };
