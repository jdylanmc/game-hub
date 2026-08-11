#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED_SCHEMA_VERSION = '1.0.0';
const FINDING_CATEGORIES = new Set([
  'tautology',
  'mock-evasion',
  'missing-error-case',
  'missing-branch',
  'race-condition',
  'snapshot-only',
  'duplicate-implementation',
  'weak-assertion',
  'focused-test',
  'missing-edge-case',
  'authorization-bypass',
  'cleanup-leak',
  'determinism-issue',
  'other',
]);

interface ValidationError {
  code: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  schemaVersion: string;
  agentName: string;
  findingCount: number;
  blockingCount: number;
  advisoryCount: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

class AdversarialFindingValidator {
  private readonly repoRoot: string;
  private readonly schema: JsonObject;
  private readonly policy: JsonObject;
  private readonly registry: JsonObject;

  constructor(repoRoot = '.') {
    this.repoRoot = repoRoot;
    this.schema = this.loadJson(path.join(repoRoot, 'config/adversarial-agents/schema.json'));
    this.policy = this.loadJson(path.join(repoRoot, 'config/adversarial-agents/policy.json'));
    this.registry = this.loadJson(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'));
  }

  private loadJson(filePath: string): JsonObject {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isObject(parsed)) {
      throw new Error(`${filePath} must contain a JSON object`);
    }
    return parsed;
  }

  private addError(errors: ValidationError[], code: number, field: string, message: string): void {
    errors.push({ code, field, message, severity: 'error' });
  }

  private requireObject(value: unknown, field: string, errors: ValidationError[]): JsonObject | undefined {
    if (!isObject(value)) {
      this.addError(errors, 1, field, `${field} must be an object`);
      return undefined;
    }
    return value;
  }

  private rejectUnknownProperties(
    value: JsonObject,
    allowed: readonly string[],
    field: string,
    errors: ValidationError[],
  ): void {
    const allowedSet = new Set(allowed);
    for (const property of Object.keys(value)) {
      if (!allowedSet.has(property)) {
        this.addError(
          errors,
          2,
          field ? `${field}.${property}` : property,
          `Undeclared property "${property}" is not allowed`,
        );
      }
    }
  }

  private requireFields(
    value: JsonObject,
    required: readonly string[],
    field: string,
    errors: ValidationError[],
  ): void {
    for (const property of required) {
      if (!(property in value)) {
        this.addError(errors, 1, field ? `${field}.${property}` : property, `Required field "${property}" is missing`);
      }
    }
  }

  validate(input: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const root = this.requireObject(input, 'result', errors);
    if (!root) {
      return this.result(errors, warnings, undefined, [], 0, 0);
    }

    this.rejectUnknownProperties(
      root,
      ['schemaVersion', 'findingVersion', 'attribution', 'verdict', 'findings', 'summary'],
      '',
      errors,
    );
    this.requireFields(root, ['schemaVersion', 'findingVersion', 'attribution', 'verdict', 'findings'], '', errors);

    const schemaVersion = root.schemaVersion;
    if (schemaVersion !== SUPPORTED_SCHEMA_VERSION || this.schema.version !== SUPPORTED_SCHEMA_VERSION) {
      this.addError(errors, 2, 'schemaVersion', `schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}`);
    }

    if (
      typeof root.findingVersion !== 'string' ||
      !/^[a-z0-9]+(-[a-z0-9]+)*@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(root.findingVersion)
    ) {
      this.addError(errors, 2, 'findingVersion', 'findingVersion must use agent-name@YYYY-MM-DDTHH:MM:SSZ');
    }

    const attribution = this.validateAttribution(root.attribution, errors);
    const findings = Array.isArray(root.findings) ? root.findings : [];
    if (!Array.isArray(root.findings)) {
      this.addError(errors, 1, 'findings', 'findings must be an array');
    }

    const validatedFindings: JsonObject[] = [];
    findings.forEach((finding, index) => {
      const before = errors.length;
      const validated = this.validateFinding(finding, index, errors);
      if (validated && errors.length === before) {
        validatedFindings.push(validated);
      }
    });

    const blockingCount = validatedFindings.filter(
      (finding) => finding.severity === 'BLOCKING' && finding.confidence === 'HIGH',
    ).length;
    const advisoryCount = validatedFindings.length - blockingCount;
    this.validateVerdict(root.verdict, blockingCount, advisoryCount, findings.length, errors);

    if (root.summary !== undefined) {
      this.validateSummary(root.summary, errors);
    }

    return this.result(errors, warnings, attribution, findings, blockingCount, advisoryCount);
  }

