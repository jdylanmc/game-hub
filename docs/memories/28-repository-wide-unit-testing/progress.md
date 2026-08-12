# Progress

## Codebase Patterns

- Root `package.json` commands are the canonical local and continuous
  integration entry points: `yarn test:watch` is interactive, while `yarn test`
  and `yarn test:ci` are deterministic non-watch runs.
- Vitest and test integrity derive game and shared-package roots from the root
  Yarn workspace declarations, then add host `src/` and repository `scripts/`
  suites. New workspace patterns therefore participate without maintaining a
  second test catalog.
- Vitest uses shuffle seed `29005`, zero retries, 10-second test/hook/teardown
  timeouts, `allowOnly: false`, and `passWithNoTests: false`.
- Browser-oriented tests use JSDOM and Testing Library setup from
  `src/test/setup.ts`.
- Dependency-free simulation clocks, seeded random sources, clock sampling, and
  generic state stepping are exported by `@game-hub/game-contract`.
- Each game keeps pure state progression in `src/simulation.ts`; its
  `src/index.ts` adapts browser input, animation-frame elapsed time, Three.js
  rendering, and host effects without placing those dependencies in simulation.
- Generated game discovery has committed outputs under `public/generated/` and
  `src/generated/`, while generator implementation currently executes at module
  load and is not directly unit-testable.
- Issue #28 is orchestration priority 3 and remains blocked on issues #30 and
  #27 because adversarial test review and lint completion overlap package,
  configuration, source, test, documentation, and workflow-policy surfaces.

## 2026-08-11 - Planning

- Bound the run to issue #28 and branch
  `ralph/issue-28-repository-wide-unit-testing`.
- Recorded explicit delegation to continue by best judgment.
- Inspected current `main`, the issue requirements, workspace guidance, current
  tests and tooling, and merged pull request #32.
- Pull request #32 already delivered Vitest 4.1.10, V8 coverage, JSDOM, Testing
  Library, a deterministic shuffle seed, root test and coverage commands,
  focused/skipped/todo/quarantine integrity checks, representative tests in
  host/game/package roots, JUnit and coverage artifacts, and a representative
  fail-closed assertion probe.
- The current `yarn test` aliases the coverage-oriented non-watch run; there is
  no explicit watch command.
- Existing FloppyBird coverage checks only manifest metadata. Its physics,
  obstacle generation, collision, scoring, difficulty, pause/resume, and
  one-time final-score behavior remain embedded beside Three.js and browser
  behavior and are not unit tested.
- Neon Drift and Orbital Stack have no tests. The workspace generator and
  generated import map have no direct unit tests. The shared contract test is a
  representative typed lifecycle smoke test rather than comprehensive behavior
  coverage.
- Current coverage includes only three host files, so it does not measure game
  simulations, generators, or the shared contract. Global cleanup is split
  between shared Testing Library cleanup and test-local mock restoration.
- No story is marked passed. Existing pull request #32 work is a baseline to
  retain and reconcile, not evidence that issue #28 acceptance criteria are
  complete.

## 2026-08-12 - US-001: Complete watch and continuous-integration commands

- Safely merged `origin/main` at
  `9199590dded564337554718ab095e056f7438006`, retaining the issue memory and
  reconciling the merged lint and adversarial-review baselines.
- Added `yarn test:watch` for interactive development and made `yarn test` plus
  `yarn test:ci` the deterministic non-watch contract. Kept
  `yarn test:coverage` as a compatibility alias.
- Added shared discovery from `package.json` so Vitest and test integrity cover
  host, every game/package workspace pattern, and repository scripts in stable
  order.
- Moved the shuffle seed into Vitest configuration, disabled retries, and
  bounded test, hook, and teardown timeouts at 10 seconds. Empty and focused
  probe runs exited nonzero for the intended reasons.
- Updated the workflow, fail-closed assertion probe, policy enforcement,
  continuous integration documentation, and root agent guidance to use and
  protect the canonical command.
- Files changed: `.github/workflows/continuous-integration.yml`, `AGENTS.md`,
  `docs/continuous-integration.md`, `package.json`,
  `scripts/check-test-integrity.mjs`, `scripts/check-workflow-policy.mjs`,
  `scripts/check-workflow-policy.test.mjs`,
  `scripts/prove-ci-fail-closed.mjs`, `scripts/test-discovery.mjs`,
  `scripts/test-discovery.d.mts`, `scripts/test-discovery.test.mjs`,
  `tsconfig.node.json`,
  `vitest.config.ts`, and this issue memory.
- Checks passed: targeted discovery/policy tests (22), `yarn policy:workflow`,
  `yarn typecheck`, canonical `yarn test:ci` (26 Ralph tests and 200 Vitest
  tests), interactive watch startup and rerun readiness, explicit
  no-test/focused-test failure probes, and the full `yarn validate` contract.
- Reusable discovery and command conventions were added to root `AGENTS.md`.
  Later stories remain intentionally untouched.

## 2026-08-12 - US-002: Extract deterministic simulation primitives

- Added an explicit `SimulationClock`, controllable manual clock, bounded clock
  sampling, seeded `RandomSource`, and generic `stepSimulation` reducer helper
  to the shared contract workspace. The helpers reject invalid time and seed
  inputs and never read or replace ambient globals.
- Added pure `src/simulation.ts` boundaries for FloppyBird, Neon Drift, and
  Orbital Stack. Each boundary advances immutable state from explicit input,
  elapsed seconds, and a supplied random source without importing Three.js or
  browser APIs.
- Updated each `src/index.ts` adapter to render returned state and preserve
  browser input, host events, pause behavior, and scene disposal. FloppyBird
  obstacle recycling now consumes a seeded source instead of `Math.random`.
- Added Node-environment unit tests for deterministic clock advancement,
  elapsed-time clamping, repeatable random sequences, explicit reducer inputs,
  unchanged prior state, and invalid-input rejection.
- Updated architecture and workspace guidance with the pure-simulation
  boundary. Later game-specific physics, obstacle, scoring, and lifecycle test
  stories remain intentionally unimplemented.
- Checks passed: targeted simulation lint, `yarn typecheck`, primitive tests
  (4), canonical `yarn test:ci` (26 Ralph tests and 204 Vitest tests), and the
  complete `yarn validate` contract. The first validation attempt correctly
  rejected a fingerprinted architecture edit as stale calibration; restoring
  the unchanged architecture contract allowed the second and final attempt to
  pass.
