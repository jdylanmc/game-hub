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
- FloppyBird clamps elapsed gameplay frames to 50 milliseconds inside its pure
  simulation boundary, so rendering and direct test callers share bounded
  physics.
- FloppyBird obstacle recycling anchors new gates to the post-movement
  rightmost gate, preserving exact score-based spacing instead of accumulating
  stale frame travel.
- FloppyBird runtime tests inject clocks, random sources, and score timestamps
  through `FloppyBirdRuntimeOptions`; animation frames and WebGL rendering stay
  mocked at their browser boundaries.
- FloppyBird paused and game-over phases preserve every simulation field, and
  runtime start and disposal are idempotent.
- Neon Drift injects its simulation clock and random source through
  `NeonDriftRuntimeOptions`; runtime start and disposal are idempotent, and
  resume resets frame sampling so the first resumed step has zero elapsed time.
- Generated game discovery exposes import-safe validation, workspace
  discovery, and artifact rendering. Tests use read-only repository-local
  fixtures and a fixture import-map path; only the command entry point writes
  committed outputs under `public/generated/` and `src/generated/`.
- Generated import maps delegate unknown-id and rejected-import handling to the
  directly testable `src/game-module-loader.ts` boundary.
- Games with one terminal score use the shared `createSubmitScoreOnce` helper
  over `GameHost.submitScore`; repeated terminal work cannot create a private
  score channel or duplicate the public host submission.
- `ControllerInputNormalizer` is intentionally a generic type-only seam.
  Controller mapping, dead zones, and normalization semantics remain
  unspecified until product behavior is implemented.
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

## 2026-08-12 - US-003: Test FloppyBird flight physics

- Added Node-environment unit coverage for deterministic ready-state bobbing,
  explicit ready-to-running progression, exact flap velocity, gravity and
  position integration, long-frame clamping, immutable input state, and
  repeatable advancement from the same explicit inputs and seeded random
  source.
- Moved the existing 50-millisecond gameplay frame cap into the pure
  FloppyBird simulation boundary. Direct callers now receive the same bounded
  physics as the rendering adapter without browser, canvas, WebGL, Three.js
  scene construction, ambient clocks, or ambient random mutation.
- Files changed: `games/floppy-bird/src/simulation.ts`,
  `games/floppy-bird/src/simulation.test.ts`,
  `games/floppy-bird/AGENTS.md`, and this issue memory.
- Checks passed: targeted Prettier, ESLint, and four FloppyBird physics tests;
  full `yarn validate`.
- Obstacle generation, collision, scoring, difficulty, and lifecycle behavior
  remain intentionally deferred to later stories.

## 2026-08-12 - US-004: Test FloppyBird obstacles and scoring

- Added Node-environment tests for deterministic seeded obstacle recycling,
  varied valid seeds with bounded gap and style output, and recycled scoring
  reset without browser, WebGL, or Three.js construction.
- Covered exact top and bottom playfield collision boundaries, nearby safe
  flight, safe passage tangent to a gate opening, and collision immediately
  outside the opening.
- Verified that a passed gate increments the score once and retains its scored
  marker on later frames.
- Covered score-based speed, gap height, and obstacle spacing at scores 0, 12,
  24, and 240, proving the base values, midpoint progression, score-24 caps,
  and beyond-cap stability.
- Corrected obstacle recycling to measure spacing from the current
  post-movement rightmost gate rather than a stale prior-frame position.
- Files changed: `games/floppy-bird/src/simulation.ts`,
  `games/floppy-bird/src/simulation.test.ts`, and this issue memory.
- Checks passed: targeted Prettier, ESLint, and all 13 FloppyBird simulation
  tests; full `yarn validate`.
- Pause, resume, lifecycle events, disposal, and idempotent final-score
  submission remain intentionally deferred to US-005.

## 2026-08-12 - US-005: Test FloppyBird lifecycle and final score

- Added deterministic JSDOM lifecycle tests with controlled animation frames,
  a manual simulation clock, seeded randomness, a fixed score timestamp, and a
  mocked Three.js WebGL renderer.
- Covered ready and running pause freezes, suppressed pointer and keyboard
  flaps while paused or terminal, zero-delta resume, and restoration of the
  exact ready or running phase.
- Asserted ready, running, paused, resumed, and game-over host events plus the
  assertive terminal announcement.
- Proved repeated terminal frames and post-game input submit one exact final
  score with controlled duration, timestamp, and technology metadata.
- Made paused and game-over simulation fully frozen. Made runtime start and
  disposal idempotent, and blocked lifecycle methods and score submission after
  disposal.
- Proved disposal removes input listeners, cancels the pending animation frame,
  disposes the renderer once, and prevents a retained stale frame from
  rendering, emitting events, or submitting a score.
