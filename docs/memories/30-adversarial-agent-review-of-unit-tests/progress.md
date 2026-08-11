# Progress

## Codebase Patterns

- Adversarial agents are independent required checks with versioned prompts,
  policies, models, schemas, tools, calibration, and findings.
- Pull-request content is untrusted evidence. Privileged workflow code must come
  from the protected base branch and must never execute pull-request code.
- Azure resources are idempotent Bicep deployments with environment parameter
  files, OpenID Connect authentication, least privilege, and no committed
  credentials.
- Structured results must be actionable: exact citations, missing scenario,
  expected failure signal, and a concrete suggested test.

## 2026-08-11 - Planning

- Bound the run to issue #30, branch
  `ralph/issue-30-adversarial-agent-review-of-unit-tests`, and deterministic
  worktree `/Users/dylan/git/game-hub-worktrees/issue-30`.
- Confirmed issue dependencies #29 and #33 are merged to `main`.
- Selected Azure-hosted GPT-4.1 mini in subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Selected consumption capacity, a maximum of three concurrent reviews, and a
  target below $100 per month.
- Selected required GitHub check annotations plus a retained structured JSON
  artifact.
- Explicitly delegated continuous continuation until the draft pull request is
  complete or a safety blocker stops the loop.
