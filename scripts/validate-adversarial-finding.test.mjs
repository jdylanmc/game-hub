import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdversarialFindingValidator } from './validate-adversarial-finding';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = new AdversarialFindingValidator(repoRoot);
const promptHash = AdversarialFindingValidator.computeFileHash(
  path.join(repoRoot, '.github/adversarial-agents/unit-test-reviewer/prompt.md'),
);

function resultWithFinding() {
  return {
    schemaVersion: '1.0.0',
    findingVersion: 'unit-test-reviewer@2026-08-11T19:00:00Z',
    attribution: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      promptVersion: '1.0.0',
      promptContentHash: promptHash,
      policyVersion: '1.0.0',
      toolsVersion: '1.0.0',
      subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
      repositoryCommit: 'a'.repeat(40),
      timestamp: '2026-08-11T19:00:00Z',
    },
    verdict: {
      decision: 'FAIL',
      severity: 'BLOCKING',
      blockingFindingsCount: 1,
      advisoryFindingsCount: 0,
      policyDecisionRationale: 'One validated high-confidence blocking finding.',
    },
    findings: [
      {
        id: 'TAUTOLOGY-1',
        title: 'Assertion cannot fail',
        category: 'tautology',
        severity: 'BLOCKING',
        confidence: 'HIGH',
        description: 'The assertion does not exercise production behavior.',
        citations: {
          productionFiles: [],
          testFiles: [
            {
              path: 'src/example.test.ts',
              startLine: 10,
              endLine: 10,
              snippet: 'expect(true).toBe(true);',
            },
          ],
        },
        missingScenario: 'A production regression must make the test fail.',
        expectedFailureSignal: 'The assertion fails when production output changes.',
        suggestedTest: 'Assert the production function result instead of a literal.',
      },
    ],
  };
}

describe('AdversarialFindingValidator', () => {
  it('accepts an attributable policy-consistent result', () => {
    expect(validator.validate(resultWithFinding())).toMatchObject({
      valid: true,
      blockingCount: 1,
      advisoryCount: 0,
    });
  });

  it('rejects PASS when validated findings require FAIL', () => {
    const input = resultWithFinding();
    input.verdict.decision = 'PASS';
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'verdict.decision', code: 3 })]),
    );
  });

  it('rejects supplied finding counts that differ from derived counts', () => {
    const input = resultWithFinding();
    input.verdict.blockingFindingsCount = 0;
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'verdict.blockingFindingsCount', code: 3 })]),
    );
  });

  it('rejects missing actionable finding fields', () => {
    const input = resultWithFinding();
    Reflect.deleteProperty(input.findings[0], 'suggestedTest');
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'findings[0].suggestedTest' })]),
    );
  });

  it('rejects undeclared properties', () => {
    const input = { ...resultWithFinding(), ignoredVerdict: 'PASS' };
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'ignoredVerdict', code: 2 })]),
    );
  });

  it('rejects incomplete attribution', () => {
    const input = resultWithFinding();
    Reflect.deleteProperty(input.attribution, 'repositoryCommit');
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'attribution.repositoryCommit' })]),
    );
  });
});