  private validateAttribution(value: unknown, errors: ValidationError[]): JsonObject | undefined {
    const attribution = this.requireObject(value, 'attribution', errors);
    if (!attribution) return undefined;

    const fields = [
      'agentName',
      'agentVersion',
      'modelDeployment',
      'promptVersion',
      'promptContentHash',
      'policyVersion',
      'toolsVersion',
      'subscriptionId',
      'repositoryCommit',
      'timestamp',
    ];
    this.rejectUnknownProperties(attribution, fields, 'attribution', errors);
    this.requireFields(attribution, fields, 'attribution', errors);

    if (typeof attribution.agentName !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(attribution.agentName)) {
      this.addError(errors, 2, 'attribution.agentName', 'agentName must be kebab-case');
    }
    for (const field of ['agentVersion', 'promptVersion', 'policyVersion', 'toolsVersion']) {
      if (typeof attribution[field] !== 'string' || !/^\d+\.\d+\.\d+$/.test(attribution[field])) {
        this.addError(errors, 2, `attribution.${field}`, `${field} must be a semantic version`);
      }
    }
    if (typeof attribution.promptContentHash !== 'string' || !/^[a-f0-9]{64}$/.test(attribution.promptContentHash)) {
      this.addError(errors, 2, 'attribution.promptContentHash', 'promptContentHash must be a lowercase SHA-256 value');
    }
    if (attribution.subscriptionId !== '11213dbd-39fe-46ba-87db-5f5e8c449aed') {
      this.addError(errors, 2, 'attribution.subscriptionId', 'Unexpected Azure subscription');
    }
    if (typeof attribution.repositoryCommit !== 'string' || !/^[a-f0-9]{40}$/.test(attribution.repositoryCommit)) {
      this.addError(errors, 2, 'attribution.repositoryCommit', 'repositoryCommit must be a full commit SHA');
    }
    if (typeof attribution.timestamp !== 'string' || !Number.isFinite(Date.parse(attribution.timestamp))) {
      this.addError(errors, 2, 'attribution.timestamp', 'timestamp must be an ISO 8601 date-time');
    }

    const agents = Array.isArray(this.registry.agents) ? this.registry.agents : [];
    const agent = agents.find(
      (candidate): candidate is JsonObject => isObject(candidate) && candidate.name === attribution.agentName,
    );
    if (!agent) {
      this.addError(errors, 3, 'attribution.agentName', 'Agent is not registered');
      return attribution;
    }

    const expected = {
      agentVersion: agent.version,
      modelDeployment: agent.modelDeployment,
      promptVersion: agent.promptVersion,
      promptContentHash: agent.promptContentHash,
      toolsVersion: agent.toolsVersion,
      policyVersion: this.policy.version,
    };
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (attribution[field] !== expectedValue) {
        this.addError(errors, 3, `attribution.${field}`, `${field} does not match the registered configuration`);
      }
    }

    if (typeof agent.promptFile === 'string') {
      const actualHash = AdversarialFindingValidator.computeFileHash(path.join(this.repoRoot, agent.promptFile));
      if (attribution.promptContentHash !== actualHash) {
        this.addError(errors, 3, 'attribution.promptContentHash', 'promptContentHash does not match the prompt file');
      }
    }

    return attribution;
  }

  private validateFinding(value: unknown, index: number, errors: ValidationError[]): JsonObject | undefined {
    const field = `findings[${index}]`;
    const finding = this.requireObject(value, field, errors);
    if (!finding) return undefined;

    const required = [
      'id',
      'title',
      'category',
      'severity',
      'confidence',
      'description',
      'citations',
      'missingScenario',
      'expectedFailureSignal',
      'suggestedTest',
    ];
    this.rejectUnknownProperties(finding, [...required, 'additionalContext'], field, errors);
    this.requireFields(finding, required, field, errors);

    if (typeof finding.id !== 'string' || !/^[A-Z0-9]+-\d+$/.test(finding.id)) {
      this.addError(errors, 2, `${field}.id`, 'id must match CATEGORY-001');
    }
    for (const property of ['title', 'description', 'missingScenario', 'expectedFailureSignal', 'suggestedTest']) {
      if (!isNonEmptyString(finding[property])) {
        this.addError(errors, 3, `${field}.${property}`, `${property} must be non-empty`);
      }
    }
    if (typeof finding.category !== 'string' || !FINDING_CATEGORIES.has(finding.category)) {
      this.addError(errors, 2, `${field}.category`, 'category is not supported');
    }
    if (!['BLOCKING', 'ADVISORY'].includes(String(finding.severity))) {
      this.addError(errors, 2, `${field}.severity`, 'severity must be BLOCKING or ADVISORY');
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(String(finding.confidence))) {
      this.addError(errors, 2, `${field}.confidence`, 'confidence must be HIGH, MEDIUM, or LOW');
    }

    this.validateCitations(finding.citations, field, errors);
    if (finding.additionalContext !== undefined) {
      const context = this.requireObject(finding.additionalContext, `${field}.additionalContext`, errors);
      if (context) {
        this.rejectUnknownProperties(
          context,
          ['testFramework', 'detectionMethod'],
          `${field}.additionalContext`,
          errors,
        );
        for (const [property, propertyValue] of Object.entries(context)) {
          if (!isNonEmptyString(propertyValue)) {
            this.addError(
              errors,
              2,
              `${field}.additionalContext.${property}`,
              `${property} must be a non-empty string`,
            );
          }
        }
      }
    }
    return finding;
  }

