#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from './collect-adversarial-context.ts';
import { AdversarialFindingValidator } from './validate-adversarial-finding.ts';

type JsonObject = Record<string, unknown>;

interface ExceptionBundle {
  version: string;
  maximumValidityHours: number;
  maximumExceptionsPerRun: number;
  exceptions: unknown[];
}

interface ExceptionApplication extends JsonObject {
  exceptionId: string;
  exceptionFingerprint: string;
  applicationFingerprint: string;
  findingFingerprint: string;
  owner: string;
  rationale: string;
  issueNumber: number;
  expiresAt: string;
  approvedBy: string;
  approvedAt: string;
  approvalUrl: string;
  approvalRecordSha256: string;
}

interface ExceptionEvaluation extends JsonObject {
  version: '1.0.0';
  agentName: string;
  agentVersion: string;
  repository: string;
  headSha: string;
  runFingerprint: string;
  applications: ExceptionApplication[];
  applicationFingerprints: string[];
  exceptedFindingFingerprints: string[];
  unexceptedBlockingFindingFingerprints: string[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function findingFingerprint(value: unknown): string {
  if (!isObject(value)) return sha256(stableStringify(value));
  return sha256(stableStringify(Object.fromEntries(Object.entries(value).filter(([property]) => property !== 'id'))));
}

function exceptionIntegrity(value: JsonObject): string {
  return sha256(
    stableStringify(Object.fromEntries(Object.entries(value).filter(([property]) => property !== 'integritySha256'))),
  );
}

function rejectUnknownProperties(value: JsonObject, allowed: string[], field: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((property) => !allowedSet.has(property));
  if (unknown.length > 0) {
    throw new Error(`${field} contains undeclared properties: ${unknown.join(', ')}`);
  }
}

function requiredObject(value: unknown, field: string, required: string[], allowed = required): JsonObject {
  if (!isObject(value)) throw new Error(`${field} must be an object`);
  rejectUnknownProperties(value, allowed, field);
  for (const property of required) {
    if (!(property in value)) throw new Error(`${field}.${property} is required`);
  }
  return value;
}

function requiredString(
  value: unknown,
  field: string,
  pattern?: RegExp,
  minimumLength = 1,
  maximumLength = Number.MAX_SAFE_INTEGER,
): string {
  if (
    typeof value !== 'string' ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function timestamp(value: unknown, field: string): { value: string; milliseconds: number } {
  const text = requiredString(value, field);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${field} must be a canonical ISO 8601 timestamp`);
  }
  return { value: text, milliseconds };
}

function validateException(
  value: unknown,
  options: {
    maximumValidityHours: number;
    now: Date;
  },
): {
  exception: JsonObject;
  owner: JsonObject;
  issue: JsonObject;
  affected: JsonObject;
  audit: JsonObject;
} {
  const required = [
    'exceptionVersion',
    'exceptionId',
    'owner',
    'rationale',
    'issue',
    'createdAt',
    'expiresAt',
    'affected',
    'auditEvidence',
    'integritySha256',
  ];
  const exception = requiredObject(value, 'exception', required);
  if (exception.exceptionVersion !== '1.0.0') {
    throw new Error('exception.exceptionVersion must be 1.0.0');
  }
  requiredString(exception.exceptionId, 'exception.exceptionId', /^EXC-\d{8}-[A-Z0-9]{6,16}$/);
  requiredString(exception.rationale, 'exception.rationale', undefined, 20, 1000);
  requiredString(exception.integritySha256, 'exception.integritySha256', /^[a-f0-9]{64}$/);
  if (exception.integritySha256 !== exceptionIntegrity(exception)) {
    throw new Error('exception.integritySha256 does not match the exception content');
  }
  const owner = requiredObject(exception.owner, 'exception.owner', ['githubLogin']);
  const ownerLogin = requiredString(
    owner.githubLogin,
    'exception.owner.githubLogin',
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  );
  const issue = requiredObject(exception.issue, 'exception.issue', ['repository', 'number', 'url']);
  if (
    issue.repository !== 'jdylanmc/game-hub' ||
    !Number.isInteger(issue.number) ||
    Number(issue.number) < 1 ||
    issue.url !== `https://github.com/jdylanmc/game-hub/issues/${String(issue.number)}`
  ) {
    throw new Error('exception.issue must identify one exact jdylanmc/game-hub issue');
  }
  const affected = requiredObject(exception.affected, 'exception.affected', [
    'agentName',
    'agentVersion',
    'repository',
    'headSha',
    'runFingerprint',
    'findingFingerprint',
  ]);
  requiredString(affected.agentName, 'exception.affected.agentName', /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  requiredString(affected.agentVersion, 'exception.affected.agentVersion', /^\d+\.\d+\.\d+$/);
  if (affected.repository !== 'jdylanmc/game-hub') {
    throw new Error('exception.affected.repository must be exact');
  }
  requiredString(affected.headSha, 'exception.affected.headSha', /^[a-f0-9]{40}$/);
  requiredString(affected.runFingerprint, 'exception.affected.runFingerprint', /^[a-f0-9]{64}$/);
  requiredString(affected.findingFingerprint, 'exception.affected.findingFingerprint', /^[a-f0-9]{64}$/);
  const audit = requiredObject(exception.auditEvidence, 'exception.auditEvidence', [
    'approvedBy',
    'approvedAt',
    'approvalUrl',
    'approvalRecordSha256',
  ]);
  const approvedBy = requiredString(
    audit.approvedBy,
    'exception.auditEvidence.approvedBy',
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  );
  if (approvedBy === ownerLogin) {
    throw new Error('Exception owner cannot self-approve');
  }
  const issueCommentPrefix = `${String(issue.url)}#issuecomment-`;
  if (
    typeof audit.approvalUrl !== 'string' ||
    !audit.approvalUrl.startsWith(issueCommentPrefix) ||
    !/^\d+$/.test(audit.approvalUrl.slice(issueCommentPrefix.length))
  ) {
    throw new Error('exception.auditEvidence.approvalUrl must be an immutable issue comment');
  }
  requiredString(audit.approvalRecordSha256, 'exception.auditEvidence.approvalRecordSha256', /^[a-f0-9]{64}$/);
  const created = timestamp(exception.createdAt, 'exception.createdAt');
  const approved = timestamp(audit.approvedAt, 'exception.auditEvidence.approvedAt');
  const expires = timestamp(exception.expiresAt, 'exception.expiresAt');
  const maximumMilliseconds = options.maximumValidityHours * 60 * 60 * 1000;
  if (
    created.milliseconds > approved.milliseconds ||
    approved.milliseconds >= expires.milliseconds ||
    expires.milliseconds - approved.milliseconds > maximumMilliseconds
  ) {
    throw new Error('Exception chronology or validity window is invalid');
  }
  if (expires.milliseconds <= options.now.getTime()) {
    throw new Error('Exception is expired');
  }
  if (approved.milliseconds > options.now.getTime()) {
    throw new Error('Exception approval is in the future');
  }
  return { exception, owner, issue, affected, audit };
}

function validateExceptionRegistry(value: unknown, now = new Date()): ExceptionBundle {
  const bundle = requiredObject(
    value,
    'exceptionBundle',
    ['version', 'maximumValidityHours', 'maximumExceptionsPerRun', 'exceptions'],
    ['$schema', 'version', 'maximumValidityHours', 'maximumExceptionsPerRun', 'exceptions'],
  ) as unknown as ExceptionBundle;
  if (
    bundle.version !== '1.0.0' ||
    !Number.isInteger(bundle.maximumValidityHours) ||
    bundle.maximumValidityHours < 1 ||
    bundle.maximumValidityHours > 168 ||
    !Number.isInteger(bundle.maximumExceptionsPerRun) ||
    bundle.maximumExceptionsPerRun < 0 ||
    bundle.maximumExceptionsPerRun > 3 ||
    !Array.isArray(bundle.exceptions) ||
    bundle.exceptions.length > bundle.maximumExceptionsPerRun
  ) {
    throw new Error('Exception bundle limits are invalid or overly broad');
  }
  const identifiers = new Set<string>();
  for (const candidate of bundle.exceptions) {
    const validated = validateException(candidate, {
      maximumValidityHours: bundle.maximumValidityHours,
      now,
    });
    const exceptionId = String(validated.exception.exceptionId);
    if (identifiers.has(exceptionId)) throw new Error('Exception ID is duplicated or replayed');
    identifiers.add(exceptionId);
  }
  return bundle;
}

function evaluateAdversarialExceptions(options: {
  repoRoot: string;
  repository: string;
  issueNumber: number;
  headSha: string;
  result: unknown;
  bundle: unknown;
  now?: () => Date;
}): ExceptionEvaluation {
  if (!isObject(options.result)) throw new Error('Reviewer result is required for exception evaluation');
  const attribution = isObject(options.result.attribution) ? options.result.attribution : {};
  const agentName = String(attribution.agentName ?? '');
  const validator = new AdversarialFindingValidator(options.repoRoot, agentName);
  const validation = validator.validate(options.result);
  if (!validation.valid) throw new Error('Exceptions may apply only to validated reviewer output');
  if (
    options.repository !== 'jdylanmc/game-hub' ||
    attribution.repositoryCommit !== options.headSha ||
    !Number.isInteger(options.issueNumber) ||
    options.issueNumber < 1
  ) {
    throw new Error('Exception evaluation attribution is invalid');
  }
  const now = options.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Exception evaluation time is invalid');
  const bundle = validateExceptionRegistry(options.bundle, now);
  const runFingerprint = sha256(stableStringify(options.result));
  const findings = Array.isArray(options.result.findings) ? options.result.findings : [];
  const blockingFindings = findings
    .filter((finding) => isObject(finding) && finding.severity === 'BLOCKING' && finding.confidence === 'HIGH')
    .map((finding) => ({ finding, fingerprint: findingFingerprint(finding) }));
  const blockingByFingerprint = new Map(blockingFindings.map(({ finding, fingerprint }) => [fingerprint, finding]));
  const seenExceptionIds = new Set<string>();
  const seenFindingFingerprints = new Set<string>();
  const applications: ExceptionApplication[] = [];
  for (const candidate of bundle.exceptions) {
    const validated = validateException(candidate, {
      maximumValidityHours: bundle.maximumValidityHours,
      now,
    });
    const exceptionId = String(validated.exception.exceptionId);
    const findingHash = String(validated.affected.findingFingerprint);
    if (seenExceptionIds.has(exceptionId) || seenFindingFingerprints.has(findingHash)) {
      throw new Error('Exception is duplicated or replayed in the same evaluation');
    }
    seenExceptionIds.add(exceptionId);
    seenFindingFingerprints.add(findingHash);
    if (
      validated.issue.repository !== options.repository ||
      validated.issue.number !== options.issueNumber ||
      validated.affected.repository !== options.repository ||
      validated.affected.agentName !== agentName ||
      validated.affected.agentVersion !== attribution.agentVersion ||
      validated.affected.headSha !== options.headSha ||
      validated.affected.runFingerprint !== runFingerprint
    ) {
      throw new Error('Exception is unrelated to this exact issue, agent, head, or run');
    }
    if (!blockingByFingerprint.has(findingHash)) {
      throw new Error('Exception does not identify one current high-confidence blocking finding');
    }
    const exceptionFingerprint = sha256(stableStringify(validated.exception));
    const applicationFingerprint = sha256(
      stableStringify({
        exceptionFingerprint,
        runFingerprint,
        findingFingerprint: findingHash,
      }),
    );
    applications.push({
      exceptionId,
      exceptionFingerprint,
      applicationFingerprint,
      findingFingerprint: findingHash,
      owner: String(validated.owner.githubLogin),
      rationale: String(validated.exception.rationale),
      issueNumber: Number(validated.issue.number),
      expiresAt: String(validated.exception.expiresAt),
      approvedBy: String(validated.audit.approvedBy),
      approvedAt: String(validated.audit.approvedAt),
      approvalUrl: String(validated.audit.approvalUrl),
      approvalRecordSha256: String(validated.audit.approvalRecordSha256),
    });
  }
  applications.sort((left, right) => left.applicationFingerprint.localeCompare(right.applicationFingerprint));
  const exceptedFindingFingerprints = applications.map((application) => application.findingFingerprint).sort();
  return {
    version: '1.0.0',
    agentName,
    agentVersion: String(attribution.agentVersion),
    repository: options.repository,
    headSha: options.headSha,
    runFingerprint,
    applications,
    applicationFingerprints: applications.map((application) => application.applicationFingerprint),
    exceptedFindingFingerprints,
    unexceptedBlockingFindingFingerprints: blockingFindings
      .map(({ fingerprint }) => fingerprint)
      .filter((fingerprint) => !exceptedFindingFingerprints.includes(fingerprint))
      .sort(),
  };
}

function parseJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  if (args.exceptions && !args.result) {
    const validated = validateExceptionRegistry(parseJson(path.resolve(args.exceptions)));
    process.stdout.write(
      `${stableStringify({ valid: true, version: validated.version, exceptionCount: validated.exceptions.length }, 2)}\n`,
    );
    return;
  }
  for (const required of ['result', 'repository', 'issue', 'head', 'exceptions']) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  const repoRoot = path.resolve(args['repo-root'] ?? '.');
  const evaluation = evaluateAdversarialExceptions({
    repoRoot,
    repository: args.repository,
    issueNumber: Number(args.issue),
    headSha: args.head,
    result: parseJson(path.resolve(args.result)),
    bundle: parseJson(path.resolve(args.exceptions)),
  });
  process.stdout.write(`${stableStringify(evaluation, 2)}\n`);
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

export { evaluateAdversarialExceptions, exceptionIntegrity, validateException, validateExceptionRegistry };
export type { ExceptionApplication, ExceptionEvaluation };
