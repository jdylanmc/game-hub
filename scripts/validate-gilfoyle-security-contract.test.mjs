import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateGilfoyleFindingSchema,
  validateGilfoyleSecurityContract,
  validateGilfoyleSecurityContext,
  validateGilfoyleSecurityPolicy,
  validateGilfoyleToolsContract,
} from './validate-gilfoyle-security-contract.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configRoot = path.join(repoRoot, 'config/adversarial-agents/gilfoyle-security-architect');
const schema = JSON.parse(fs.readFileSync(path.join(configRoot, 'schema.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(path.join(configRoot, 'policy.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(configRoot, 'tools.json'), 'utf8'));
const securityContext = JSON.parse(fs.readFileSync(path.join(configRoot, 'context.json'), 'utf8'));

describe('Gilfoyle security contract', () => {
  it('validates the independently registered contract and content hashes', () => {
    expect(validateGilfoyleSecurityContract(repoRoot)).toEqual({ valid: true, errors: [] });
  });

  it('rejects weakened severity or security-control bypass thresholds', () => {
    const changed = structuredClone(policy);
    changed.decisionRules.blockingSecuritySeverities = ['CRITICAL'];
    changed.decisionRules.blockingSecurityControlBypassAssessments = ['CONFIRMED'];
    expect(validateGilfoyleSecurityPolicy(changed)).toMatchObject({ valid: false });
  });

  it('rejects findings that do not require actionable remediation and verification', () => {
    const changed = structuredClone(schema);
    changed.$defs.finding.required = changed.$defs.finding.required.filter(
      (field) => field !== 'remediation' && field !== 'verificationGuidance',
    );
    expect(validateGilfoyleFindingSchema(changed).errors.join(' ')).toMatch(/remediation|verificationGuidance/);
  });

  it('rejects incomplete model, prompt, schema, policy, or tools attribution', () => {
    const changed = structuredClone(schema);
    changed.properties.attribution.required = changed.properties.attribution.required.filter(
      (field) => field !== 'modelVersion' && field !== 'schemaContentHash' && field !== 'policyContentHash',
    );
    expect(validateGilfoyleFindingSchema(changed).errors.join(' ')).toMatch(/independently require/);
  });

  it('rejects model tools, repository execution, or write capability', () => {
    const changed = {
      ...structuredClone(tools),
      modelTools: ['shell'],
      repositoryCodeExecution: true,
      writeCapabilities: ['checks:write'],
    };
    expect(validateGilfoyleToolsContract(changed)).toMatchObject({ valid: false });
  });

  it('rejects missing trust boundaries or pull-request-accessible privileged identities', () => {
    const changed = structuredClone(securityContext);
    changed.trustModel.trustBoundaries = [];
    changed.trustModel.privilegedIdentities[0].pullRequestAccessible = true;
    expect(validateGilfoyleSecurityContext(changed)).toMatchObject({ valid: false });
  });
});
