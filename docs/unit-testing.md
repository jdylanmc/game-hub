# Unit-Test Contract

Game Hub uses Vitest `4.1.10`, V8 coverage, JSDOM, and Testing Library for
deterministic repository-wide unit and component tests. The root commands are
the only supported entry points: they discover the host, game workspaces,
shared-package workspaces, and repository scripts from the root Yarn workspace
declarations without requiring globally installed tools.

## Commands

| Command | Contract |
| --- | --- |
| `yarn test:watch` | Interactive local Vitest watch mode. It is a development aid, not merge evidence. |
| `yarn test` | Deterministic non-watch alias for `yarn test:ci`. |
| `yarn test:ci` | Canonical unit-test gate: test integrity, Ralph simulations, Vitest, V8 coverage, console diagnostics, and JUnit XML. |
| `yarn test:coverage` | Compatibility alias for `yarn test:ci`; it does not define a different suite. |
| `yarn test:integrity` | Rejects missing test roots and focused, skipped, todo, or quarantined tests. |
| `yarn test:ralph` | Runs the Ralph orchestration and recovery simulations included by the canonical gate. |
| `yarn test:ci-fail-closed` | Proves the repository gates, including nine test-specific failure modes, fail for the intended reason. |
| `yarn validate` | Reproduces the complete local continuous-integration contract, including tests, builds, policy, security audit, and fail-closed proofs. |

Run a focused Vitest file while developing, but finish with the root command
that owns the changed behavior. A passing focused run never replaces
`yarn test:ci` or `yarn validate`.

## Verification-layer boundaries

| Layer | Responsibility | Current Game Hub contract |
| --- | --- | --- |
| Unit | Pure state transitions, validation, formatting, loaders, contract helpers, and generators with explicit inputs and outputs. | Runs in Vitest. Pure suites use the Node environment and must not construct a browser, canvas, animation loop, or WebGL renderer. |
| Component | React rendering and user-visible behavior at one component or bounded composition. | Runs in Vitest with JSDOM and Testing Library. Assert roles, names, descriptions, visible state, callbacks, and transitions rather than implementation details or broad snapshots. JSDOM is not a real browser. |
| Browser | Routing, layout, browser APIs, canvas/WebGL, and behavior that depends on a real browser engine. | Not part of the unit-test gate. `yarn build-storybook` proves the static component catalog builds, but it is not browser-interaction coverage. Add a separate real-browser command and gate before claiming this layer. |
| Integration | Multiple deployable processes, real protocols, or service adapters working together. | In-process host/game/contract compositions may remain unit or component tests when every external boundary is injected. Live Azure, GitHub, advertising, identity, payment, and artificial-intelligence services are excluded and require a separate environment-backed gate. |
| Visual regression | Reviewed pixel or perceptual differences under pinned browser, viewport, fonts, assets, and baselines. | Not currently implemented. Storybook stories are inputs to a future visual gate; a successful Storybook build or snapshot alone is not visual-regression evidence. |
| Performance | Stable latency, frame-time, memory, or throughput measurements under controlled hardware and workloads. | Timing assertions do not belong in deterministic unit tests. `yarn bundle:check` enforces static bundle-size budgets; runtime performance requires a separately calibrated benchmark gate. |

The repository currently keeps the canonical unit suite unsharded in one
continuous-integration job. This preserves one discovery, integrity, coverage,
and JUnit result while the suite remains within the 30-minute job timeout.
Fresh runners perform `yarn install --immutable`; there is no dependency-cache
fallback whose contents can replace the lockfile contract. Sharding or caching
requires a reviewed change that preserves complete coverage aggregation,
machine-readable results, fail-closed behavior, and workspace discovery.

## Deterministic test-writing conventions

1. Put pure game state progression in `games/*/src/simulation.ts`. Pass the
   prior state, input, elapsed time, and random source explicitly.
2. Mark suites that need no document with `// @vitest-environment node`.
   Rendering adapters may use JSDOM only when the browser boundary itself is
   under test.
3. Use behavior-focused assertions. Do not use broad snapshots as the only
   evidence for critical state, accessibility, lifecycle, scoring, validation,
   or error behavior.
4. Await asynchronous work and assert the final visible or returned state.
   Do not add sleeps, depend on workstation speed, or leave promises, timers,
   animation frames, listeners, or renders active after a test.
5. Tests may not mutate committed generated outputs. Generator suites use
   repository-local fixtures and an explicit fixture import-map path.
