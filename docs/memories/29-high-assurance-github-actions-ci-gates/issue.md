# Issue #29: High-Assurance GitHub Actions CI Gates

- Repository: `jdylanmc/game-hub`
- URL: https://github.com/jdylanmc/game-hub/issues/29
- State: Open
- Labels: `priority:P0`, `type:non-functional`, `area:website`

## Goal

Establish a high-assurance GitHub Actions continuous integration pipeline that
blocks every pull request from merging unless the repository is reproducible,
correctly generated, thoroughly checked, secure, and production-buildable.

## Required Pull-Request Gates

- Verify the lockfile with immutable Yarn installation and an approved Node.js
  and Yarn toolchain.
- Run repository-wide formatting or formatting verification.
- Run repository-wide linting with no unapproved warnings.
- Run strict TypeScript type checking across the website, shared packages, game
  workspaces, Storybook, tests, and scripts.
- Run all unit and component tests with coverage enforcement.
- Run deterministic generator checks and fail when committed generated files
  are stale or dirty.
- Build the production website and static Storybook.

## Quality Bar

- Make every required gate fail closed on errors, cancellation, timeout,
  missing output, stale generation, or unavailable mandatory services.
- Do not mask failures with broad retries, unconditional continuation,
  warning-only configuration, or success-shaped fallbacks.
- Permit retries only for explicitly identified transient infrastructure
  failures and preserve the original evidence.
- Detect focused, skipped, quarantined, or unexpectedly absent tests.
- Reject unexplained coverage regressions, bundle regressions, new lint
  suppressions, and weakened workflow permissions or checks.
- Require deterministic seeds, pinned tool versions, immutable action commit
  references, and reproducible commands.
- Keep local validation commands identical to continuous-integration commands.

## Acceptance Criteria

- Every pull request and protected-branch update receives the complete required
  gate set.
- Branch protection prevents merge when any required check is missing, pending,
  failed, canceled, or stale.
- A clean checkout can reproduce each gate using documented Yarn commands.
- Representative lint, type, test, generation, build, chunking, security, and
  browser failures are proven to block merge.
- Forked pull requests execute without privileged credentials.
- Workflow changes receive heightened review and cannot self-approve reduced
  protection.
- Generated outputs, build artifacts, coverage, test results, and security
  evidence have defined retention.
- The pipeline is suitable as the completion contract for Ralph and GitHub
  Agentic Workflows.
- Infrastructure, if needed, is created with Bicep, configured in Azure
  subscription `11213dbd-39fe-46ba-87db-5f5e8c449aed`, tied to this repository,
  and estimated below $100 per month.
- Ralph checks its open pull requests for failures before selecting a new issue
  and addresses those failures first.

## Invocation Constraints

- Use the Azure identity `j.dylan.mccurry@gmail.com` for subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- Create no more than three resource groups.
- Do not create Azure resources unless a concrete implementation requirement
  justifies them.
- Keep infrastructure logical, documented, clean, idempotent, and expressed in
  Bicep with environment-specific parameters.
