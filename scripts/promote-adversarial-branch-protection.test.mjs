import { describe, expect, it } from 'vitest';
import { promoteAdversarialBranchProtection } from './promote-adversarial-branch-protection.ts';

const headSha = 'a'.repeat(40);
const oldProtection = {
  requiredChecks: ['Continuous integration', 'Adversarial Review / unit-test-reviewer'],
  strict: true,
};
const candidateProtection = {
  requiredChecks: [
    'Continuous integration',
    'Adversarial Review / unit-test-reviewer',
    'Adversarial Review / gilfoyle-security-architect',
  ],
  strict: true,
};

class FakeProtectionTransport {
  protection = structuredClone(oldProtection);
  authenticatedLogin = 'jdylanmc';
  updates = [];

  async getAuthenticatedLogin() {
    return this.authenticatedLogin;
  }

  async getBranchProtection() {
    return structuredClone(this.protection);
  }

  async updateBranchProtection(_repository, _branch, next) {
    this.updates.push(structuredClone(next));
    this.protection = structuredClone(next);
  }
}

function options(transport, overrides = {}) {
  return {
    repository: 'jdylanmc/game-hub',
    branch: 'main',
    reviewer: {
      name: 'gilfoyle-security-architect',
      checkName: 'Adversarial Review / gilfoyle-security-architect',
      promoted: false,
    },
    expectedOldProtection: oldProtection,
    candidateProtection,
    expectedOldPromotion: ['unit-test-reviewer'],
    candidatePromotion: ['unit-test-reviewer', 'gilfoyle-security-architect'],
    proof: {
      headSha,
      checkName: 'Adversarial Review / gilfoyle-security-architect',
      conclusion: 'success',
      runFingerprint: 'b'.repeat(64),
      artifactSha256: 'c'.repeat(64),
    },
    expectedHeadSha: headSha,
    transport,
    now: () => new Date('2026-08-12T20:00:00.000Z'),
    ...overrides,
  };
}

describe('promoteAdversarialBranchProtection', () => {
  it('uses owner-authenticated compare-and-swap to make one additive exact-head promotion', async () => {
    const transport = new FakeProtectionTransport();
    await expect(promoteAdversarialBranchProtection(options(transport))).resolves.toMatchObject({
      applied: true,
      evidence: {
        reviewer: 'gilfoyle-security-architect',
        headSha,
        newRequiredChecks: candidateProtection.requiredChecks,
      },
    });
    expect(transport.updates).toEqual([candidateProtection]);
  });

  it.each([
    ['non-owner authentication', { mutate: (transport) => (transport.authenticatedLogin = 'attacker') }],
    ['protection drift', { mutate: (transport) => (transport.protection.requiredChecks.push('Unexpected')) }],
    ['removal', { candidateProtection: { ...oldProtection, requiredChecks: ['Continuous integration'] } }],
    ['rename', { candidateProtection: { ...oldProtection, requiredChecks: ['Continuous integration', 'Renamed'] } }],
    ['duplicate check', { candidateProtection: { ...candidateProtection, requiredChecks: [...candidateProtection.requiredChecks, candidateProtection.requiredChecks.at(-1)] } }],
    ['stale proof', { proof: { ...options(new FakeProtectionTransport()).proof, headSha: 'd'.repeat(40) } }],
    ['inconclusive proof', { proof: { ...options(new FakeProtectionTransport()).proof, conclusion: 'neutral' } }],
    ['promotion manifest drift', { candidatePromotion: ['gilfoyle-security-architect'] }],
  ])('rejects %s without weakening branch protection', async (_label, override) => {
    const transport = new FakeProtectionTransport();
    override.mutate?.(transport);
    await expect(promoteAdversarialBranchProtection(options(transport, override))).rejects.toThrow();
    expect(transport.updates).toEqual([]);
  });
});
