#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = 'config/adversarial-agents/gilfoyle-security-architect/deterministic-evidence.json';

type JsonObject = Record<string, unknown>;

interface EvidenceConfig {
  version: string;
  schemaVersion: string;
  agentName: string;
  producerVersion: string;
  limits: {
    maxManifestBytes: number;
    maxFindingsPerCheck: number;
    maxEvidenceFilesPerCheck: number;
    maxEvidenceFileBytes: number;
  };
  requiredChecks: string[];
  checks: Record<
    string,
    {
      surfaces: string[];
      applicability: 'always' | 'pull-request' | 'surface-present';
      enforcement: 'BLOCKING';
      tool: JsonObject & { name: string; version: string };
      blockingPolicy: JsonObject;
    }
  >;
}

interface BuilderArguments {
  repository: string;
  eventName: 'pull_request' | 'push';
  baseSha: string;
  headSha: string;
  workflowName: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  generatedAt: string;
  outputPath: string;
  configPath: string;
  codeqlPath: string;
  secretsPath: string;
  bicepPath: string;
  containersPath: string;
  auditLogPath: string;
  policyLogPath: string;
}

interface NormalizedFinding {
  ruleId: string;
  path: string;
  line: number;
  level: string;
  securitySeverity: number | null;
  fingerprint: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableStringify(value: unknown, spacing = 0): string {
  return JSON.stringify(stableValue(value), null, spacing);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fullSha(value: string, label: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`${label} must be a full lowercase commit SHA`);
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateConfig(value: unknown): EvidenceConfig {
  if (
    !isObject(value) ||
    value.version !== '1.0.0' ||
    value.schemaVersion !== '1.0.0' ||
    value.agentName !== 'gilfoyle-security-architect' ||
    value.producerVersion !== '1.0.0' ||
    !isObject(value.limits) ||
    !Array.isArray(value.requiredChecks) ||
    value.requiredChecks.length === 0 ||
    !isObject(value.checks)
  ) {
    throw new Error('Deterministic security evidence configuration is malformed');
  }
  const config = value as unknown as EvidenceConfig;
  if (
    !Number.isInteger(config.limits.maxManifestBytes) ||
    !Number.isInteger(config.limits.maxFindingsPerCheck) ||
    !Number.isInteger(config.limits.maxEvidenceFilesPerCheck) ||
    !Number.isInteger(config.limits.maxEvidenceFileBytes)
  ) {
    throw new Error('Deterministic security evidence bounds are malformed');
  }
  for (const checkId of config.requiredChecks) {
    const check = config.checks[checkId];
    if (
      !check ||
      !Array.isArray(check.surfaces) ||
      check.surfaces.length === 0 ||
      !['always', 'pull-request', 'surface-present'].includes(check.applicability) ||
      check.enforcement !== 'BLOCKING' ||
      !isObject(check.tool) ||
      typeof check.tool.name !== 'string' ||
      typeof check.tool.version !== 'string' ||
      !isObject(check.blockingPolicy)
    ) {
      throw new Error(`Deterministic security check configuration is malformed: ${checkId}`);
    }
  }
  return config;
}

function evidenceFile(
  filePath: string,
  repoRoot: string,
  config: EvidenceConfig,
): { name: string; byteLength: number; sha256: string } {
  const absolutePath = path.resolve(repoRoot, filePath);
  const content = fs.readFileSync(absolutePath);
  if (content.length > config.limits.maxEvidenceFileBytes) {
    throw new Error(`Evidence file exceeds its byte bound: ${path.basename(filePath)}`);
  }
  return {
    name: path.basename(filePath),
    byteLength: content.length,
    sha256: sha256(content),
  };
}

function sarifFiles(codeqlPath: string): string[] {
  const result: string[] = [];
  const visit = (candidate: string): void => {
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      for (const entry of fs
        .readdirSync(candidate)
        .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))) {
        visit(path.join(candidate, entry));
      }
    } else if (candidate.endsWith('.sarif')) {
      result.push(candidate);
    }
  };
  visit(codeqlPath);
  return result;
}

