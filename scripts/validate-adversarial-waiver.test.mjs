import { describe, expect, it } from 'vitest';
import { validateAdversarialWaiver } from './validate-adversarial-waiver.ts';

const now = new Date('2026-08-12T19:30:00.000Z');
const headSha = 'a'.repeat(40);

function waiver(overrides = {}) {
  return {
    version: '1.0.0',
    repository: 'jdylanmc/game-hub',
    pullRequestNumber: 56,
    headSha,
    reviewer: 'unit-test-reviewer',
    outageEvidence: 'https://status.example.test/incidents/123',
    rationale: 'Azure OpenAI is unavailable and deterministic checks are complete.',
    authorizer: 'owner-user',
    createdAt: '2026-08-12T19:00:00.000Z',
    expiresAt: '2026-08-12T20:00:00.000Z',
    ...overrides,
  };
}

function comment(overrides = {}) {
  const body = `<!-- adversarial-waiver:${Buffer.from(JSON.stringify(waiver())).toString('base64url')} -->`;
  return {
    id: 1,
    author: 'owner-user',
    body,
    createdAt: '2026-08-12T19:00:00.000Z',
    updatedAt: '2026-08-12T19:00:00.000Z',
    ...overrides,
  };
}

const inconclusive = {
  verdict: { decision: 'INCONCLUSIVE', kind: 'COMPUTE' },
};

describe('validateAdversarialWaiver', () => {
  it('accepts one authorized, exact-head, unedited compute-outage waiver lasting at most 24 hours', () => {
    expect(
      validateAdversarialWaiver({
        repository: 'jdylanmc/game-hub',
        pullRequestNumber: 56,
        headSha,
        reviewer: 'unit-test-reviewer',
        reviewerResult: inconclusive,
        comments: [comment()],
        authorizedOwners: ['owner-user'],
        now,
        purpose: 'merge',
      }),
    ).toMatchObject({ valid: true, waiver: expect.objectContaining({ reviewer: 'unit-test-reviewer' }) });
  });

  it.each([
    ['unauthorized author', { comments: [comment({ author: 'attacker' })] }],
    ['edited comment', { comments: [comment({ updatedAt: '2026-08-12T19:01:00.000Z' })] }],
    ['changed head', { headSha: 'b'.repeat(40) }],
    ['wrong reviewer', { reviewer: 'gilfoyle-security-architect' }],
    [
      'missing outage evidence',
      {
        comments: [
          comment({
            body: `<!-- adversarial-waiver:${Buffer.from(JSON.stringify(waiver({ outageEvidence: '' }))).toString('base64url')} -->`,
          }),
        ],
      },
    ],
    [
      'expiry beyond 24 hours',
      {
        comments: [
          comment({
            body: `<!-- adversarial-waiver:${Buffer.from(JSON.stringify(waiver({ expiresAt: '2026-08-13T20:00:01.000Z' }))).toString('base64url')} -->`,
          }),
        ],
      },
    ],
    ['expired', { now: new Date('2026-08-12T21:00:00.000Z') }],
    ['FAIL result', { reviewerResult: { verdict: { decision: 'FAIL', kind: 'POLICY' } } }],
    ['promotion use', { purpose: 'promotion' }],
  ])('rejects %s', (_label, override) => {
    expect(
      validateAdversarialWaiver({
        repository: 'jdylanmc/game-hub',
        pullRequestNumber: 56,
        headSha,
        reviewer: 'unit-test-reviewer',
        reviewerResult: inconclusive,
        comments: [comment()],
        authorizedOwners: ['owner-user'],
        now,
        purpose: 'merge',
        ...override,
      }),
    ).toMatchObject({ valid: false });
  });
});
