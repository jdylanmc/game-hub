# Issue #56: Build the shared adversarial reviewer orchestration platform

URL: https://github.com/jdylanmc/game-hub/issues/56

Labels:

- `type:non-functional`
- `area:website`
- `priority:P0`

## Goal

Build the shared protected-base adversarial reviewer platform required before
Gilfoyle and the remaining role-specific reviewers can be safely promoted.

This issue implements the approved contracts from #47 and #53. It does not
implement or calibrate the final role-specific policies for Gilfoyle, SOLID
Snake, Teddy, Gordon Ramsay, or Mad Max.

## Acceptance criteria

- Repository tests prove PASS, confirmed FAIL, platform FAIL, and compute-only
  INCONCLUSIVE map to the approved independent check conclusions.
- Repository tests prove critic REJECT downgrades a blocker and critic
  INCONCLUSIVE preserves blocking only at the configured calibrated-confidence
  threshold.
- Repository tests prove malformed output, stale heads, attribution mismatch,
  schema/policy failure, missing or duplicate results, and fan-in provenance
  defects fail closed.
- Repository tests prove persona failure cannot change the authoritative
  verdict and uses the neutral validated fallback.
- Repository tests prove only proposed blockers consume critic execution.
- Repository tests prove fork-originated pull requests receive no privileged
  credential and untrusted pull-request content is never executed.
- Repository tests prove waivers reject unauthorized authors, changed heads,
  wrong reviewers, missing outage evidence, expiry over 24 hours, expired
  comments, edited mismatches, FAIL, and promotion use.
- Repository tests prove branch-protection promotion is exact-head,
  compare-and-swap, additive-only, and drift detecting.
- `Adversarial Review / unit-test-reviewer` continues to publish from the
  protected-base workflow while the shared platform is introduced.
- The new fan-in check publishes successfully on the exact head of this pull
  request or a documented bootstrap follow-up, but is not added to branch
  protection by this Ralph issue.
- `yarn format:check`, `yarn lint`, `yarn policy:check`, `yarn typecheck`, and
  the targeted adversarial workflow tests pass.

## Dependencies

None. This issue is the immediate prerequisite for #22.

## Conservative change scope

- `.github/workflows/adversarial-review.yml`
- `config/adversarial-agents/`
- `config/ralph-required-checks.json`
- `scripts/*adversarial*`
- `scripts/*branch-protection*`
- `scripts/*required-pull-request*`
- adversarial platform tests
- `docs/adversarial-*`
- `docs/branch-protection.md`
- `docs/architecture.md`
- `AGENTS.md`
- `package.json`