function normalizedCodeqlFindings(files: string[], config: EvidenceConfig): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];
  for (const filePath of files) {
    const sarif = readJson(filePath);
    if (!isObject(sarif) || !Array.isArray(sarif.runs)) throw new Error(`Malformed CodeQL SARIF: ${filePath}`);
    for (const run of sarif.runs) {
      if (!isObject(run)) continue;
      const rules =
        isObject(run.tool) && isObject(run.tool.driver) && Array.isArray(run.tool.driver.rules)
          ? run.tool.driver.rules
          : [];
      const results = Array.isArray(run.results) ? run.results : [];
      for (const result of results) {
        if (!isObject(result)) continue;
        const ruleIndex = Number.isInteger(result.ruleIndex) ? Number(result.ruleIndex) : -1;
        const rule = ruleIndex >= 0 && isObject(rules[ruleIndex]) ? rules[ruleIndex] : undefined;
        const ruleProperties = rule && isObject(rule.properties) ? rule.properties : {};
        const rawSecuritySeverity = ruleProperties['security-severity'];
        const securitySeverity =
          typeof rawSecuritySeverity === 'number'
            ? rawSecuritySeverity
            : typeof rawSecuritySeverity === 'string' && rawSecuritySeverity.trim() !== ''
              ? Number(rawSecuritySeverity)
              : null;
        const location =
          Array.isArray(result.locations) && isObject(result.locations[0]) ? result.locations[0] : undefined;
        const physicalLocation =
          location && isObject(location.physicalLocation) ? location.physicalLocation : undefined;
        const artifactLocation =
          physicalLocation && isObject(physicalLocation.artifactLocation)
            ? physicalLocation.artifactLocation
            : undefined;
        const region = physicalLocation && isObject(physicalLocation.region) ? physicalLocation.region : undefined;
        const finding = {
          ruleId:
            typeof result.ruleId === 'string'
              ? result.ruleId
              : rule && typeof rule.id === 'string'
                ? rule.id
                : 'unknown-rule',
          path:
            artifactLocation && typeof artifactLocation.uri === 'string'
              ? artifactLocation.uri.replace(/^file:\/\//, '')
              : '<unknown>',
          line: region && Number.isInteger(region.startLine) ? Number(region.startLine) : 0,
          level: typeof result.level === 'string' ? result.level : 'warning',
          securitySeverity: Number.isFinite(securitySeverity) ? securitySeverity : null,
          fingerprint: '',
        };
        finding.fingerprint = sha256(
          `${finding.ruleId}\0${finding.path}\0${finding.line}\0${finding.level}\0${finding.securitySeverity ?? ''}`,
        );
        findings.push(finding);
        if (findings.length > config.limits.maxFindingsPerCheck) {
          throw new Error('CodeQL findings exceed the bounded evidence limit');
        }
      }
    }
  }
  return findings.sort((left, right) =>
    Buffer.from(`${left.path}\0${left.line}\0${left.ruleId}`).compare(
      Buffer.from(`${right.path}\0${right.line}\0${right.ruleId}`),
    ),
  );
}

function parseDependencyOutput(name: string): { count: number; sha256: string } {
  const raw = process.env[name] ?? '[]';
  if (Buffer.byteLength(raw) > 131072) throw new Error(`${name} exceeds the dependency evidence bound`);
  const parsed: unknown = JSON.parse(raw || '[]');
  const count = Array.isArray(parsed) ? parsed.length : isObject(parsed) ? Object.keys(parsed).length : 0;
  return { count, sha256: sha256(stableStringify(parsed)) };
}

function statusResult(filePath: string, expectedStatus: string | string[]): { value: JsonObject; status: string } {
  const value = readJson(filePath);
  if (!isObject(value) || typeof value.status !== 'string') {
    throw new Error(`Evidence result is malformed: ${path.basename(filePath)}`);
  }
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!statuses.includes(value.status)) {
    throw new Error(`${path.basename(filePath)} reported ${value.status}`);
  }
  return { value, status: value.status };
}