6. Tests must be order-independent even though Vitest deliberately shuffles
   them with seed `29005`.
7. Do not commit `.only`, `.skip`, `.todo`, quarantine markers, empty required
   roots, or a test that passes only when another test runs first.

### Deterministic helpers

`@game-hub/game-contract` provides the production-safe simulation seams:

- `createManualSimulationClock` controls monotonic time without replacing the
  ambient clock.
- `sampleClock` converts explicit samples to elapsed seconds and can clamp a
  long frame.
- `createSeededRandomSource` produces replayable unit-interval values.
- `stepSimulation` advances state from explicit input, elapsed time, and a
  supplied random source.
- `createSubmitScoreOnce` makes one terminal score submission through the
  public host contract.

`src/test/boundaries.ts` provides narrow browser doubles:

- `installAnimationFrameController`
- `installFetchMock`
- `installObjectUrlController`
- `installPerformanceTime`
- `installScrollToMock`
- `installStorageController`
- `installTimerController`

`src/test/three-boundary.ts` supplies an observable Three.js
`WebGLRenderer` constructor double. Shared game metadata belongs in
`src/test/game-fixture.ts`. Prefer these helpers over hand-written global
replacement in each suite.

Do not call `Date.now`, `performance.now`, `Math.random`, real timers, or real
animation frames from pure simulation tests. Do not construct a real Three.js
renderer merely to exercise state progression.

## Mocks, network isolation, and cleanup

Mocks must be installed at the narrow boundary that owns the effect:

- inject clocks, random sources, transports, credentials, and host callbacks;
- install a local fetch double only in the test that expects a request;
- use memory-backed storage rather than a developer profile;
- control animation frames and performance time explicitly; and
- replace only `WebGLRenderer` when scene construction is not the behavior
  under test.

`src/test/setup.ts` installs a deny-by-default fetch guard. An ambient request,
including a request to Azure, GitHub, advertising, identity, payment, or an
artificial-intelligence service, rejects before live network access.

After every Vitest test, shared setup:

1. cleans Testing Library renders;
2. clears pending fake timers and restores real timers;
3. resets the module cache, mocks, spies, environment stubs, and global stubs;
4. removes unexpected global properties and fails the test that leaked them;
5. reinstalls the network guard;
6. clears local and session storage; and
7. restores document children, title, and root/body attributes.

Tests still own cleanup for resources outside those shared boundaries, such as
application listeners, retained callbacks, controllers, renderer disposal, and
injected transport state. Assert disposal behavior instead of relying only on
global teardown.

## Timeouts, retries, and flaky tests

Vitest enforces:

- `testTimeout: 10_000`
- `hookTimeout: 10_000`
- `teardownTimeout: 10_000`
- `retry: 0`
- `allowOnly: false`
- `passWithNoTests: false`

The policy is strict: deterministic failures are never retried automatically,
wrapped in retry loops, quarantined, skipped, or converted to warnings. Do not
add per-test retries, workflow retries, `continue-on-error`, or "rerun until
green" automation. A timeout is a test failure, not a reason to increase the
limit until the test passes.

A rerun of an unchanged failure may be used once for diagnosis, but it cannot
erase the first result. If the unchanged test or exact head changes outcome,
classify it as flaky and keep the pull request blocked. Preserve the first log,
JUnit result, coverage output, file, test name, and shuffle seed.

Repair a flaky test by locating and removing the uncontrolled input:

1. reproduce with the smallest affected suite and the recorded seed;
2. replace ambient time, randomness, network, storage, rendering, and frame
   scheduling with the shared deterministic boundaries;
3. remove cross-test state and make setup/teardown awaitable and observable;
4. replace timing sleeps with an awaited state or controlled clock;
5. add an assertion that fails for the original race or leak; and
6. rerun the focused suite, `yarn test:ci`, and the required repository
   validation on the repaired commit.

Do not "repair" a flake by weakening an assertion, broadening a mock, raising a
timeout without a reviewed behavior requirement, lowering coverage, or adding
a skip/quarantine marker.

## Coverage and ratcheting

V8 coverage includes authored host, game, pure-simulation, shared-contract, and
workspace-generator source. The current enforced baselines are:

| Surface | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All measured files | 94.84% | 85.06% | 94.36% | 95.27% |
| Host | 95.88% | 86.29% | 100.00% | 95.65% |
| All game source | 96.47% | 87.86% | 90.52% | 97.39% |
| Pure game simulations | 97.05% | 92.00% | 93.54% | 98.92% |
| Shared contract | 97.43% | 94.73% | 100.00% | 97.43% |
| Workspace generator | 82.40% | 70.27% | 87.50% | 82.07% |