- Files changed: `games/floppy-bird/src/index.ts`,
  `games/floppy-bird/src/index.test.ts`,
  `games/floppy-bird/src/simulation.ts`,
  `games/floppy-bird/src/simulation.test.ts`,
  `games/floppy-bird/AGENTS.md`, and this issue memory.
- Checks passed before full validation: targeted Prettier and ESLint, all 20
  FloppyBird tests, and `yarn typecheck`.
- Full `yarn validate` passed on the first attempt, including immutable install,
  formatting, lint, policy, fail-closed proofs, security audit, all 223 Vitest
  tests, generation, type checking, production build, bundle budgets, and
  Storybook.
- Before exact-head publication, merged latest `origin/main` at `4b6e60b` after
  its hosting change made the draft pull request unmergeable and prevented
  checks from starting. Retained both unit-test and infrastructure guidance in
  the sole root-guide conflict.
- Full `yarn validate` passed again on the synchronized tree, including all 256
  Vitest tests and the newly merged infrastructure policy suites.
- Neon Drift and Orbital Stack remain intentionally untouched for US-006 and
  US-007.

## 2026-08-12 - US-006: Test Neon Drift lifecycle

- Safely merged latest `origin/main` at `2bb2fc0` before implementation,
  preserving the completed US-001 through US-005 work without rebasing or
  force-pushing.
- Added Node-environment tests for explicit-time boost activation and decay,
  combo and pulse floors, immutable initial state, and repeatable state
  progression without ambient clocks, randomness, rendering, or browser APIs.
- Added deterministic lifecycle tests with a manual simulation clock, seeded
  random source, controlled animation-frame queue, and mocked WebGL renderer.
- Proved start creates exactly one animation loop with a zero-delta first frame,
  including when the injected clock begins at zero.
- Proved repeated pause and resume calls emit exactly one matching phase and
  announcement per transition, paused frames and input do not advance
  simulation, and the first resumed frame has zero elapsed time.
- Made start and disposal idempotent, guarded input and lifecycle calls after
  disposal, canceled the pending animation frame, removed the pointer listener,
  disposed rendering once, and blocked retained stale callbacks.
- Files changed: `games/neon-drift/src/index.ts`,
  `games/neon-drift/src/index.test.ts`,
  `games/neon-drift/src/simulation.test.ts`, and this issue memory.
- Checks passed: targeted Prettier and ESLint, all six Neon Drift tests,
  `yarn typecheck`, and the full `yarn validate` contract.
- Orbital Stack remains intentionally untouched for US-007.

## 2026-08-12 - US-007: Test Orbital Stack lifecycle

- Added Node-environment tests for explicit-time stack progression,
  deterministic plate increments, the eighteen-plate maximum, immutable
  initial state, repeatable advancement, and the absence of random consumption.
- Added deterministic lifecycle tests with a manual simulation clock, seeded
  random source, controlled animation-frame queue, and mocked WebGL renderer.
- Proved start creates exactly one animation loop with a zero-delta first frame,
  including when the injected clock begins at zero.
- Proved repeated pause and resume calls emit exactly one matching phase and
  announcement per transition, paused frames and plate input do not advance
  simulation, and the first resumed frame has zero elapsed time.
- Made start and disposal idempotent, guarded input and lifecycle calls after
  disposal, canceled the pending animation frame, removed the pointer listener,
  disposed rendering once, and blocked retained stale callbacks.
- Files changed: `games/orbital-stack/src/index.ts`,
  `games/orbital-stack/src/index.test.ts`,
  `games/orbital-stack/src/simulation.test.ts`, and this issue memory.
- Checks passed: targeted Prettier and ESLint, all six Orbital Stack tests,
  `yarn typecheck`, and the full `yarn validate` contract.
- Generator, contract, host, and later testing stories remain intentionally
  untouched.

## 2026-08-12 - US-008: Test manifests and workspace generation

- Refactored `scripts/generate-game-workspaces.mjs` so importing it has no side
  effects and tests can call exported manifest validation, workspace discovery,
  artifact rendering, and generation functions with explicit fixture paths.
- Made workspace enumeration and title tie-breaking platform-stable, validated
  the contract's required `Three.js` technology, and added actionable errors
  naming malformed workspaces, duplicate owners, missing package entries,
  missing manifests, and missing entry modules.
- Added read-only repository-local fixtures covering valid, ignored,
  malformed, duplicate, and incomplete workspaces. Exact expected manifest and
  import-map text proves featured, order, and title sorting without writing
  fixture outputs or either committed generated artifact.