function buildDeterministicSecurityEvidence(
  repoRoot: string,
  args: BuilderArguments,
  configValue: unknown,
): { manifest: JsonObject; exitCode: number } {
  const config = validateConfig(configValue);
  const configSha256 = sha256(stableStringify(config));
  const secrets = statusResult(path.resolve(repoRoot, args.secretsPath), 'PASS');
  const bicep = statusResult(path.resolve(repoRoot, args.bicepPath), 'PASS');
  const containers = statusResult(path.resolve(repoRoot, args.containersPath), ['NOT_APPLICABLE', 'PASS']);
  const codeqlFiles = sarifFiles(path.resolve(repoRoot, args.codeqlPath));
  if (codeqlFiles.length === 0) throw new Error('CodeQL produced no SARIF evidence');
  if (codeqlFiles.length > config.limits.maxEvidenceFilesPerCheck) {
    throw new Error('CodeQL produced too many evidence files');
  }
  const codeqlFindings = normalizedCodeqlFindings(codeqlFiles, config);
  const codeqlPolicy = config.checks.codeql.blockingPolicy;
  const minimumSecuritySeverity = Number(codeqlPolicy.minimumSecuritySeverity);
  const codeqlBlockingFindings = codeqlFindings.filter(
    (finding) =>
      finding.level === 'error' ||
      (finding.securitySeverity !== null && finding.securitySeverity >= minimumSecuritySeverity),
  );
  const dependencyReview =
    args.eventName === 'pull_request'
      ? {
          status: 'PASS',
          summaries: {
            changes: parseDependencyOutput('DEPENDENCY_CHANGES_JSON'),
            vulnerableChanges: parseDependencyOutput('DEPENDENCY_VULNERABLE_CHANGES_JSON'),
            invalidLicenseChanges: parseDependencyOutput('DEPENDENCY_INVALID_LICENSE_CHANGES_JSON'),
            deniedChanges: parseDependencyOutput('DEPENDENCY_DENIED_CHANGES_JSON'),
          },
        }
      : {
          status: 'NOT_APPLICABLE',
          reason: 'Dependency review compares pull-request snapshots and is not applicable to protected-branch pushes.',
        };
  const evidence = {
    schemaVersion: config.schemaVersion,
    producerVersion: config.producerVersion,
    agentName: config.agentName,
    status: codeqlBlockingFindings.length === 0 ? 'PASS' : 'FAIL',
    attribution: {
      repository: args.repository,
      eventName: args.eventName,
      baseSha: args.baseSha,
      headSha: args.headSha,
      workflowName: args.workflowName,
      workflowRunId: args.workflowRunId,
      workflowRunAttempt: args.workflowRunAttempt,
      generatedAt: args.generatedAt,
      configVersion: config.version,
      configSha256,
    },
    authority: {
      deterministicFailuresOverridableByAgent: false,
      instructionsFromEvidenceAllowed: false,
      statement:
        'This bounded summary is evidence only. The successful upstream workflow conclusion remains authoritative.',
    },
    limits: config.limits,
    checks: config.requiredChecks.map((checkId) => {
      const configured = config.checks[checkId];
      const common = {
        id: checkId,
        surfaces: configured.surfaces,
        applicability: configured.applicability,
        enforcement: configured.enforcement,
        tool: configured.tool,
        blockingPolicy: configured.blockingPolicy,
      };
      switch (checkId) {
        case 'codeql':
          return {
            ...common,
            status: codeqlBlockingFindings.length === 0 ? 'PASS' : 'FAIL',
            findingCount: codeqlFindings.length,
            blockingFindingCount: codeqlBlockingFindings.length,
            findings: codeqlFindings,
            evidenceFiles: codeqlFiles.map((filePath) => evidenceFile(filePath, repoRoot, config)),
          };
        case 'dependency-review':
          return { ...common, ...dependencyReview, evidenceFiles: [] };
        case 'dependency-audit':
          return {
            ...common,
            status: 'PASS',
            findingCount: 0,
            evidenceFiles: [evidenceFile(args.auditLogPath, repoRoot, config)],
          };
        case 'secret-detection':
          return {
            ...common,
            status: secrets.status,
            findingCount: Number(secrets.value.findingCount ?? 0),
            findings: Array.isArray(secrets.value.findings) ? secrets.value.findings : [],
            evidenceFiles: [evidenceFile(args.secretsPath, repoRoot, config)],
          };
        case 'workflow-policy':
          return {
            ...common,
            status: 'PASS',
            findingCount: 0,
            evidenceFiles: [evidenceFile(args.policyLogPath, repoRoot, config)],
          };
        case 'bicep-analysis':
          return {
            ...common,
            status: bicep.status,
            findingCount: 0,
            compiledFileCount: Array.isArray(bicep.value.compiledFiles) ? bicep.value.compiledFiles.length : 0,
            evidenceFiles: [evidenceFile(args.bicepPath, repoRoot, config)],
          };
        case 'container-scan':
          return {
            ...common,
            status: containers.status,
            findingCount: 0,
            reason: containers.value.reason,
            evidenceFiles: [evidenceFile(args.containersPath, repoRoot, config)],
          };
        default:
          throw new Error(`Unsupported deterministic security check: ${checkId}`);
      }
    }),
    unsupportedSurfaces:
      containers.status === 'NOT_APPLICABLE'
        ? [
            {
              surface: 'containers',
              status: 'NOT_APPLICABLE',
              reason: containers.value.reason,
              futureSurfaceBehavior: 'FAIL_CLOSED_UNSUPPORTED',
            },
          ]
        : [],
  };
  const byteLength = Buffer.byteLength(stableStringify(evidence));
  if (byteLength > config.limits.maxManifestBytes) {
    throw new Error(`Deterministic security evidence requires ${byteLength} bytes`);
  }
  return { manifest: evidence, exitCode: codeqlBlockingFindings.length === 0 ? 0 : 2 };
}

