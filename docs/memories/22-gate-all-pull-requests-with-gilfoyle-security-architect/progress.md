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

## 2026-08-11 - US-001 Define the Gilfoyle security contract

- Safely merged dependency issue #30 from `origin/main` at
  `ea55b3f0e1bfd9cf36d40074f66bcf11ef8b7514` without rebasing or rewriting the
  issue branch.
- Added Gilfoyle's dedicated versioned prompt, security taxonomy, threat model,
  strict finding schema, blocking policy, bounded-tools contract, independent
  engine identity, and disabled shared-platform registration.
- Required exact citations, confidence, exploit or failure scenario, impact,
  remediation, and verification guidance for every finding.
- Enforced blocking for critical/high findings and confirmed/uncertain
  security-control bypasses while keeping medium findings advisory.
- Extended shared agent registration to content-hash each agent's independent
  tools contract and added a fail-closed Gilfoyle contract policy check.
- Files changed: `.github/adversarial-agents/gilfoyle-security-architect/`,
  `config/adversarial-agents/`, `scripts/validate-*`, `package.json`,
  `docs/gilfoyle-security-contract.md`, `docs/adversarial-workflow.md`,
  `AGENTS.md`, and this issue memory.
- Checks passed: focused registry and Gilfoyle contract tests (9 tests),
  `yarn agents:validate`, `yarn policy:gilfoyle`, and complete `yarn validate`
  including formatting, lint, policy, fail-closed simulations, security audit,
  177 tests, coverage, generation, type checking, production build, bundle
  budgets, and Storybook.
- Gilfoyle remains disabled and uncalibrated by design; US-002 through US-007
  own context collection, evidence integration, implementation/calibration,
  workflow registration, exceptions/outages, and live enforcement.