- Added `src/game-module-loader.ts`; generated import maps now delegate to this
  tested boundary so unknown ids list registered games and rejected dynamic
  import functions retain the requested id, original detail, and `Error.cause`.
- Simplified `PlayableGame` to use the generated loader's single runtime
  validation path.
- Files changed: `AGENTS.md`,
  `scripts/generate-game-workspaces.mjs`,
  `scripts/generate-game-workspaces.test.mjs`,
  `scripts/fixtures/game-workspaces/`,
  `src/components/games/PlayableGame.tsx`,
  `src/game-module-loader.ts`, `src/game-module-loader.test.ts`,
  `src/generated/game-import-map.ts`, and this issue memory.
- Checks passed: targeted Prettier and ESLint, ten focused generator and loader
  tests, `yarn typecheck`, explicit `yarn generate:check`, and the complete
  `yarn validate` contract with 311 Vitest tests.
- Shared-contract, broader host/component, cleanup, coverage, integrity,
  workflow-evidence, and documentation stories remain intentionally untouched.

## 2026-08-12 - US-009: Expand shared contract tests

- Replaced the shared contract smoke test with compile-time fixtures covering
  every lifecycle phase, each phase, heads-up display, and announcement event
  variant, complete score metadata, manifests, manifest indexes, modules, and
  hosts.
- Added a representative runtime module fixture that receives the exact public
  canvas and host, drives start, pause, resume, game-over, and disposal through
  `GameInstance`, and emits polite, assertive, and default announcements.
- Added `createSubmitScoreOnce`, which closes over the public
  `GameHost.submitScore` boundary and reports whether an attempt was accepted.
  Adopted it in FloppyBird's existing final-score path without changing the
  score payload or adding a private host channel.
- Added the generic type-only `ControllerInputNormalizer` seam and compile-time
  coverage for its raw-to-normalized shape without defining controller
  mappings, dead zones, or other unimplemented product behavior.
- Files changed: `packages/game-contract/src/index.ts`,
  `packages/game-contract/src/index.test.ts`,
  `packages/game-contract/AGENTS.md`, `games/floppy-bird/src/index.ts`, and this
  issue memory.
- Checks passed: targeted Prettier and ESLint, eight contract and FloppyBird
  runtime tests, `yarn typecheck`, explicit `yarn generate:check`, and the full
  `yarn validate` contract with 313 Vitest tests.
- Broader host/component state remains intentionally deferred to US-010.

## 2026-08-12 - US-010: Cover host and component state

- Added behavior-focused JSDOM tests for root routing, internal-link history
  transitions, landing-page catalog loading/error/ready states, direct game
  route loading/error states, missing games, game details, and visible local
  score reporting.
- Covered the playable host from lazy-module loading through ready, running,
  paused, game-over, loader failure, retry, HUD updates, announcements, score
  callbacks, pause/resume actions, restart, and controller disposal.
- Expanded game-stage coverage across loading, ready, error, paused, and
  game-over states, including accessible headings, messages, formatted scores,
  and action callbacks.
- Added reusable component coverage for game cards, manifest/control/HUD
  panels, advertisement populated/loading/unavailable semantics, avatar image
  and initials states, avatar upload validation/replacement/reset, and
  cancelable internal links.
- Added one successful dynamic-loader test alongside the existing unknown-game
  and rejected-import cases. Existing catalog tests continue to prove parsing,
  caching, hook state, request failure, and retry behavior.
- Assertions use visible behavior, accessibility roles and descriptions, user
  interactions, callbacks, and transitions. No broad snapshots, production
  test hooks, global cleanup framework, coverage ratchet, or later integrity
  work was added.
- Files changed: host and reusable-component test files under `src/`, the
  shared `src/test/game-fixture.ts`, and this issue memory.
- Checks passed: targeted Prettier and ESLint, 50 catalog/loader/host/component
  tests, `yarn typecheck`, and the full `yarn validate` contract on the first
  attempt with 43 test files and 344 Vitest tests.

## 2026-08-12 - US-011: Standardize mocks and global cleanup

- Added reusable explicit test boundaries for fetch, scrolling, object URLs,
  local and session storage, animation-frame queues, performance time, fake
  timers, and Three.js `WebGLRenderer` construction.
- Replaced duplicated animation-frame and renderer doubles across all three
  game lifecycle suites and adopted the shared fetch and browser helpers in
  catalog, routing, link, and avatar upload tests.
- Expanded shared setup to clean Testing Library renders, queued fake timers,
  module caches, mock implementations and spies, environment and global stubs,
  storage, document children, document attributes, and document title after
  every test.
- Installed a deny-by-default ambient fetch guard. Tests that need network
  behavior must install a local fetch double or inject a transport and
  credential explicitly; no broad service response mock is installed.
