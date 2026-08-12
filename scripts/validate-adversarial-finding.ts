#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentRegistration } from './validate-adversarial-agent-registry.ts';

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
const SECURITY_FINDING_CATEGORIES = new Set([
  'authentication',
  'authorization',
  'injection',
  'secret-exposure',
  'cryptography',
  'workflow-permission-escalation',
  'supply-chain',
  'dependency-risk',
  'infrastructure-privilege',
  'network-exposure',
  'data-protection',
  'container-hardening',
  'unsafe-deserialization',
  'path-traversal',
  'race-condition',
  'resource-cleanup',
  'configuration',
  'security-control-bypass',
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
  private readonly agentName: string;

  constructor(repoRoot = '.', agentName = 'unit-test-reviewer', allowDisabledForCalibration = false) {
    this.repoRoot = repoRoot;
    this.agentName = agentName;
    const registration = loadAgentRegistration(repoRoot, agentName, { allowDisabledForCalibration });
    this.schema = this.loadJson(path.join(repoRoot, registration.schemaFile));
    this.policy = this.loadJson(path.join(repoRoot, registration.policyFile));
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
    if (isObject(input) && input.schemaVersion === '2.0.0') {
      return this.validateSharedContract(input);
    }
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
    if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
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

    const blockingCount = validatedFindings.filter((finding) =>
      this.agentName === 'gilfoyle-security-architect'
        ? finding.severity === 'BLOCKING'
        : finding.severity === 'BLOCKING' && finding.confidence === 'HIGH',
    ).length;
    const advisoryCount = validatedFindings.length - blockingCount;
    this.validateVerdict(root.verdict, blockingCount, advisoryCount, findings.length, errors);

    if (root.summary !== undefined) {
      this.validateSummary(root.summary, errors);
    }

    return this.result(errors, warnings, attribution, findings, blockingCount, advisoryCount);
  }

  private validateSharedContract(root: JsonObject): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const required = ['schemaVersion', 'findingVersion', 'attribution', 'provenance', 'artifactDigest', 'verdict', 'findings'];
    this.rejectUnknownProperties(root, [...required, 'summary', 'presentation'], '', errors);
    this.requireFields(root, required, '', errors);
    if (root.schemaVersion !== '2.0.0') {
      this.addError(errors, 2, 'schemaVersion', 'schemaVersion must be 2.0.0');
    }
    if (
      typeof root.findingVersion !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(root.findingVersion)
    ) {
      this.addError(errors, 2, 'findingVersion', 'findingVersion must use agent-name@YYYY-MM-DDTHH:MM:SSZ');
    }

    const attribution = this.requireObject(root.attribution, 'attribution', errors);
    const provenance = this.requireObject(root.provenance, 'provenance', errors);
    const digest = this.requireObject(root.artifactDigest, 'artifactDigest', errors);
    const findings = Array.isArray(root.findings) ? root.findings : [];
    if (!Array.isArray(root.findings)) this.addError(errors, 1, 'findings', 'findings must be an array');

    const agent = this.validateSharedAttribution(attribution, errors);
    this.validateSharedProvenance(provenance, attribution, errors);
    this.validateSharedDigest(digest, errors);
    if (root.summary !== undefined) this.validateSummary(root.summary, errors);
    if (root.presentation !== undefined) this.validateSharedPresentation(root.presentation, errors);

    let blockingCount = 0;
    let advisoryCount = 0;
    for (const [index, finding] of findings.entries()) {
      const effectiveSeverity = this.validateSharedFinding(finding, index, errors);
      if (effectiveSeverity === 'BLOCKING') blockingCount += 1;
      else if (effectiveSeverity === 'ADVISORY') advisoryCount += 1;
    }
    this.validateSharedVerdict(root.verdict, findings.length, blockingCount, advisoryCount, errors);
    return this.result(errors, warnings, attribution, findings, blockingCount, advisoryCount);
  }

  private validateSharedPresentation(value: unknown, errors: ValidationError[]): void {
    const presentation = this.requireObject(value, 'presentation', errors);
    if (!presentation) return;
    this.rejectUnknownProperties(presentation, ['title', 'summary', 'mode'], 'presentation', errors);
    this.requireFields(presentation, ['title', 'summary', 'mode'], 'presentation', errors);
    if (
      !isNonEmptyString(presentation.title) ||
      !isNonEmptyString(presentation.summary) ||
      !['PERSONA', 'NEUTRAL_FALLBACK'].includes(String(presentation.mode))
    ) {
      this.addError(errors, 3, 'presentation', 'presentation must be a validated persona or neutral fallback');
    }
  }

  private validateSharedAttribution(
    value: JsonObject | undefined,
    errors: ValidationError[],
  ): JsonObject | undefined {
    if (!value) return undefined;
    const required = [
      'agentName',
      'agentVersion',
      'modelDeployment',
      'modelVersion',
      'promptVersion',
      'promptContentHash',
      'schemaVersion',
      'schemaContentHash',
      'policyVersion',
      'policyContentHash',
      'toolsVersion',
      'subscriptionId',
      'repositoryCommit',
      'contextFingerprint',
      'calibrationFingerprint',
      'timestamp',
    ];
    this.rejectUnknownProperties(value, required, 'attribution', errors);
    this.requireFields(value, required, 'attribution', errors);
    const agents = Array.isArray(this.registry.agents) ? this.registry.agents : [];
    const registered = agents.find((candidate): candidate is JsonObject => isObject(candidate) && candidate.name === value.agentName);
    if (!registered) {
      this.addError(errors, 3, 'attribution.agentName', 'agentName is not a registered reviewer');
      return value;
    }
    const exactFields: Array<[string, string]> = [
      ['agentVersion', 'version'],
      ['modelDeployment', 'modelDeployment'],
      ['modelVersion', 'modelVersion'],
      ['promptVersion', 'promptVersion'],
      ['promptContentHash', 'promptContentHash'],
      ['schemaContentHash', 'schemaContentHash'],
      ['policyContentHash', 'policyContentHash'],
      ['toolsVersion', 'toolsVersion'],
      ['subscriptionId', 'subscriptionId'],
    ];
    for (const [field, registrationField] of exactFields) {
      const expected =
        registrationField === 'subscriptionId' ? this.registry.subscriptionId : registered[registrationField];
      if (value[field] !== expected) {
        this.addError(errors, 3, `attribution.${field}`, `${field} does not match the registered configuration`);
      }
    }
    if (value.schemaVersion !== '2.0.0') {
      this.addError(errors, 3, 'attribution.schemaVersion', 'schemaVersion must be 2.0.0');
    }
    if (value.policyVersion !== this.policy.version) {
      this.addError(errors, 3, 'attribution.policyVersion', 'policyVersion does not match the reviewed policy');
    }
    for (const field of ['promptContentHash', 'schemaContentHash', 'policyContentHash', 'contextFingerprint', 'calibrationFingerprint']) {
      if (typeof value[field] !== 'string' || !/^[a-f0-9]{64}$/.test(value[field])) {
        this.addError(errors, 2, `attribution.${field}`, `${field} must be a SHA-256 digest`);
      }
    }
    if (typeof value.repositoryCommit !== 'string' || !/^[a-f0-9]{40}$/.test(value.repositoryCommit)) {
      this.addError(errors, 2, 'attribution.repositoryCommit', 'repositoryCommit must be a full commit SHA');
    }
    if (typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))) {
      this.addError(errors, 2, 'attribution.timestamp', 'timestamp must be an ISO 8601 date-time');
    }
    return value;
  }

  private validateSharedProvenance(
    value: JsonObject | undefined,
    attribution: JsonObject | undefined,
    errors: ValidationError[],
  ): void {
    if (!value) return;
    const required = [
      'repository',
      'pullRequestNumber',
      'sourceIssueNumber',
      'baseCommit',
      'headCommit',
      'workflowRunId',
      'workflowRunAttempt',
      'contextSha256',
      'configurationFingerprint',
    ];
    this.rejectUnknownProperties(value, required, 'provenance', errors);
    this.requireFields(value, required, 'provenance', errors);
    if (typeof value.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)) {
      this.addError(errors, 2, 'provenance.repository', 'repository must use owner/name format');
    }
    for (const field of ['pullRequestNumber', 'sourceIssueNumber', 'workflowRunId', 'workflowRunAttempt']) {
      if (!Number.isInteger(value[field]) || Number(value[field]) < 1) {
        this.addError(errors, 2, `provenance.${field}`, `${field} must be a positive integer`);
      }
    }
    for (const field of ['baseCommit', 'headCommit']) {
      if (typeof value[field] !== 'string' || !/^[a-f0-9]{40}$/.test(value[field])) {
        this.addError(errors, 2, `provenance.${field}`, `${field} must be a full commit SHA`);
      }
    }
    for (const field of ['contextSha256', 'configurationFingerprint']) {
      if (typeof value[field] !== 'string' || !/^[a-f0-9]{64}$/.test(value[field])) {
        this.addError(errors, 2, `provenance.${field}`, `${field} must be a SHA-256 digest`);
      }
    }
    if (attribution?.repositoryCommit !== value.headCommit) {
      this.addError(errors, 3, 'provenance.headCommit', 'headCommit must match attribution.repositoryCommit');
    }
    if (attribution?.contextFingerprint !== value.contextSha256) {
      this.addError(errors, 3, 'provenance.contextSha256', 'contextSha256 must match attribution.contextFingerprint');
    }
  }

  private validateSharedDigest(value: JsonObject | undefined, errors: ValidationError[]): void {
    if (!value) return;
    this.rejectUnknownProperties(value, ['algorithm', 'value'], 'artifactDigest', errors);
    this.requireFields(value, ['algorithm', 'value'], 'artifactDigest', errors);
    if (value.algorithm !== 'sha256' || typeof value.value !== 'string' || !/^[a-f0-9]{64}$/.test(value.value)) {
      this.addError(errors, 2, 'artifactDigest', 'artifactDigest must contain a SHA-256 value');
    }
  }

  private validateSharedFinding(value: unknown, index: number, errors: ValidationError[]): 'BLOCKING' | 'ADVISORY' | undefined {
    const field = `findings[${index}]`;
    const finding = this.requireObject(value, field, errors);
    if (!finding) return undefined;
    const required = [
      'id',
      'title',
      'category',
      'proposedSeverity',
      'severity',
      'confidence',
      'description',
      'citations',
      'policyRule',
      'failureScenario',
      'impact',
      'remediation',
      'verificationGuidance',
    ];
    this.rejectUnknownProperties(finding, [...required, 'critic'], field, errors);
    this.requireFields(finding, required, field, errors);
    if (typeof finding.id !== 'string' || !/^[A-Z0-9]+-\d+$/.test(finding.id)) {
      this.addError(errors, 2, `${field}.id`, 'id must match CATEGORY-001');
    }
    for (const name of ['title', 'category', 'description', 'policyRule', 'failureScenario', 'impact', 'verificationGuidance']) {
      if (!isNonEmptyString(finding[name])) this.addError(errors, 3, `${field}.${name}`, `${name} must be non-empty`);
    }
    if (!['BLOCKING', 'ADVISORY'].includes(String(finding.proposedSeverity))) {
      this.addError(errors, 2, `${field}.proposedSeverity`, 'proposedSeverity must be BLOCKING or ADVISORY');
    }
    if (!['BLOCKING', 'ADVISORY'].includes(String(finding.severity))) {
      this.addError(errors, 2, `${field}.severity`, 'severity must be BLOCKING or ADVISORY');
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(String(finding.confidence))) {
      this.addError(errors, 2, `${field}.confidence`, 'confidence must be HIGH, MEDIUM, or LOW');
    }
    if (!Array.isArray(finding.remediation) || finding.remediation.length === 0 || finding.remediation.some((item) => !isNonEmptyString(item))) {
      this.addError(errors, 3, `${field}.remediation`, 'remediation must contain actionable non-empty steps');
    }
    this.validateCitations(finding.citations, field, errors);
    if (finding.proposedSeverity === 'ADVISORY' && finding.critic === undefined) return 'ADVISORY';
    const critic = this.requireObject(finding.critic, `${field}.critic`, errors);
    if (!critic) {
      if (finding.proposedSeverity === 'BLOCKING') {
        this.addError(errors, 1, `${field}.critic`, 'every proposed blocker requires separate critic evidence');
      }
      return undefined;
    }
    this.rejectUnknownProperties(critic, ['decision', 'rationale', 'citations'], `${field}.critic`, errors);
    this.requireFields(critic, ['decision', 'rationale', 'citations'], `${field}.critic`, errors);
    if (!['CONFIRM', 'REJECT', 'INCONCLUSIVE'].includes(String(critic.decision))) {
      this.addError(errors, 2, `${field}.critic.decision`, 'critic decision is invalid');
    }
    if (!isNonEmptyString(critic.rationale)) {
      this.addError(errors, 3, `${field}.critic.rationale`, 'critic rationale is required');
    }
    this.validateCitations(critic.citations, `${field}.critic`, errors);
    const expected =
      finding.proposedSeverity === 'BLOCKING'
        ? critic.decision === 'CONFIRM' || (critic.decision === 'INCONCLUSIVE' && finding.confidence === 'HIGH')
          ? 'BLOCKING'
          : 'ADVISORY'
        : 'ADVISORY';
    if (finding.severity !== expected) {
      this.addError(errors, 3, `${field}.severity`, `critic semantics derive ${expected} severity`);
    }
    return expected;
  }

  private validateSharedVerdict(
    value: unknown,
    findingCount: number,
    blockingCount: number,
    advisoryCount: number,
    errors: ValidationError[],
  ): void {
    const verdict = this.requireObject(value, 'verdict', errors);
    if (!verdict) return;
    const common = ['decision', 'kind', 'severity', 'blockingFindingsCount', 'advisoryFindingsCount', 'policyDecisionRationale'];
    this.rejectUnknownProperties(verdict, [...common, 'platformError', 'compute'], 'verdict', errors);
    this.requireFields(verdict, common, 'verdict', errors);
    if (!isNonEmptyString(verdict.policyDecisionRationale)) {
      this.addError(errors, 3, 'verdict.policyDecisionRationale', 'policyDecisionRationale is required');
    }
    if (verdict.blockingFindingsCount !== blockingCount || verdict.advisoryFindingsCount !== advisoryCount) {
      this.addError(errors, 3, 'verdict', 'finding counts must match critic-adjusted findings');
    }
    if (verdict.kind === 'POLICY') {
      const expectedDecision = blockingCount > 0 ? 'FAIL' : 'PASS';
      const expectedSeverity = blockingCount > 0 ? 'BLOCKING' : advisoryCount > 0 ? 'ADVISORY' : 'INFO';
      if (verdict.decision !== expectedDecision || verdict.severity !== expectedSeverity || verdict.platformError || verdict.compute) {
        this.addError(errors, 3, 'verdict', 'policy verdict does not match critic-adjusted findings');
      }
      return;
    }
    if (verdict.kind === 'PLATFORM') {
      const platformError = this.requireObject(verdict.platformError, 'verdict.platformError', errors);
      if (
        verdict.decision !== 'FAIL' ||
        verdict.severity !== 'ERROR' ||
        findingCount !== 0 ||
        blockingCount !== 0 ||
        advisoryCount !== 0 ||
        verdict.compute ||
        !platformError ||
        !isNonEmptyString(platformError.code) ||
        !isNonEmptyString(platformError.message)
      ) {
        this.addError(errors, 3, 'verdict', 'platform failures require zero findings and platform error evidence');
      }
      return;
    }
    if (verdict.kind === 'COMPUTE') {
      const compute = this.requireObject(verdict.compute, 'verdict.compute', errors);
      const delays = compute && Array.isArray(compute.retryDelaysMs) ? compute.retryDelaysMs : [];
      if (
        verdict.decision !== 'INCONCLUSIVE' ||
        verdict.severity !== 'INCONCLUSIVE' ||
        findingCount !== 0 ||
        blockingCount !== 0 ||
        advisoryCount !== 0 ||
        verdict.platformError ||
        !compute ||
        !isNonEmptyString(compute.code) ||
        !isNonEmptyString(compute.message) ||
        compute.attempts !== 3 ||
        delays.length !== 2 ||
        delays.some((delay) => !Number.isInteger(delay) || Number(delay) < 1 || Number(delay) > 30000) ||
        Number(delays[1]) < Number(delays[0])
      ) {
        this.addError(errors, 3, 'verdict', 'compute-only INCONCLUSIVE requires three bounded attempts');
      }
      return;
    }
    this.addError(errors, 2, 'verdict.kind', 'verdict kind must be POLICY, PLATFORM, or COMPUTE');
  }

  private validateAttribution(value: unknown, errors: ValidationError[]): JsonObject | undefined {
    const attribution = this.requireObject(value, 'attribution', errors);
    if (!attribution) return undefined;

    const fields = [
      'agentName',
      'agentVersion',
      'modelDeployment',
      'modelVersion',
      'promptVersion',
      'promptContentHash',
      'schemaVersion',
      'schemaContentHash',
      'policyVersion',
      'policyContentHash',
      'toolsVersion',
      'subscriptionId',
      'repositoryCommit',
      'timestamp',
    ];
    const allowedFields =
      this.agentName === 'gilfoyle-security-architect'
        ? fields
        : fields.filter(
            (field) => !['modelVersion', 'schemaVersion', 'schemaContentHash', 'policyContentHash'].includes(field),
          );
    this.rejectUnknownProperties(attribution, allowedFields, 'attribution', errors);
    this.requireFields(attribution, allowedFields, 'attribution', errors);

    if (typeof attribution.agentName !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(attribution.agentName)) {
      this.addError(errors, 2, 'attribution.agentName', 'agentName must be kebab-case');
    } else if (attribution.agentName !== this.agentName) {
      this.addError(errors, 3, 'attribution.agentName', 'agentName does not match the selected independent agent');
    }
    const versionFields = ['agentVersion', 'promptVersion', 'policyVersion', 'toolsVersion'];
    if (this.agentName === 'gilfoyle-security-architect') versionFields.push('schemaVersion');
    for (const field of versionFields) {
      if (typeof attribution[field] !== 'string' || !/^\d+\.\d+\.\d+$/.test(attribution[field])) {
        this.addError(errors, 2, `attribution.${field}`, `${field} must be a semantic version`);
      }
    }
    const hashFields = ['promptContentHash'];
    if (this.agentName === 'gilfoyle-security-architect') {
      hashFields.push('schemaContentHash', 'policyContentHash');
    }
    for (const field of hashFields) {
      if (typeof attribution[field] !== 'string' || !/^[a-f0-9]{64}$/.test(attribution[field])) {
        this.addError(errors, 2, `attribution.${field}`, `${field} must be a lowercase SHA-256 value`);
      }
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
      ...(this.agentName === 'gilfoyle-security-architect'
        ? {
            modelVersion: agent.modelVersion,
            schemaVersion: this.schema.version,
            schemaContentHash: agent.schemaContentHash,
            policyContentHash: agent.policyContentHash,
          }
        : {}),
      promptVersion: agent.promptVersion,
      promptContentHash: agent.promptContentHash,
      toolsVersion: agent.toolsVersion,
      policyVersion: SUPPORTED_SCHEMA_VERSION,
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
    if (this.agentName === 'gilfoyle-security-architect') {
      return this.validateSecurityFinding(value, index, errors);
    }
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

  private validateSecurityFinding(value: unknown, index: number, errors: ValidationError[]): JsonObject | undefined {
    const field = `findings[${index}]`;
    const finding = this.requireObject(value, field, errors);
    if (!finding) return undefined;

    const required = [
      'id',
      'title',
      'category',
      'securitySeverity',
      'severity',
      'confidence',
      'securityControlBypass',
      'description',
      'citations',
      'exploitOrFailureScenario',
      'impact',
      'remediation',
      'verificationGuidance',
    ];
    this.rejectUnknownProperties(finding, [...required, 'evidenceLimitations'], field, errors);
    this.requireFields(finding, required, field, errors);

    if (typeof finding.id !== 'string' || !/^[A-Z0-9]+-\d+$/.test(finding.id)) {
      this.addError(errors, 2, `${field}.id`, 'id must match CATEGORY-001');
    }
    for (const property of [
      'title',
      'description',
      'exploitOrFailureScenario',
      'impact',
      'remediation',
      'verificationGuidance',
    ]) {
      if (!isNonEmptyString(finding[property])) {
        this.addError(errors, 3, `${field}.${property}`, `${property} must be non-empty`);
      }
    }
    if (typeof finding.category !== 'string' || !SECURITY_FINDING_CATEGORIES.has(finding.category)) {
      this.addError(errors, 2, `${field}.category`, 'category is not supported');
    }
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(String(finding.securitySeverity))) {
      this.addError(errors, 2, `${field}.securitySeverity`, 'securitySeverity is not supported');
    }
    if (!['BLOCKING', 'ADVISORY'].includes(String(finding.severity))) {
      this.addError(errors, 2, `${field}.severity`, 'severity must be BLOCKING or ADVISORY');
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(String(finding.confidence))) {
      this.addError(errors, 2, `${field}.confidence`, 'confidence must be HIGH, MEDIUM, or LOW');
    }
    if (!['CONFIRMED', 'UNCERTAIN', 'NONE'].includes(String(finding.securityControlBypass))) {
      this.addError(errors, 2, `${field}.securityControlBypass`, 'securityControlBypass is not supported');
    }
    const expectedSeverity =
      ['CRITICAL', 'HIGH'].includes(String(finding.securitySeverity)) ||
      ['CONFIRMED', 'UNCERTAIN'].includes(String(finding.securityControlBypass))
        ? 'BLOCKING'
        : 'ADVISORY';
    if (finding.severity !== expectedSeverity) {
      this.addError(
        errors,
        3,
        `${field}.severity`,
        `Security policy derives ${expectedSeverity} from severity and control-bypass assessment`,
      );
    }
    this.validateCitations(finding.citations, field, errors);
    if (
      finding.evidenceLimitations !== undefined &&
      (!Array.isArray(finding.evidenceLimitations) ||
        finding.evidenceLimitations.some((item) => !isNonEmptyString(item)))
    ) {
      this.addError(errors, 3, `${field}.evidenceLimitations`, 'Evidence limitations must be non-empty strings');
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
      this.addError(errors, 3, 'verdict.decision', 'ERROR was replaced by platform FAIL or compute-only INCONCLUSIVE');
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
    const decisionRules = isObject(this.policy.decisionRules) ? this.policy.decisionRules : {};
    const threshold =
      this.agentName === 'gilfoyle-security-architect'
        ? Number(decisionRules.minimumBlockingFindings)
        : Number(minimumSchema.const);
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
