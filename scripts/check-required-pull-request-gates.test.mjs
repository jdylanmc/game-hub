import { describe, expect, it } from 'vitest';
import { validateRequiredPullRequestGates } from './check-required-pull-request-gates.mjs';

const headSha = 'a'.repeat(40);
const requiredChecks = ['Continuous integration', 'Adversarial Review / unit-test-reviewer'];

function check(name, conclusion = 'SUCCESS', status = 'COMPLETED') {
  return { __typename: 'CheckRun', name, status, conclusion };
}

function response(checks = requiredChecks.map((name) => check(name)), headRefOid = headSha) {
  return { headRefOid, statusCheckRollup: checks };
}

describe('validateRequiredPullRequestGates', () => {
  it('accepts exactly one successful result for every required check on the exact head', () => {
    expect(validateRequiredPullRequestGates(response(), headSha, requiredChecks)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each([
    ['missing', [check(requiredChecks[0])]],
    ['canceled', [check(requiredChecks[0]), check(requiredChecks[1], 'CANCELLED')]],
    ['timed out', [check(requiredChecks[0]), check(requiredChecks[1], 'TIMED_OUT')]],
    ['pending', [check(requiredChecks[0]), check(requiredChecks[1], '', 'IN_PROGRESS')]],
    ['bypassed by duplication', [check(requiredChecks[0]), check(requiredChecks[1]), check(requiredChecks[1])]],
  ])('fails closed for a %s adversarial check', (_label, checks) => {
    expect(validateRequiredPullRequestGates(response(checks), headSha, requiredChecks).valid).toBe(false);
  });

  it('fails closed for malformed check output', () => {
    expect(validateRequiredPullRequestGates({ headRefOid: headSha }, headSha, requiredChecks).valid).toBe(false);
  });

  it('fails closed for a successful result bound to a stale head', () => {
    expect(validateRequiredPullRequestGates(response(undefined, 'b'.repeat(40)), headSha, requiredChecks).valid).toBe(
      false,
    );
  });
});
