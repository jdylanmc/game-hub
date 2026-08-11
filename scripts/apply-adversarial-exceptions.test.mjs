import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateAdversarialExceptions, exceptionIntegrity } from './apply-adversarial-exceptions.ts';
import { findingFingerprint } from './publish-adversarial-evidence.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'jdylanmc/game-hub';
const headSha = 'a'.repeat(40);
const now = new Date('2026-08-11T20:00:00.000Z');

function finding() {
  return {
    id: 'TAUTOLOGY-1',
    title: 'Assertion cannot fail',
    category: 'tautology',
    severity: 'BLOCKING',
    confidence: 'HIGH',
    description: 'The assertion is independent of production behavior.',
    citations: {
      productionFiles: [],
      testFiles: [{ path: 'src/example.test.ts', startLine: 4, endLine: 4, snippet: 'expect(true).toBe(true);' }],
    },
    missingScenario: 'A production regression must make the test fail.',
    expectedFailureSignal: 'The assertion fails when production output changes.',
    suggestedTest: 'Assert production behavior.',
  };
}

function result() {
  const findings = [finding()];
  return {
    schemaVersion: '1.0.0',
    findingVersion: 'unit-test-reviewer@2026-08-11T19:30:00Z',
    attribution: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      modelDeployment: 'gpt-4.1-mini@2025-04-14/eastus/GlobalStandard',
      promptVersion: '1.0.0',
      promptContentHash: '6d36a3aa7798b5a56342befc1bfc2edc3d051b45a91183ff7f2ec4628ed26a9c',
      policyVersion: '1.0.0',
      toolsVersion: '1.0.0',
      subscriptionId: '11213dbd-39fe-46ba-87db-5f5e8c449aed',
      repositoryCommit: headSha,
      timestamp: '2026-08-11T19:30:00Z',
    },
    verdict: {
      decision: 'FAIL',
      severity: 'BLOCKING',
      blockingFindingsCount: 1,
      advisoryFindingsCount: 0,
      policyDecisionRationale: '1 validated high-confidence blocking finding(s) meet policy.',
    },
    findings,
    summary: {
      pullRequestNumber: 35,
      pullRequestCommit: headSha,
      reviewDurationMs: 100,
      tokensUsed: 100,
      estimatedCost: 0.001,
      contextCollectionStatus: 'complete',
      contextLimitations: [],
    },
  };
}

function bundle(exception) {
  return {
    $schema: './exception-schema.json',
    version: '1.0.0',
    maximumValidityHours: 168,
    maximumExceptionsPerRun: 3,
    exceptions: exception ? [exception] : [],
  };
}

function exactException(reviewResult = result()) {
  const unsigned = {
    exceptionVersion: '1.0.0',
    exceptionId: 'EXC-20260811-ABC123',
    owner: { githubLogin: 'owner-user' },
    rationale: 'A bounded follow-up is tracked while this exact finding remains visible.',
    issue: { repository, number: 30, url: 'https://github.com/jdylanmc/game-hub/issues/30' },
    createdAt: '2026-08-11T19:35:00.000Z',
    expiresAt: '2026-08-18T19:40:00.000Z',
    affected: {
      agentName: 'unit-test-reviewer',
      agentVersion: '1.0.0',
      repository,
      headSha,
      runFingerprint: exceptionIntegrity(reviewResult),
      findingFingerprint: findingFingerprint(reviewResult.findings[0]),
    },
    auditEvidence: {
      approvedBy: 'approver-user',
      approvedAt: '2026-08-11T19:40:00.000Z',
      approvalUrl: 'https://github.com/jdylanmc/game-hub/issues/30#issuecomment-123456789',
      approvalRecordSha256: 'b'.repeat(64),
    },
  };
  return { ...unsigned, integritySha256: exceptionIntegrity(unsigned) };
}

function evaluate(reviewResult, exceptionBundle) {
  return evaluateAdversarialExceptions({
    repoRoot,
    repository,
    issueNumber: 30,
    headSha,
    result: reviewResult,
    bundle: exceptionBundle,
    now: () => now,
  });
}

describe('evaluateAdversarialExceptions', () => {
  it('applies one exact, attributable, short-lived exception without rewriting the finding', () => {
    const reviewResult = result();
    const before = structuredClone(reviewResult);
    const evaluation = evaluate(reviewResult, bundle(exactException(reviewResult)));

    expect(evaluation.applications).toHaveLength(1);
    expect(evaluation.exceptedFindingFingerprints).toEqual([findingFingerprint(reviewResult.findings[0])]);
    expect(evaluation.unexceptedBlockingFindingFingerprints).toEqual([]);
    expect(reviewResult).toEqual(before);
  });

  it.each([
    ['malformed', (value) => ({ ...value, owner: { githubLogin: 'owner-user', unexpected: true } })],
    ['expired', (value) => ({ ...value, expiresAt: '2026-08-11T19:59:00.000Z' })],
    ['future-excessive', (value) => ({ ...value, expiresAt: '2026-08-19T19:40:00.000Z' })],
    ['wildcard', (value) => ({ ...value, affected: { ...value.affected, headSha: '*' } })],
    ['unrelated issue', (value) => ({ ...value, issue: { ...value.issue, number: 31 } })],
    ['cross-agent', (value) => ({ ...value, affected: { ...value.affected, agentName: 'security-reviewer' } })],
    ['cross-SHA', (value) => ({ ...value, affected: { ...value.affected, headSha: 'c'.repeat(40) } })],
    [
      'tampered audit',
      (value) => ({
        ...value,
        auditEvidence: { ...value.auditEvidence, approvalRecordSha256: 'invalid' },
      }),
    ],
    ['self-approved', (value) => ({ ...value, auditEvidence: { ...value.auditEvidence, approvedBy: 'owner-user' } })],
  ])('fails closed for a %s exception', (_label, mutate) => {
    const reviewResult = result();
    const changed = mutate(exactException(reviewResult));
    changed.integritySha256 = exceptionIntegrity(changed);
    expect(() => evaluate(reviewResult, bundle(changed))).toThrow();
  });

  it('rejects tampering after approval', () => {
    const reviewResult = result();
    const exception = exactException(reviewResult);
    exception.rationale = 'Changed after approval';
    expect(() => evaluate(reviewResult, bundle(exception))).toThrow(/integrity/i);
  });

  it('rejects duplicate or replayed exception IDs and finding targets', () => {
    const reviewResult = result();
    const exception = exactException(reviewResult);
    const duplicateBundle = bundle();
    duplicateBundle.exceptions = [exception, structuredClone(exception)];
    expect(() => evaluate(reviewResult, duplicateBundle)).toThrow(/duplicated|replayed/i);
  });

  it('rejects replaying the same finding target under a different exception ID', () => {
    const reviewResult = result();
    const first = exactException(reviewResult);
    const replay = {
      ...structuredClone(first),
      exceptionId: 'EXC-20260811-DEF456',
    };
    replay.integritySha256 = exceptionIntegrity(replay);
    const replayBundle = bundle();
    replayBundle.exceptions = [first, replay];
    expect(() => evaluate(reviewResult, replayBundle)).toThrow(/duplicated|replayed/i);
  });

  it('rejects an exception for a finding absent from the exact run', () => {
    const reviewResult = result();
    const exception = exactException(reviewResult);
    exception.affected.findingFingerprint = 'd'.repeat(64);
    exception.integritySha256 = exceptionIntegrity(exception);
    expect(() => evaluate(reviewResult, bundle(exception))).toThrow(/current.*finding/i);
  });
});
