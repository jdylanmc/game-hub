#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, unknown>;

interface AgentRegistration extends JsonObject {
  name: string;
  version: string;
  enabled: boolean;
  promptFile: string;
  promptVersion: string;
  promptContentHash: string;
  toolsConfigFile: string;
  toolsConfigContentHash: string;
  contextConfigFile: string;
  contextConfigVersion: string;
  contextConfigContentHash: string;
  schemaFile: string;
  schemaContentHash: string;
  policyFile: string;
  policyContentHash: string;
  engineConfigFile: string;
  engineConfigContentHash: string;
  benchmarkCorpusFile: string;
  benchmarkCorpusContentHash: string;
  promotionPolicyFile: string;
  promotionPolicyContentHash: string;
  activeCalibrationReportFile: string;
  checkName: string;
  stateNamespace: string;
  executionConfig: {
    maxConcurrentReviews: number;
  };
}

interface RegistryValidation {
  valid: boolean;
  errors: string[];
  agents: AgentRegistration[];
}

const REQUIRED_AGENT_FIELDS = [
  'name',
  'version',
  'enabled',
  'promptFile',
  'promptVersion',
  'promptContentHash',
  'toolsConfigFile',
  'toolsConfigContentHash',
  'contextConfigFile',
  'contextConfigVersion',
  'contextConfigContentHash',
  'schemaFile',
  'schemaContentHash',
  'policyFile',
  'policyContentHash',
  'engineConfigFile',
  'engineConfigContentHash',
  'benchmarkCorpusFile',
  'benchmarkCorpusContentHash',
  'promotionPolicyFile',
  'promotionPolicyContentHash',
  'activeCalibrationReportFile',
  'checkName',
  'stateNamespace',
  'modelDeployment',
  'modelVersion',
  'toolsVersion',
  'description',
  'targetScopes',
  'contactEmail',
  'verdictRules',
  'executionConfig',
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function validateAgentRegistry(
  repoRoot: string,
  value: unknown,
  readFile: (filePath: string) => Buffer = (filePath) => fs.readFileSync(filePath),
): RegistryValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ['Registry must be an object.'], agents: [] };
  const rootAllowed = new Set(['registryVersion', 'agents', 'subscriptionId', 'requirementsMet']);
  for (const property of Object.keys(value)) {
    if (!rootAllowed.has(property)) errors.push(`Registry property is not allowed: ${property}`);
  }
  if (
    value.registryVersion !== '1.0.0' ||
    value.subscriptionId !== '11213dbd-39fe-46ba-87db-5f5e8c449aed' ||
    !isObject(value.requirementsMet) ||
    [...Object.keys(value.requirementsMet)].sort().join(',') !==
      [
        'agentRegistration',
        'dedicatedPromptFiles',
        'independentVersioning',
        'validationRequired',
        'versionedJsonSchema',
      ].join(',') ||
    Object.values(value.requirementsMet).some((requirement) => requirement !== true) ||
    !Array.isArray(value.agents) ||
    value.agents.length < 1
  ) {
    errors.push('Registry identity, subscription, or agent list is invalid.');
    return { valid: false, errors, agents: [] };
  }
  const agents: AgentRegistration[] = [];
  for (const [index, candidate] of value.agents.entries()) {
    if (!isObject(candidate)) {
      errors.push(`agents[${index}] must be an object.`);
      continue;
    }
    const allowed = new Set(REQUIRED_AGENT_FIELDS);
    const missing = REQUIRED_AGENT_FIELDS.filter((field) => !(field in candidate));
    const unknown = Object.keys(candidate).filter(
      (field) => !allowed.has(field as (typeof REQUIRED_AGENT_FIELDS)[number]),
    );
    if (missing.length > 0 || unknown.length > 0) {
      errors.push(`agents[${index}] has missing or undeclared fields.`);
      continue;
    }
    if (
      typeof candidate.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.name) ||
      typeof candidate.version !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(candidate.version) ||
      typeof candidate.promptVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(candidate.promptVersion) ||
      typeof candidate.toolsVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(candidate.toolsVersion) ||
      typeof candidate.contextConfigVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(candidate.contextConfigVersion) ||
      typeof candidate.enabled !== 'boolean' ||
      typeof candidate.checkName !== 'string' ||
      candidate.checkName !== `Adversarial Review / ${candidate.name}` ||
      candidate.stateNamespace !== `adversarial/${candidate.name}` ||
      !isObject(candidate.executionConfig) ||
      Object.keys(candidate.executionConfig).length !== 1 ||
      !Number.isInteger(candidate.executionConfig.maxConcurrentReviews) ||
      Number(candidate.executionConfig.maxConcurrentReviews) < 1 ||
      Number(candidate.executionConfig.maxConcurrentReviews) > 3 ||
      !isObject(candidate.verdictRules) ||
      Object.keys(candidate.verdictRules).length !== 2 ||
      candidate.verdictRules.blockingThreshold !== 1 ||
      typeof candidate.verdictRules.allowHighConfidenceOnly !== 'boolean' ||
      !Array.isArray(candidate.targetScopes) ||
      candidate.targetScopes.length < 1 ||
      candidate.targetScopes.some((scope) => typeof scope !== 'string' || scope.length < 1) ||
      typeof candidate.contactEmail !== 'string' ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate.contactEmail)
    ) {
      errors.push(`agents[${index}] identity, check, namespace, or concurrency is invalid.`);
      continue;
    }
    const registration = candidate as AgentRegistration;
    const filePairs: Array<[string, string]> = [
      ['promptFile', 'promptContentHash'],
      ['toolsConfigFile', 'toolsConfigContentHash'],
      ['contextConfigFile', 'contextConfigContentHash'],
      ['schemaFile', 'schemaContentHash'],
      ['policyFile', 'policyContentHash'],
      ['engineConfigFile', 'engineConfigContentHash'],
      ['benchmarkCorpusFile', 'benchmarkCorpusContentHash'],
      ['promotionPolicyFile', 'promotionPolicyContentHash'],
    ];
    for (const [fileField, hashField] of filePairs) {
      const file = registration[fileField];
      const expectedHash = registration[hashField];
      if (!safeRepositoryPath(file) || typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        errors.push(`agents[${index}].${fileField} or ${hashField} is invalid.`);
        continue;
      }
      try {
        if (sha256(readFile(path.resolve(repoRoot, file))) !== expectedHash) {
          errors.push(`agents[${index}].${hashField} does not match ${fileField}.`);
        }
      } catch {
        errors.push(`agents[${index}].${fileField} cannot be read.`);
      }
    }
    if (
      !safeRepositoryPath(registration.activeCalibrationReportFile) ||
      registration.activeCalibrationReportFile !==
        `config/adversarial-agents/active-calibration-${registration.name}.json`
    ) {
      errors.push(`agents[${index}].activeCalibrationReportFile is not agent-specific.`);
    }
    agents.push(registration);
  }
  const uniqueFields: Array<keyof AgentRegistration> = [
    'name',
    'promptFile',
    'toolsConfigFile',
    'contextConfigFile',
    'schemaFile',
    'policyFile',
    'engineConfigFile',
    'benchmarkCorpusFile',
    'promotionPolicyFile',
    'activeCalibrationReportFile',
    'checkName',
    'stateNamespace',
  ];
  for (const field of uniqueFields) {
    const values = agents.map((agent) => String(agent[field]));
    if (new Set(values).size !== values.length) {
      errors.push(`Agent registrations must not share or impersonate ${String(field)}.`);
    }
  }
  return { valid: errors.length === 0, errors, agents };
}

function loadAgentRegistration(
  repoRoot: string,
  agentName: string,
  options: { allowDisabledForCalibration?: boolean } = {},
): AgentRegistration {
  const registryPath = path.join(repoRoot, 'config/adversarial-agents/agents-config.json');
  const registry: unknown = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const validation = validateAgentRegistry(repoRoot, registry);
  if (!validation.valid) {
    throw new Error(`Adversarial agent registry is invalid: ${validation.errors.join(' ')}`);
  }
  const agent = validation.agents.find((candidate) => candidate.name === agentName);
  if (!agent || (!agent.enabled && !options.allowDisabledForCalibration)) {
    throw new Error(`Adversarial agent is not enabled: ${agentName}`);
  }
  return agent;
}

function main(): void {
  const repoRoot = path.resolve(process.argv[2] ?? '.');
  const registry: unknown = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'), 'utf8'),
  );
  const validation = validateAgentRegistry(repoRoot, registry);
  console.log(JSON.stringify(validation, null, 2));
  process.exitCode = validation.valid ? 0 : 2;
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

export { loadAgentRegistration, validateAgentRegistry };
export type { AgentRegistration, RegistryValidation };