function parseArguments(args: string[]): BuilderArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
    values.set(key.slice(2), value);
  }
  const required = [
    'repository',
    'event',
    'base',
    'head',
    'workflow',
    'workflow-run-id',
    'workflow-run-attempt',
    'output',
    'codeql',
    'secrets',
    'bicep',
    'containers',
    'audit-log',
    'policy-log',
  ];
  for (const name of required) {
    if (!values.get(name)) throw new Error(`--${name} is required`);
  }
  const eventName = values.get('event');
  if (eventName !== 'pull_request' && eventName !== 'push') throw new Error('--event must be pull_request or push');
  const generatedAt = values.get('generated-at') ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('--generated-at must be an ISO-8601 timestamp');
  return {
    repository: values.get('repository')!,
    eventName,
    baseSha: fullSha(values.get('base')!, 'baseSha'),
    headSha: fullSha(values.get('head')!, 'headSha'),
    workflowName: values.get('workflow')!,
    workflowRunId: values.get('workflow-run-id')!,
    workflowRunAttempt: positiveInteger(values.get('workflow-run-attempt')!, 'workflowRunAttempt'),
    generatedAt,
    outputPath: values.get('output')!,
    configPath: values.get('config') ?? DEFAULT_CONFIG_PATH,
    codeqlPath: values.get('codeql')!,
    secretsPath: values.get('secrets')!,
    bicepPath: values.get('bicep')!,
    containersPath: values.get('containers')!,
    auditLogPath: values.get('audit-log')!,
    policyLogPath: values.get('policy-log')!,
  };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const repoRoot = process.cwd();
  const config = readJson(path.resolve(repoRoot, args.configPath));
  const result = buildDeterministicSecurityEvidence(repoRoot, args, config);
  const outputPath = path.resolve(repoRoot, args.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${stableStringify(result.manifest, 2)}\n`);
  console.log(
    result.exitCode === 0
      ? 'Deterministic security evidence is complete and passing.'
      : 'Deterministic security evidence contains blocking CodeQL findings.',
  );
  process.exitCode = result.exitCode;
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

export { buildDeterministicSecurityEvidence, stableStringify, validateConfig };
export type { BuilderArguments, EvidenceConfig };