  private validateCitations(value: unknown, findingField: string, errors: ValidationError[]): void {
    const field = `${findingField}.citations`;
    const citations = this.requireObject(value, field, errors);
    if (!citations) return;
    this.rejectUnknownProperties(citations, ['productionFiles', 'testFiles', 'issueRequirements'], field, errors);
    this.requireFields(citations, ['productionFiles', 'testFiles'], field, errors);

    let citationCount = 0;
    for (const collectionName of ['productionFiles', 'testFiles']) {
      const collection = citations[collectionName];
      if (!Array.isArray(collection)) {
        this.addError(errors, 1, `${field}.${collectionName}`, `${collectionName} must be an array`);
        continue;
      }
      citationCount += collection.length;
      collection.forEach((citation, index) => {
        const citationField = `${field}.${collectionName}[${index}]`;
        const object = this.requireObject(citation, citationField, errors);
        if (!object) return;
        this.rejectUnknownProperties(object, ['path', 'startLine', 'endLine', 'snippet'], citationField, errors);
        this.requireFields(object, ['path', 'startLine', 'endLine', 'snippet'], citationField, errors);
        if (!isNonEmptyString(object.path) || !isNonEmptyString(object.snippet)) {
          this.addError(errors, 3, citationField, 'Citation path and snippet must be non-empty');
        }
        if (
          !Number.isInteger(object.startLine) ||
          !Number.isInteger(object.endLine) ||
          Number(object.startLine) < 1 ||
          Number(object.endLine) < Number(object.startLine)
        ) {
          this.addError(
            errors,
            3,
            citationField,
            'Citation lines must be positive and endLine must not precede startLine',
          );
        }
      });
    }
    if (citationCount === 0) {
      this.addError(errors, 3, field, 'At least one exact production or test citation is required');
    }
    if (
      citations.issueRequirements !== undefined &&
      (!Array.isArray(citations.issueRequirements) ||
        citations.issueRequirements.some((item) => !isNonEmptyString(item)))
    ) {
      this.addError(errors, 3, `${field}.issueRequirements`, 'issueRequirements must contain only non-empty strings');
    }
  }

  private validateVerdict(
    value: unknown,
    blockingCount: number,
    advisoryCount: number,
    suppliedFindingCount: number,
    errors: ValidationError[],
  ): void {
    const verdict = this.requireObject(value, 'verdict', errors);
    if (!verdict) return;
    const required = [
      'decision',
      'severity',
      'blockingFindingsCount',
      'advisoryFindingsCount',
      'policyDecisionRationale',
    ];
    this.rejectUnknownProperties(verdict, [...required, 'errorMessage'], 'verdict', errors);
    this.requireFields(verdict, required, 'verdict', errors);

    if (!isNonNegativeInteger(verdict.blockingFindingsCount)) {
      this.addError(errors, 2, 'verdict.blockingFindingsCount', 'Count must be a non-negative integer');
    }
    if (!isNonNegativeInteger(verdict.advisoryFindingsCount)) {
      this.addError(errors, 2, 'verdict.advisoryFindingsCount', 'Count must be a non-negative integer');
    }
    if (!isNonEmptyString(verdict.policyDecisionRationale)) {
      this.addError(errors, 3, 'verdict.policyDecisionRationale', 'Policy rationale is required');
    }

    if (verdict.decision === 'ERROR') {
      if (
        verdict.severity !== 'ERROR' ||
        suppliedFindingCount !== 0 ||
        verdict.blockingFindingsCount !== 0 ||
        verdict.advisoryFindingsCount !== 0 ||
        !isNonEmptyString(verdict.errorMessage)
      ) {
        this.addError(
          errors,
          3,
          'verdict',
          'ERROR requires severity ERROR, no findings, zero counts, and a non-empty errorMessage',
        );
      }
      return;
    }

    if (verdict.errorMessage !== undefined) {
      this.addError(errors, 2, 'verdict.errorMessage', 'errorMessage is allowed only for ERROR');
    }

    const policyProperties = isObject(this.policy.properties) ? this.policy.properties : {};
    const failThresholdsSchema = isObject(policyProperties.failThresholds) ? policyProperties.failThresholds : {};
    const failThresholdProperties = isObject(failThresholdsSchema.properties) ? failThresholdsSchema.properties : {};
    const minimumSchema = isObject(failThresholdProperties.blockingFindingsMinimum)
      ? failThresholdProperties.blockingFindingsMinimum
      : {};
    const threshold = Number(minimumSchema.const);
    const expectedDecision = blockingCount >= threshold ? 'FAIL' : 'PASS';
    const expectedSeverity = blockingCount > 0 ? 'BLOCKING' : advisoryCount > 0 ? 'ADVISORY' : 'INFO';

    if (verdict.decision !== expectedDecision) {
      this.addError(errors, 3, 'verdict.decision', `Policy derives ${expectedDecision} from the validated findings`);
    }
    if (verdict.severity !== expectedSeverity) {
      this.addError(errors, 3, 'verdict.severity', `Policy derives ${expectedSeverity} from the validated findings`);
    }
    if (verdict.blockingFindingsCount !== blockingCount) {
      this.addError(errors, 3, 'verdict.blockingFindingsCount', `Expected derived blocking count ${blockingCount}`);
    }
    if (verdict.advisoryFindingsCount !== advisoryCount) {
      this.addError(errors, 3, 'verdict.advisoryFindingsCount', `Expected derived advisory count ${advisoryCount}`);
    }
  }

