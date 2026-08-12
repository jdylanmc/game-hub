#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

type JsonObject = Record<string, unknown>;

interface ContractValidation {
  valid: boolean;
  errors: string[];
}

const AGENT_NAME = 'gilfoyle-security-architect';
const REQUIRED_SECURITY_SURFACES = [
  'application',
  'games',
  'infrastructure',
  'workflows',
  'dependencies',
  'containers',
  'configuration',
  'contracts',
  'manifests',
] as const;
const SECURITY_CATEGORIES = [
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
] as const;
const ACTIONABLE_FIELDS = [
  'confidence',
  'category',
  'citations',
  'exploitOrFailureScenario',
  'impact',
  'remediation',
  'verificationGuidance',
] as const;
const ATTRIBUTION_FIELDS = [
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
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectProperty(value: unknown, property: string): JsonObject | undefined {
  return isObject(value) && isObject(value[property]) ? value[property] : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function sameValues(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function strictObjectSchemaErrors(value: unknown, location = 'schema'): string[] {
  if (!isObject(value)) return [];
  const errors: string[] = [];
  if (value.type === 'object' && value.additionalProperties !== false) {
    errors.push(`${location} must reject undeclared object properties.`);
  }
  for (const [property, nested] of Object.entries(value)) {
    if (isObject(nested)) {
      errors.push(...strictObjectSchemaErrors(nested, `${location}.${property}`));
    } else if (Array.isArray(nested)) {
      nested.forEach((item, index) => {
        errors.push(...strictObjectSchemaErrors(item, `${location}.${property}[${index}]`));
      });
    }
  }
  return errors;
}

function validateGilfoyleFindingSchema(value: unknown): ContractValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ['Finding schema must be an object.'] };
  if (value.version !== '1.0.0') errors.push('Finding schema version must be 1.0.0.');
  errors.push(...strictObjectSchemaErrors(value));

  const rootProperties = objectProperty(value, 'properties');
  const attribution = objectProperty(rootProperties?.attribution, 'properties');
  const attributionRequired = stringArray(objectProperty(rootProperties, 'attribution')?.required);
  if (!sameValues(attributionRequired, ATTRIBUTION_FIELDS)) {
    errors.push('Finding attribution must independently require prompt, schema, policy, tools, and model versions.');
  }
  if (objectProperty(attribution, 'agentName')?.const !== AGENT_NAME) {
    errors.push('Finding attribution must be bound to Gilfoyle.');
  }

  const definitions = objectProperty(value, '$defs');
  const finding = objectProperty(definitions, 'finding');
  const findingProperties = objectProperty(finding, 'properties');
  const findingRequired = stringArray(finding?.required);
  for (const field of ACTIONABLE_FIELDS) {
    if (!findingRequired.includes(field)) errors.push(`Finding schema must require ${field}.`);
  }
  for (const field of ['securitySeverity', 'severity', 'securityControlBypass']) {
    if (!findingRequired.includes(field)) errors.push(`Finding schema must require ${field}.`);
  }
  if (!sameValues(objectProperty(findingProperties, 'category')?.enum, SECURITY_CATEGORIES)) {
    errors.push('Finding schema security taxonomy is incomplete or reordered.');
  }
  if (!sameValues(objectProperty(findingProperties, 'securitySeverity')?.enum, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])) {
    errors.push('Finding schema must define CRITICAL, HIGH, MEDIUM, and LOW security severity.');
  }
  if (!sameValues(objectProperty(findingProperties, 'severity')?.enum, ['BLOCKING', 'ADVISORY'])) {
    errors.push('Finding schema must retain platform BLOCKING and ADVISORY severities.');
  }
  if (!sameValues(objectProperty(findingProperties, 'confidence')?.enum, ['HIGH', 'MEDIUM', 'LOW'])) {
    errors.push('Finding schema must require explicit confidence.');
  }
  if (
    !sameValues(objectProperty(findingProperties, 'securityControlBypass')?.enum, ['CONFIRMED', 'UNCERTAIN', 'NONE'])
  ) {
    errors.push('Finding schema must represent confirmed and uncertain security-control bypasses.');
  }

  const citations = objectProperty(definitions, 'citations');
  const citation = objectProperty(definitions, 'citation');
  if (!sameValues(citation?.required, ['path', 'startLine', 'endLine', 'snippet'])) {
    errors.push('Every citation must require exact path, line range, and snippet evidence.');
  }
  if (!Array.isArray(citations?.anyOf) || citations.anyOf.length !== 2) {
    errors.push('At least one production or test citation must be required.');
  }
  return { valid: errors.length === 0, errors };
}

