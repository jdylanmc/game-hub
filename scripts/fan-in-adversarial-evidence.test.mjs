import { describe, expect, it } from 'vitest';
import { evaluateAdversarialFanIn } from './fan-in-adversarial-evidence.ts';

const headSha = 'a'.repeat(40);

function result(decision = 'PASS') {
  return {
    schemaVersion: '2.0.0',
    findingVersion: 'unit-test-reviewer@2026-08-12T19:00:00Z',
    attribution: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      modelVersion: '2025-04-14',
      promptVersion: '1.0.3',
      promptContentHash: '9d5667c8233da813b06adc93eba7daf832339653b44c617a006df51b21697c68',
      schemaVersion: '2.0.0',
      schemaContentHash: '16cac8840afd4409e88968f695a5f3fb8c445f368ef59875d170dfeb602967e5',
      policyVersion: '2.0.0',
      policyContentHash: 'ed7e5906234a69d282c2102490fc3227703c049c97e63170ffb968c34b478286',
      toolsVersion: '1.0.1',
      subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
      repositoryCommit: headSha,
      contextFingerprint: 'b'.repeat(64),
      calibrationFingerprint: 'c'.repeat(64),
      timestamp: '2026-08-12T19:00:00Z',
    },
    provenance: {
      repository: 'jdylanmc/game-hub',
      pullRequestNumber: 56,
      sourceIssueNumber: 56,
      baseCommit: 'd'.repeat(40),
      headCommit: headSha,
      workflowRunId: 900,
      workflowRunAttempt: 1,
      contextSha256: 'b'.repeat(64),
      configurationFingerprint: 'e'.repeat(64),
    },
    artifactDigest: { algorithm: 'sha256', value: 'f'.repeat(64) },
    verdict:
      decision === 'INCONCLUSIVE'
        ? {
            decision,
            kind: 'COMPUTE',
            severity: 'INCONCLUSIVE',
            blockingFindingsCount: 0,
            advisoryFindingsCount: 0,
            compute: { code: 'MODEL_HTTP_503', message: 'Unavailable.', attempts: 3, retryDelaysMs: [250, 500] },
            policyDecisionRationale: 'Compute unavailable.',
          }
        : {
            decision,
            kind: 'POLICY',
            severity: 'INFO',
            blockingFindingsCount: 0,
            advisoryFindingsCount: 0,
            policyDecisionRationale: 'No blockers.',
          },
    findings: [],
  };
}

function evidence(overrides = {}) {
  return {
    agentName: 'unit-test-reviewer',
    check: {
      name: 'Adversarial Review / unit-test-reviewer',
      headSha,
      conclusion: 'success',
      provenance: { runFingerprint: 'a'.repeat(64), artifactSha256: 'b'.repeat(64) },
    },
    manifest: {
      repository: 'jdylanmc/game-hub',
      headSha,
      agentName: 'unit-test-reviewer',
      checkName: 'Adversarial Review / unit-test-reviewer',
      artifactSha256: 'b'.repeat(64),
    },
    result: result(),
    ...overrides,
  };
}

describe('evaluateAdversarialFanIn', () => {
  it('accepts structurally complete exact-head PASS evidence and preserves INCONCLUSIVE as neutral', () => {
    expect(
      evaluateAdversarialFanIn({
        repoRoot: '.',
        headSha,
        enabledReviewers: ['unit-test-reviewer'],
        evidence: [evidence()],
      }),
    ).toMatchObject({ conclusion: 'success', valid: true });

    const inconclusive = evidence({
      check: {
        ...evidence().check,
        conclusion: 'neutral',
      },
      result: result('INCONCLUSIVE'),
    });
    expect(
      evaluateAdversarialFanIn({
        repoRoot: '.',
        headSha,
        enabledReviewers: ['unit-test-reviewer'],
        evidence: [inconclusive],
      }),
    ).toMatchObject({ conclusion: 'neutral', valid: true });
  });

  it.each([
    ['missing', []],
    ['duplicate', [evidence(), evidence()]],
    ['stale', [evidence({ check: { ...evidence().check, headSha: 'c'.repeat(40) } })]],
    ['mismatched attribution', [evidence({ result: { ...result(), provenance: { ...result().provenance, headCommit: 'c'.repeat(40) } } })]],
    ['failed reviewer', [evidence({ check: { ...evidence().check, conclusion: 'failure' } })]],
    ['invalid provenance', [evidence({ check: { ...evidence().check, provenance: {} } })]],
  ])('fails closed for %s evidence', (_label, evidenceValue) => {
    expect(
      evaluateAdversarialFanIn({
        repoRoot: '.',
        headSha,
        enabledReviewers: ['unit-test-reviewer'],
        evidence: evidenceValue,
      }),
    ).toMatchObject({ conclusion: 'failure', valid: false });
  });
});