  private validateSummary(value: unknown, errors: ValidationError[]): void {
    const summary = this.requireObject(value, 'summary', errors);
    if (!summary) return;
    this.rejectUnknownProperties(
      summary,
      [
        'pullRequestNumber',
        'pullRequestCommit',
        'reviewDurationMs',
        'tokensUsed',
        'estimatedCost',
        'contextCollectionStatus',
        'contextLimitations',
      ],
      'summary',
      errors,
    );
    if (
      summary.pullRequestNumber !== undefined &&
      (!Number.isInteger(summary.pullRequestNumber) || Number(summary.pullRequestNumber) < 1)
    ) {
      this.addError(errors, 2, 'summary.pullRequestNumber', 'Must be a positive integer');
    }
    if (
      summary.pullRequestCommit !== undefined &&
      (typeof summary.pullRequestCommit !== 'string' || !/^[a-f0-9]{40}$/.test(summary.pullRequestCommit))
    ) {
      this.addError(errors, 2, 'summary.pullRequestCommit', 'Must be a full commit SHA');
    }
    for (const property of ['reviewDurationMs', 'tokensUsed']) {
      if (summary[property] !== undefined && !isNonNegativeInteger(summary[property])) {
        this.addError(errors, 2, `summary.${property}`, 'Must be a non-negative integer');
      }
    }
    if (
      summary.estimatedCost !== undefined &&
      (typeof summary.estimatedCost !== 'number' || summary.estimatedCost < 0)
    ) {
      this.addError(errors, 2, 'summary.estimatedCost', 'Must be a non-negative number');
    }
    if (
      summary.contextCollectionStatus !== undefined &&
      !['complete', 'partial', 'error'].includes(String(summary.contextCollectionStatus))
    ) {
      this.addError(errors, 2, 'summary.contextCollectionStatus', 'Must be complete, partial, or error');
    }
    if (
      summary.contextLimitations !== undefined &&
      (!Array.isArray(summary.contextLimitations) || summary.contextLimitations.some((item) => !isNonEmptyString(item)))
    ) {
      this.addError(errors, 2, 'summary.contextLimitations', 'Must contain only non-empty strings');
    }
  }

  private result(
    errors: ValidationError[],
    warnings: ValidationError[],
    attribution: JsonObject | undefined,
    findings: unknown[],
    blockingCount: number,
    advisoryCount: number,
  ): ValidationResult {
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      agentName: attribution && typeof attribution.agentName === 'string' ? attribution.agentName : 'unknown',
      findingCount: findings.length,
      blockingCount,
      advisoryCount,
    };
  }

  static computeFileHash(filePath: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  }
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const content = inputPath
    ? fs.readFileSync(inputPath, 'utf8')
    : await new Promise<string>((resolve, reject) => {
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk: string) => {
          input += chunk;
        });
        process.stdin.on('end', () => resolve(input));
        process.stdin.on('error', reject);
      });

  const parsed: unknown = JSON.parse(content);
  const validator = new AdversarialFindingValidator();
  const result = validator.validate(parsed);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : result.errors.some((error) => error.code === 3) ? 3 : 2);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { AdversarialFindingValidator };
export type { ValidationError, ValidationResult };
