import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'), 'utf8'),
);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('validateAgentRegistry', () => {
  it('validates the protected independent-agent registry and its content hashes', () => {
    expect(validateAgentRegistry(repoRoot, registry)).toMatchObject({ valid: true, errors: [] });
  });

  it('rejects tampered registered policy content', () => {
    const validation = validateAgentRegistry(repoRoot, registry, (filePath) => {
      if (filePath.endsWith('/policy.json')) return Buffer.from('tampered policy');
      return fs.readFileSync(filePath);
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/policyContentHash/);
  });

  it('rejects shared state, check identity, prompts, policies, or calibration between agents', () => {
    const changed = structuredClone(registry);
    changed.agents.push({
      ...structuredClone(changed.agents[0]),
      name: 'second-reviewer',
      checkName: changed.agents[0].checkName,
      stateNamespace: changed.agents[0].stateNamespace,
      activeCalibrationReportFile: changed.agents[0].activeCalibrationReportFile,
    });
    const validation = validateAgentRegistry(repoRoot, changed);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/check|namespace|share|impersonate|agent-specific/i);
  });

  it('accepts a second agent only with independent configuration, check, calibration, state, and concurrency', () => {
    const changed = structuredClone(registry);
    const second = structuredClone(changed.agents[0]);
    second.name = 'second-reviewer';
    second.checkName = 'Adversarial Review / second-reviewer';
    second.stateNamespace = 'adversarial/second-reviewer';
    second.activeCalibrationReportFile = 'config/adversarial-agents/active-calibration-second-reviewer.json';
    second.executionConfig.maxConcurrentReviews = 1;
    const fileContent = new Map();
    for (const [fileField, hashField] of [
      ['promptFile', 'promptContentHash'],
      ['toolsConfigFile', 'toolsConfigContentHash'],
      ['contextConfigFile', 'contextConfigContentHash'],
      ['schemaFile', 'schemaContentHash'],
      ['policyFile', 'policyContentHash'],
      ['engineConfigFile', 'engineConfigContentHash'],
      ['benchmarkCorpusFile', 'benchmarkCorpusContentHash'],
      ['promotionPolicyFile', 'promotionPolicyContentHash'],
    ]) {
      second[fileField] = `config/adversarial-agents/second/${path.basename(second[fileField])}`;
      const content = Buffer.from(`independent ${fileField}`);
      second[hashField] = sha256(content);
      fileContent.set(path.resolve(repoRoot, second[fileField]), content);
    }
    changed.agents.push(second);
    const validation = validateAgentRegistry(repoRoot, changed, (filePath) => {
      return fileContent.get(filePath) ?? fs.readFileSync(filePath);
    });
    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(validation.agents.at(-1).executionConfig.maxConcurrentReviews).toBe(1);
  });
});
