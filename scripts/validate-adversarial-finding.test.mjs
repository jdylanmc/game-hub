import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdversarialFindingValidator } from './validate-adversarial-finding';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = new AdversarialFindingValidator(repoRoot);
const registration = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'), 'utf8'),
).agents.find((agent) => agent.name === 'unit-test-reviewer');

function resultWithFinding() {
  return {
    schemaVersion: '2.0.0',
    findingVersion: 'unit-test-reviewer@2026-08-12T19:00:00Z',
    attribution: {
      agentName: 'unit-test-reviewer',
      agentVersion: registration.version,
      modelDeployment: registration.modelDeployment,
      modelVersion: registration.modelVersion,
      promptVersion: registration.promptVersion,
      promptContentHash: registration.promptContentHash,
      policyVersion: '2.0.0',
      toolsVersion: registration.toolsVersion,
      schemaVersion: '2.0.0',
      schemaContentHash: registration.schemaContentHash,
      policyContentHash: registration.policyContentHash,
      contextFingerprint: 'c'.repeat(64),
      calibrationFingerprint: 'd'.repeat(64),
      subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
      repositoryCommit: 'a'.repeat(40),
      timestamp: '2026-08-12T19:00:00Z',
    },
    provenance: {
      repository: 'jdylanmc/game-hub',
      pullRequestNumber: 56,
      sourceIssueNumber: 56,
      baseCommit: 'b'.repeat(40),
      headCommit: 'a'.repeat(40),
      workflowRunId: 1,
      workflowRunAttempt: 1,
      contextSha256: 'c'.repeat(64),
      configurationFingerprint: 'd'.repeat(64),
    },
    artifactDigest: { algorithm: 'sha256', value: 'e'.repeat(64) },
    verdict: {
      decision: 'FAIL',
      kind: 'POLICY',
      severity: 'BLOCKING',
      blockingFindingsCount: 1,
      advisoryFindingsCount: 0,
      policyDecisionRationale: 'One critic-confirmed blocker.',
    },
    findings: [
      {
        id: 'TAUTOLOGY-1',
        title: 'Assertion cannot fail',
        category: 'tautology',
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
        proposedSeverity: 'BLOCKING',
        severity: 'BLOCKING',
        policyRule: 'High-confidence blockers require remediation.',
        failureScenario: 'A production regression makes the assertion pass.',
        impact: 'The regression can merge undetected.',
        remediation: ['Exercise production behavior.'],
        verificationGuidance: 'Demonstrate that the regression fails the test.',
        critic: {
          decision: 'CONFIRM',
          rationale: 'The cited assertion cannot observe production behavior.',
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
        },
      },
    ],
  };
}

describe('AdversarialFindingValidator', () => {
  it('accepts the shared PASS, confirmed FAIL, platform FAIL, and compute-only INCONCLUSIVE contract', () => {
    const pass = {
      schemaVersion: '2.0.0',
      findingVersion: 'unit-test-reviewer@2026-08-12T19:00:00Z',
      attribution: {
        ...resultWithFinding().attribution,
        agentVersion: registration.version,
        modelDeployment: registration.modelDeployment,
        modelVersion: registration.modelVersion,
        promptVersion: registration.promptVersion,
        promptContentHash: registration.promptContentHash,
        policyVersion: '2.0.0',
        toolsVersion: registration.toolsVersion,
        schemaVersion: '2.0.0',
        schemaContentHash: registration.schemaContentHash,
        policyContentHash: registration.policyContentHash,
        contextFingerprint: 'c'.repeat(64),
        calibrationFingerprint: 'd'.repeat(64),
      },
      provenance: {
        repository: 'jdylanmc/game-hub',
        pullRequestNumber: 56,
        sourceIssueNumber: 56,
        baseCommit: 'b'.repeat(40),
        headCommit: 'a'.repeat(40),
        workflowRunId: 1,
        workflowRunAttempt: 1,
        contextSha256: 'c'.repeat(64),
        configurationFingerprint: 'd'.repeat(64),
      },
      artifactDigest: { algorithm: 'sha256', value: 'e'.repeat(64) },
      verdict: {
        decision: 'PASS',
        kind: 'POLICY',
        severity: 'INFO',
        blockingFindingsCount: 0,
        advisoryFindingsCount: 0,
        policyDecisionRationale: 'No confirmed blocking finding.',
      },
      findings: [],
    };
    const confirmedFail = {
      ...pass,
      verdict: {
        decision: 'FAIL',
        kind: 'POLICY',
        severity: 'BLOCKING',
        blockingFindingsCount: 1,
        advisoryFindingsCount: 0,
        policyDecisionRationale: 'One critic-confirmed blocker.',
      },
      findings: [
        {
          id: 'TAUTOLOGY-1',
          title: 'Assertion cannot fail',
          category: 'tautology',
          confidence: 'HIGH',
          description: 'The assertion does not exercise production behavior.',
          citations: resultWithFinding().findings[0].citations,
          proposedSeverity: 'BLOCKING',
          severity: 'BLOCKING',
          policyRule: 'High-confidence blockers require remediation.',
          failureScenario: 'A production regression makes the assertion pass.',
          impact: 'The regression can merge undetected.',
          remediation: ['Exercise production behavior.'],
          verificationGuidance: 'Demonstrate that the regression fails the test.',
          critic: {
            decision: 'CONFIRM',
            rationale: 'The cited assertion cannot observe production behavior.',
            citations: resultWithFinding().findings[0].citations,
          },
        },
      ],
    };
    const platformFail = {
      ...pass,
      verdict: {
        decision: 'FAIL',
        kind: 'PLATFORM',
        severity: 'ERROR',
        blockingFindingsCount: 0,
        advisoryFindingsCount: 0,
        platformError: { code: 'SCHEMA_VALIDATION_FAILED', message: 'Output was malformed.' },
        policyDecisionRationale: 'The platform failed closed.',
      },
    };
    const inconclusive = {
      ...pass,
      verdict: {
        decision: 'INCONCLUSIVE',
        kind: 'COMPUTE',
        severity: 'INCONCLUSIVE',
        blockingFindingsCount: 0,
        advisoryFindingsCount: 0,
        compute: {
          code: 'MODEL_UNAVAILABLE',
          attempts: 3,
          retryDelaysMs: [250, 500],
          message: 'The reviewed model endpoint remained unavailable.',
        },
        policyDecisionRationale: 'Compute was unavailable after the bounded retries.',
      },
    };

    for (const result of [pass, confirmedFail, platformFail, inconclusive]) {
      expect(validator.validate(result).errors).toEqual([]);
    }
  });

  it('rejects legacy ERROR and incomplete blocker, critic, provenance, or digest evidence', () => {
    const legacy = resultWithFinding();
    legacy.verdict.decision = 'ERROR';
    expect(validator.validate(legacy).valid).toBe(false);
  });

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
      expect.arrayContaining([expect.objectContaining({ field: 'verdict', code: 3 })]),
    );
  });

  it('rejects supplied finding counts that differ from derived counts', () => {
    const input = resultWithFinding();
    input.verdict.blockingFindingsCount = 0;
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'verdict', code: 3 })]),
    );
  });

  it('rejects missing actionable finding fields', () => {
    const input = resultWithFinding();
    Reflect.deleteProperty(input.findings[0], 'verificationGuidance');
    expect(validator.validate(input).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'findings[0].verificationGuidance' })]),
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
