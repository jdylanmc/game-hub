# Progress

## Codebase Patterns

- Gilfoyle is an independently versioned agent registration on issue #30's
  shared Azure adversarial-review platform.
- Every agent owns a dedicated human-tunable prompt file; prompt version and
  content hash are recorded in each result and calibrated independently.
- Deterministic security gates remain authoritative and cannot be overridden by
  model output.
- Pull-request content is untrusted evidence and is never executed by the
  privileged review workflow.
- Model-backed security review runs only after the exact head commit passes the
  complete deterministic gate set, ordered from cheapest to most expensive.

## 2026-08-11 - Planning

- Bound the run to issue #22, branch
  `ralph/issue-22-gate-all-pull-requests-with-gilfoyle-security-architect`, and
  deterministic worktree `/Users/dylan/git/game-hub-worktrees/issue-22`.
- Defined issue #30 as a hard orchestration dependency because it establishes
  the shared Azure runtime, identity, schema, check publisher, calibration, and
  horizontal agent registration.
- Selected high and critical findings plus control-bypass uncertainty as
  blocking; medium findings are advisory.
- Selected emergency-only exceptions with a maximum 24-hour lifetime.
- Explicitly delegated continuous execution once dependency issue #30 is merged
  and closed.
