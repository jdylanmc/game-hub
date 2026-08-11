# Progress

## Codebase Patterns

- Root validation commands are the canonical local and continuous integration
  entry points.
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