- Added direct proofs that cleanup restores every shared boundary and that
  attempted Azure, GitHub, advertising, identity, payment, and
  artificial-intelligence fetches fail before making a live request.
- Files changed: `src/test/`, catalog and browser component tests under `src/`,
  all three game lifecycle tests, `AGENTS.md`, and this issue memory.
- Checks passed: targeted Prettier and ESLint, 43 focused boundary and consumer
  tests, `yarn typecheck`, all 44 Vitest files with 353 tests, and the complete
  `yarn validate` contract. One earlier all-suite preflight hit the existing
  timing-sensitive Ralph descendant-process fixture; its isolated retry passed
  before full validation.
- Coverage ratcheting, broader integrity probes, workflow publication, and
  final unit-test documentation remain intentionally deferred to US-012
  through US-015.

## 2026-08-12 - US-012: Expand coverage and define ratcheting

- Expanded V8 measurement from three selected host files to explicit authored
  host, all game source, pure game simulation, shared-contract, and
  game-workspace generator surfaces. New or untested files matching those
  includes now appear at zero instead of disappearing from coverage.
- Enforced the exact reviewed global baseline: 94.84% statements, 85.06%
  branches, 94.36% functions, and 95.27% lines.
- Added independent surface thresholds so stronger host or game coverage cannot
  hide a regression in pure simulations, the shared contract, or the generator:
  host 95.88/86.29/100/95.65; all game source
  96.47/87.86/90.52/97.39; pure simulations 97.05/92/93.54/98.92; contract
  97.43/94.73/100/97.43; and generator 82.4/70.27/87.5/82.07
  (statements/branches/functions/lines).
- Kept exclusions narrow and documented: tests and test infrastructure,
  generated import-map source, Storybook catalogs, and the side-effect-only
  browser bootstrap. The generator's lower branch baseline remains measured
  and visible rather than excluded.
- Added `docs/unit-test-coverage.md` with the baseline, per-file artifact review,
  manual upward-ratchet procedure, and a rule forbidding lower thresholds,
  weakened includes, or broader exclusions merely to regain a pass.
- Enabled coverage reports on failure; existing text, JSON summary, and LCOV
  artifacts identify uncovered files and lines.
- No production code or tests changed because the US-001 through US-011 suites
  already met the truthful expanded thresholds with all 353 tests passing.
- Files changed: `vitest.config.ts`, `docs/unit-test-coverage.md`, `README.md`,
  and this issue memory.
- Checks passed: targeted Prettier and ESLint, the canonical coverage run with
  44 test files and 353 tests, and the complete `yarn validate` contract.
- Coverage-regression mutation proofs, workflow policy/evidence, and the
  broader unit-test contract remain intentionally deferred to US-013 through
  US-015.

## 2026-08-12 - US-013: Prove test failures and integrity gates

- Extended the existing repository-local detached-worktree harness from one
  representative test assertion to nine canonical `yarn test:ci` proofs.
- Proved probe-specific nonzero failures for a false assertion, a required
  package suite with no test files, focused/exclusive, skipped, todo, and
  quarantined tests, an unexpected global property, the configured 10-second
  timeout, and a measured authored-source coverage regression.
- Every proof requires its intended diagnostic and identifying file or
  threshold evidence, rejecting unrelated dependency, policy, discovery, or
  setup failures.
- Repeated canonical runs exposed a pre-existing race in the Ralph heartbeat
  fixture: `agent-execution` is written immediately before the spawned child
  process identifier. The fixture now waits for both values atomically instead
  of treating the transient phase-only lease as ready.
- Shared teardown now removes and fails on unexpected global properties after
  Vitest stubs are restored. React's test-environment marker and Three.js's
  module marker remain explicit framework-owned exceptions.
- Workflow policy now requires the complete nine-label proof matrix and its
  canonical-command wiring. The broader continuous-integration harness verifies
  22 representative failures.
- The harness copies the current uncommitted policy and test-cleanup sources
  into its isolated worktree, restores every mutation, force-removes only that
  detached proof worktree, and deletes its ignored repository-local fixture
  root in `finally`.
- Files changed: `AGENTS.md`,
  `.github/skills/ralph-loop/tests/ralph-runner.test.mjs`,
  `scripts/prove-ci-fail-closed.mjs`,
  `scripts/check-workflow-policy.mjs`,
  `scripts/check-workflow-policy.test.mjs`, `src/test/setup.ts`, and this issue
  memory.
- Checks passed: targeted formatting, lint, cleanup tests, and workflow-policy
  tests; all nine canonical failure proofs; and the complete `yarn validate`
  contract.
- Test-specific workflow evidence and the broader unit-test contract remain
  intentionally deferred to US-014 and US-015.
