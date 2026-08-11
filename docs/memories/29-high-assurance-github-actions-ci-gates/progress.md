# Progress

## Codebase Patterns

- Root validation commands are the canonical local and continuous integration
  entry points.
- Production bundle budgets use raw manifest-referenced bytes so local and
  continuous integration comparisons remain deterministic.
- Exceptional ESLint suppressions require an exact file, line, directive, and
  rationale in `config/lint-suppressions.json`.
- Prettier and ESLint cover repository-authored code while excluding imported
  Mamba source snapshots and generated outputs.
- Azure resources are optional for this issue and must not be created without a
  concrete implementation need.
- If Azure infrastructure becomes necessary, select subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed` explicitly and use the authenticated
  `j.dylan.mccurry@gmail.com` identity.

## 2026-08-11 - Planning

- Bound the run to issue #29 and branch
  `ralph/issue-29-high-assurance-github-actions-ci-gates`.
- Confirmed the repository currently has no GitHub Actions workflows, test
  files, lint command, test command, or `infra/` directory.
- Confirmed the target Azure subscription is enabled for
  `j.dylan.mccurry@gmail.com`.
- Initially approved a bounded run, then explicitly delegated continuous
  continuation until issue #29 is resolved.

## 2026-08-11 - US-001 blocked

- Attempted to install the pinned formatting, linting, test, coverage, and
  component-test toolchain required by US-001.
- `yarn add --dev --exact ...` failed twice during dependency resolution because
  every registry request returned `RequestError: read ENOTCONN`.
- Files changed: `docs/memories/29-high-assurance-github-actions-ci-gates/progress.md`.
- Checks could not run because the quality dependencies could not be resolved or
  installed. Yarn did not change `package.json` or `yarn.lock`.
- US-001 remains unpassed. Retry the dependency installation in the next
  iteration after registry connectivity is restored.

## 2026-08-11 - US-001 blocked retry

- Retried the exact development dependency installation for Prettier, ESLint,
  TypeScript ESLint, React lint plugins, Vitest, V8 coverage, Testing Library,
  and JSDOM.
- Every registry resolution again failed with `RequestError: read ENOTCONN`;
  Yarn made no changes to `package.json` or `yarn.lock`.
- Files changed:
  `docs/memories/29-high-assurance-github-actions-ci-gates/progress.md`.
- Required quality checks remain unavailable because the toolchain cannot be
  installed. US-001 remains unpassed and the next iteration must retry after
  registry connectivity is restored.

## 2026-08-11 - US-001 complete

- Installed exact versions of Prettier, ESLint, TypeScript ESLint, React lint
  plugins, Vitest, V8 coverage, JSDOM, and Testing Library, then added canonical
  immutable install, format, lint, test, coverage, and aggregate validation
  commands.
- Added fail-closed ESLint configuration for repository-authored JavaScript,
  TypeScript, React, games, packages, Storybook, and scripts; added Prettier
  configuration and normalized the covered source tree.
- Added Vitest and coverage configuration that discovers host, game, package,
  and script tests. Empty suites remain temporarily allowed so this toolchain
  story can pass; US-002 must add representative tests and then set
  `passWithNoTests` to `false`.
- Removed an unused generator parameter surfaced by the new lint gate.
- Files changed: root quality configuration and dependency files, repository
  authored source files formatted by Prettier, and this issue memory.
- Checks passed: `yarn install:check`, `yarn format:check`, `yarn lint`,
  `yarn test`, `yarn test:coverage`, `yarn typecheck`, `yarn build`, and
  `yarn build-storybook`.
- No blockers. US-002 is the next eligible story.

## 2026-08-11 - US-002 complete

- Added deterministic tests for host catalog validation and state, the
  GameStageStatus component, the typed game-contract lifecycle, and FloppyBird
  host-integration metadata.
- Added a fail-closed test-integrity command requiring tests under `src/`,
  `games/`, and `packages/` while rejecting focused, skipped, todo, and
  quarantined tests. Vitest now rejects empty suites and focused tests.
- Enforced initial host coverage thresholds of 85% for lines, functions, and
  statements and 75% for branches. The completed suite reports 96.61% lines,
  100% functions, 96.72% statements, and 92.59% branches.
- Files changed: root test configuration and guidance, the integrity script,
  host/component/contract/game test files, test setup, and this issue memory.
- Checks passed: `yarn validate`, including immutable install, format, lint,
  coverage, typecheck, production build, and Storybook build.
- Reusable discovery: every repository test suite must retain representative
  tests in the host, game, and shared-package boundaries so suite loss fails
  before Vitest runs.
- No blockers. US-003 is the next eligible story.

## 2026-08-11 - US-003 complete

- Added a deterministic game workspace generation check that snapshots Git
  state, runs the canonical generator, and fails if generation changes tracked
  or untracked state or leaves either committed catalog output dirty.
- Added `yarn generate:check` to the aggregate `yarn validate` contract and
  documented the reusable command in the root agent guidance.
- Files changed: `package.json`, `scripts/check-generated-state.mjs`,
  `AGENTS.md`, and this issue memory.
- Checks passed: targeted Prettier and ESLint checks, clean
  `yarn generate:check`, a deliberate stale-output failure, and `yarn validate`.
- Reusable discovery: compare Git status before and after generation so
  unchanged unrelated local edits are permitted while any generator-created
  dirty state fails closed.
- No blockers. US-004 is the next eligible story.

## 2026-08-11 - US-004 complete

- Added a fork-safe GitHub Actions workflow for pull requests and main updates
  that runs immutable installation, formatting, lint, dependency audit,
  coverage-enforced tests, generated-state verification, type checking,
  production build, and Storybook build through the canonical root commands.
- Pinned Node.js, Yarn, and every action reference; limited workflow permissions
  to read-only repository contents; added concurrency cancellation and a
  30-minute job timeout.
- Added JUnit test output and 14-day artifact retention for continuous
  integration logs, test results, coverage, production output, Storybook, and
  security audit evidence.
- Files changed: `.github/workflows/continuous-integration.yml`, `.gitignore`,
  `package.json`, `AGENTS.md`, and this issue memory.
- Checks passed: `yarn validate`, including the new high-severity recursive
  dependency audit and JUnit test reporting.
- Reusable discovery: keep continuous integration steps on the same root Yarn
  commands used locally, and make evidence upload run unconditionally so failed
  gates preserve prior logs.
- No blockers. US-005 is the next eligible story.

## 2026-08-11 - US-005 complete

- Added production entry, async chunk, JavaScript, stylesheet, and total
  raw-byte budgets backed by the Vite manifest, with a required post-build
  `yarn bundle:check` gate.
- Added explicit lint-suppression approvals and continuous integration workflow
  policy checks for required triggers, permissions, concurrency, timeout,
  commands, evidence, retention, immutable actions, and forbidden weakening.
- Made test ordering reproducibly shuffled with seed `29005` and added the
  policy and bundle commands to identical local and continuous integration
  validation sequences.
- Files changed: root quality scripts and configuration, Vite and package
  configuration, the continuous integration workflow, root guidance, and this
  issue memory.
- Checks passed: deliberate unapproved suppression, one-byte bundle budget, and
  zero-timeout workflow probes each failed as expected; `yarn validate` passed
  the complete repository contract.
- Reusable discovery: Vite's generated manifest distinguishes the startup entry
  from lazy chunks and provides a deterministic inventory for raw-byte budget
  enforcement.
- No blockers. US-006 is the next eligible story.

## 2026-08-11 - US-006 complete

- Added an isolated detached-worktree proof harness that injects controlled
  failures and rejects both unexpected success and failures without the
  expected gate-specific evidence.
- Proved formatting, lint, type, test, generation, production build, bundle
  budget, missing build output, missing mandatory workflow command, unavailable
  security audit service, and Storybook browser bundle failures block
  completion.
- Added the proof command to the identical local and continuous integration
  contracts and retained its log with the existing continuous integration
  evidence.
- Files changed: `scripts/prove-ci-fail-closed.mjs`, `package.json`,
  `.github/workflows/continuous-integration.yml`,
  `scripts/check-workflow-policy.mjs`, `AGENTS.md`, and this issue memory.
- Checks passed: targeted Prettier, ESLint, workflow policy, all 11 deliberate
  failure probes, and the complete `yarn validate` contract.
- Reusable discovery: failure proofs must assert both a nonzero command result
  and expected diagnostic evidence so an unrelated infrastructure or setup
  failure cannot masquerade as proof of a working gate.
- No blockers. US-007 is the next eligible story.

## 2026-08-11 - US-007 complete

- Added `yarn ralph:prioritize` to inspect open Ralph pull requests before new
  issue ranking and route the oldest blocking pull request to its bound issue
  memory.
- Treated failed and absent check rollups as blocking, while leaving passing and
  in-progress checks alone. The preflight rejects missing issue markers,
  non-draft pull requests, and absent or ambiguous repository, issue, branch, or
  base-branch memory identity.
- Updated the Ralph skill and root guidance so new issue selection runs the
  deterministic preflight and stops rather than guessing when ownership cannot
  be established.
- Files changed: Ralph selection and operating documentation, root agent
  guidance, root package commands, the prioritization script and tests, and this
  issue memory.
- Checks passed: targeted Prettier and ESLint, 4 prioritization tests, live
  `yarn ralph:prioritize`, and the complete `yarn validate` contract.
- Reusable discovery: pull request recovery should derive issue ownership from
  the committed Ralph marker, then validate every immutable plan identity field
  before resuming memory.
- No blockers. US-008 is the next eligible story.

## 2026-08-11 - US-008 blocked

- Verified draft pull request #32 targets `main`, retains the Ralph issue
  identity marker, and reports a successful `Continuous integration` check.
- GitHub rejected both the `main` branch-protection endpoint and repository
  rulesets endpoint with HTTP 403 because private repository protection requires
  GitHub Pro for the current account.
- Confirmed `jdylanmc/game-hub` is private. Repository visibility was not changed,
  and no partial protection configuration was applied.
- Files changed:
  `docs/memories/29-high-assurance-github-actions-ci-gates/progress.md`.
- US-008 remains unpassed. Continue only after GitHub Pro is enabled or a human
  explicitly approves making the repository public; then require the
  `Continuous integration` check and heightened review for workflow changes.

## 2026-08-11 - US-008 complete

- Confirmed the repository is now public and configured `main` branch protection
  through the GitHub API after the prior private-repository licensing blocker
  cleared.
- Required the strict GitHub Actions `Continuous integration` check from app ID
  `15368`, one approving Code Owner review, stale-review dismissal, approval by
  someone other than the last pusher, resolved conversations, linear history,
  and administrator enforcement. Force pushes and branch deletion are disabled.
- Added Code Owner rules for workflow and ownership changes, made
  `yarn policy:check` reject weakened ownership, and documented the live
  protection contract and verification command.
- Files changed: `.github/CODEOWNERS`, `docs/branch-protection.md`,
  `scripts/check-workflow-policy.mjs`, `README.md`, `AGENTS.md`, and this issue
  memory.
- Checks passed: `yarn validate` and exact live branch-protection API assertions.
  Draft pull request #32 reports successful continuous integration while
  remaining `BLOCKED` with `REVIEW_REQUIRED`.
- Reusable discovery: bind required checks to both the check context and GitHub
  Actions app ID, and pair required Code Owner reviews with a repository policy
  check so workflow ownership cannot be removed while the required check stays
  green.
- No blockers. US-009 is the next eligible story.

## 2026-08-11 - US-009 complete

- Added the continuous integration completion contract with the exact canonical
  local and workflow command order, expected outputs, enforced thresholds,
  fail-closed behavior, and clean-checkout reproduction steps.
- Documented fork-safe permissions, pinned execution, 14-day logs and artifact
  retention, branch-protection behavior, Ralph recovery, and suitability for
  agentic completion without bypassing human review.
- Reconciled every issue acceptance criterion to implementation evidence and
  recorded that no Azure infrastructure is required: zero resource groups and
  an estimated Azure cost of `$0/month`.
- Files changed: `docs/continuous-integration.md`, `README.md`, and this issue
  memory.
- Checks passed: `yarn validate`, including immutable installation, formatting,
  lint, policy, all 11 fail-closed probes, security audit, coverage, generation,
  type checking, production build, bundle budgets, and Storybook.
- Reusable discovery: keep one durable contract that maps canonical commands to
  expected outputs and links live repository settings to policy-checked source
  controls.
- No blockers. All planned stories are complete.