function validateGilfoyleSecurityPolicy(value: unknown): ContractValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ['Security policy must be an object.'] };
  const rules = objectProperty(value, 'decisionRules');
  const failures = objectProperty(value, 'failureBehavior');
  const citations = objectProperty(value, 'citationRequirements');
  if (value.version !== '1.0.0' || value.agentName !== AGENT_NAME) {
    errors.push('Security policy identity or version is invalid.');
  }
  if (
    rules?.minimumBlockingFindings !== 1 ||
    !sameValues(rules.blockingSecuritySeverities, ['CRITICAL', 'HIGH']) ||
    !sameValues(rules.advisorySecuritySeverities, ['MEDIUM', 'LOW']) ||
    !sameValues(rules.blockingSecurityControlBypassAssessments, ['CONFIRMED', 'UNCERTAIN']) ||
    rules.confidenceRequired !== true ||
    rules.confidenceAffectsBlocking !== false ||
    rules.mediumFindingsAreAdvisory !== true
  ) {
    errors.push('Security blocking thresholds were weakened or made confidence-dependent.');
  }
  for (const failure of [
    'missingContext',
    'malformedOutput',
    'invalidAttribution',
    'timeout',
    'cancellation',
    'serviceOutage',
    'internalFailure',
  ]) {
    if (failures?.[failure] !== 'ERROR') errors.push(`${failure} must fail closed as ERROR.`);
  }
  if (failures?.errorBlocksMerge !== true) errors.push('Security review errors must block merge.');
  if (!sameValues(value.requiredFindingFields, ACTIONABLE_FIELDS)) {
    errors.push('Security policy must require every actionable finding field.');
  }
  if (
    citations?.exactPath !== true ||
    citations.exactLineRange !== true ||
    citations.minimumCitations !== 1 ||
    citations.secretValuesForbidden !== true
  ) {
    errors.push('Security policy must require exact, non-sensitive citation evidence.');
  }
  return { valid: errors.length === 0, errors };
}

function validateGilfoyleToolsContract(value: unknown): ContractValidation {
  const errors: string[] = [];
  if (
    !isObject(value) ||
    value.version !== '1.0.0' ||
    value.agentName !== AGENT_NAME ||
    !Array.isArray(value.modelTools) ||
    value.modelTools.length !== 0 ||
    value.repositoryCodeExecution !== false ||
    !Array.isArray(value.writeCapabilities) ||
    value.writeCapabilities.length !== 0 ||
    !sameValues(value.allowedNetworkDestinations, ['https://*.openai.azure.com']) ||
    value.evidenceSource !== 'bounded-security-context-packet'
  ) {
    errors.push('Gilfoyle tools contract must permit only bounded evidence and the reviewed Azure OpenAI destination.');
  }
  return { valid: errors.length === 0, errors };
}

function validateGilfoyleSecurityContext(value: unknown): ContractValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ['Security context profile must be an object.'] };
  if (
    value.version !== '1.0.0' ||
    value.agentName !== AGENT_NAME ||
    value.maxFilesPerSurface !== 500 ||
    !sameValues(value.requiredSurfaces, REQUIRED_SECURITY_SURFACES)
  ) {
    errors.push('Security context identity, required surfaces, or file bound is invalid.');
  }
  const surfaces = objectProperty(value, 'surfaces');
  for (const surfaceName of REQUIRED_SECURITY_SURFACES) {
    const surface = objectProperty(surfaces, surfaceName);
    if (
      surface?.required !== true ||
      typeof surface.allowAbsent !== 'boolean' ||
      stringArray(surface.patterns).length === 0 ||
      !Array.isArray(surface.requiredContextSections)
    ) {
      errors.push(`Security context surface is incomplete: ${surfaceName}.`);
    }
  }
  const trustModel = objectProperty(value, 'trustModel');
  const protectedControlPlane = objectProperty(trustModel, 'protectedControlPlane');
  if (
    protectedControlPlane?.authoritySource !== 'trusted-protected-branch-workflow' ||
    protectedControlPlane.untrustedOverrideAllowed !== false ||
    protectedControlPlane.evidenceInstructionAuthority !== 'none' ||
    !Array.isArray(trustModel?.privilegedIdentities) ||
    trustModel.privilegedIdentities.length === 0 ||
    trustModel.privilegedIdentities.some(
      (identity) => !isObject(identity) || identity.pullRequestAccessible !== false,
    ) ||
    !Array.isArray(trustModel?.dataSources) ||
    trustModel.dataSources.length === 0 ||
    !Array.isArray(trustModel?.dataSinks) ||
    trustModel.dataSinks.length === 0 ||
    !Array.isArray(trustModel?.trustBoundaries) ||
    trustModel.trustBoundaries.length === 0 ||
    !Array.isArray(value.controlDomains) ||
    value.controlDomains.length === 0
  ) {
    errors.push('Security context trust boundaries, identities, sources, sinks, or controls are incomplete.');
  }
  return { valid: errors.length === 0, errors };
}