The canonical run emits text, `coverage/coverage-summary.json`, and LCOV
reports, including on failure. Review per-file entries so a strong aggregate
cannot hide an untested file. Thresholds ratchet upward manually with reviewed
tests; they must not be lowered, and source must not be excluded, merely to
restore a passing result. The complete scope, exclusions, and procedure are in
[Unit-Test Coverage Baseline](unit-test-coverage.md).

## Continuous-integration evidence and retention

Every pull request and protected `main` update runs `yarn test:ci` in the
`Continuous integration` job. Bash `pipefail` preserves the test exit status
while writing `continuous-integration-evidence/test.log`.

After every executed test step, including a failure, the workflow uploads
`unit-test-evidence-<run-id>-<attempt>` for 14 days. Publication requires:

- the diagnostic test log;
- `test-results/junit.xml`; and
- the complete `coverage/` directory.

The broader `continuous-integration-evidence-<run-id>-<attempt>` artifact also
retains those test results with all gate logs, production output, and the
Storybook build for 14 days. Missing required files fail artifact publication.

`scripts/prove-ci-fail-closed.mjs` uses an isolated repository-local worktree to
prove the canonical command exits nonzero for an assertion failure, missing
suite, focused test, skipped test, todo test, quarantine marker, leaked global,
10-second timeout, and coverage regression. The assertion proof also verifies
that failure still produces the diagnostic log, failing JUnit XML, JSON
coverage summary, and LCOV evidence.

## Adding a workspace or test

1. Keep the workspace under a root `workspaces` pattern and add its required
   `AGENTS.md`.
2. Add deterministic tests beside the authored source. Workspace-pattern
   discovery makes matching tests participate automatically.
3. Use Node for pure logic or JSDOM plus Testing Library for component behavior.
4. Use shared deterministic helpers and explicit boundary doubles.
5. Run `yarn test:ci`, inspect per-file coverage, and ratchet thresholds upward
   when reviewed coverage improves.
6. Run the smallest additional build or policy gates that own the changed
   boundary, then run `yarn validate` when reproducing the full contract.

## Issue #28 acceptance evidence

| Acceptance criterion | Passing evidence |
| --- | --- |
| `yarn test` passes locally and in continuous integration. | `package.json` binds `test` to `test:ci`; `.github/workflows/continuous-integration.yml` runs the exact `yarn test:ci` command on pull requests and `main`; `yarn validate` includes the same gate. |
| A representative failing assertion causes a nonzero result and blocks merging. | `scripts/prove-ci-fail-closed.mjs` injects a false assertion, requires the canonical command to fail, and verifies retained diagnostics, failing JUnit, and coverage. `scripts/check-workflow-policy.mjs` protects the proof and workflow; required branch checks block merge. |
| All current workspaces participate automatically. | `scripts/test-discovery.mjs` derives Vitest include patterns and integrity roots from root Yarn workspaces, then adds host and repository scripts. Current game and shared-package suites are discovered without a handwritten workspace test list. |
| Critical game logic runs deterministically without opening a browser or WebGL context. | `games/*/src/simulation.ts`, Node-environment simulation suites, seeded random sources, manual clocks, and explicit stepping cover FloppyBird physics, obstacles, collisions, scoring, difficulty, lifecycle inputs, Neon Drift, and Orbital Stack independently of rendering. |
| Coverage reporting identifies untested files and supports enforceable thresholds. | `vitest.config.ts` uses explicit source includes, per-surface thresholds, report-on-failure, text, JSON summary, and LCOV output. `docs/unit-test-coverage.md` defines exclusions and the upward ratchet. |
| Initial tests cover the shared game contract, generated game catalog, and FloppyBird core simulation. | `packages/game-contract/src/*.test.ts`, `scripts/generate-game-workspaces.test.mjs`, `src/game-catalog.test.ts`, `src/game-module-loader.test.ts`, and `games/floppy-bird/src/*.test.ts` cover the required contract, generation/loading, and game behavior. |
| Flaky-test detection, retry policy, timeouts, and test-writing conventions are documented. | This contract records the fixed shuffle seed, 10-second bounds, zero-retry rule, fail-closed flake classification and repair process, deterministic helpers, layer boundaries, mocking, cleanup, coverage, and evidence retention. |