function validateGilfoyleSecurityContract(repoRoot: string): ContractValidation {
  const errors: string[] = [];
  const registryPath = path.join(repoRoot, 'config/adversarial-agents/agents-config.json');
  const registry: unknown = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const registryValidation = validateAgentRegistry(repoRoot, registry);
  errors.push(...registryValidation.errors);
  const agent = registryValidation.agents.find((candidate) => candidate.name === AGENT_NAME);
  if (!agent) {
    return { valid: false, errors: [...errors, 'Gilfoyle is not independently registered.'] };
  }
  if (
    agent.version !== '1.0.0' ||
    agent.promptVersion !== '1.0.0' ||
    agent.toolsVersion !== '1.0.0' ||
    agent.contextConfigVersion !== '1.0.0' ||
    agent.contextConfigFile !== 'config/adversarial-agents/gilfoyle-security-architect/context.json' ||
    agent.modelDeployment !== 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard' ||
    agent.modelVersion !== '2025-04-14' ||
    agent.verdictRules.blockingThreshold !== 1 ||
    agent.verdictRules.allowHighConfidenceOnly !== false
  ) {
    errors.push('Gilfoyle registration versions, model attribution, or blocking policy are invalid.');
  }

  const prompt = fs.readFileSync(path.join(repoRoot, agent.promptFile), 'utf8');
  for (const fragment of [
    '**Version**: 1.0.0',
    '**Agent Name**: gilfoyle-security-architect',
    '## Threat Model',
    '## Actionable Finding Requirements',
    '## Attribution',
    '## Decision Rules',
    '`CRITICAL` and `HIGH` findings are `BLOCKING`',
    '`CONFIRMED` and `UNCERTAIN` are always `BLOCKING`',
    'Never reproduce a credential, token, key, connection string',
  ]) {
    if (!prompt.includes(fragment)) errors.push(`Gilfoyle prompt is missing required contract text: ${fragment}`);
  }

  const schema: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, agent.schemaFile), 'utf8'));
  const policy: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, agent.policyFile), 'utf8'));
  const tools: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, agent.toolsConfigFile), 'utf8'));
  const securityContext: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, agent.contextConfigFile), 'utf8'));
  errors.push(...validateGilfoyleFindingSchema(schema).errors);
  errors.push(...validateGilfoyleSecurityPolicy(policy).errors);
  errors.push(...validateGilfoyleToolsContract(tools).errors);
  errors.push(...validateGilfoyleSecurityContext(securityContext).errors);

  const engine: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, agent.engineConfigFile), 'utf8'));
  if (
    !isObject(engine) ||
    engine.expectedDeploymentId !== 'game-hub-gilfoyle-security-architect' ||
    !Array.isArray(engine.allowedTools) ||
    engine.allowedTools.length !== 0 ||
    objectProperty(engine, 'limits')?.maxConcurrentReviews !== 1
  ) {
    errors.push('Gilfoyle engine contract must retain its independent deployment, no-tool boundary, and capacity.');
  }
  return { valid: errors.length === 0, errors };
}

function main(): void {
  const repoRoot = path.resolve(process.argv[2] ?? '.');
  const validation = validateGilfoyleSecurityContract(repoRoot);
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

export {
  validateGilfoyleFindingSchema,
  validateGilfoyleSecurityContract,
  validateGilfoyleSecurityContext,
  validateGilfoyleSecurityPolicy,
  validateGilfoyleToolsContract,
};
export type { ContractValidation };
