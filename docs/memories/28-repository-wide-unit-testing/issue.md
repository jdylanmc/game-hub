# Issue #28: Repository-Wide Unit Testing

- Repository: `jdylanmc/game-hub`
- URL: https://github.com/jdylanmc/game-hub/issues/28
- State: Open
- Labels: `priority:P0`, `type:non-functional`, `area:website`

## Goal

Establish fast, deterministic unit tests for Game Hub application code, shared
platform contracts, game logic, generators, and reusable user-interface
components.

## Requirements

- Add a root `yarn test` command that runs unit tests across every applicable
  workspace.
- Use a TypeScript-native test runner compatible with Vite and Yarn workspaces.
- Provide watch and continuous-integration modes without requiring globally
  installed tools.
- Test pure game simulation separately from rendering, timing, browser input,
  and Three.js scene construction.
- Cover shared game lifecycle, score idempotency, pause/resume, events,
  manifests, generated import maps, and workspace discovery.
- Cover critical website state and reusable components without relying solely
  on snapshots.
- Add deterministic clocks, random seeds, and simulation helpers so game tests
  do not become flaky.
- Mock browser, network, storage, and model boundaries explicitly and restore
  global state after tests.
- Keep unit tests independent of live Azure, GitHub, advertising, identity,
  payment, and artificial-intelligence services.

## Initial Coverage Priorities

- FloppyBird physics, obstacle generation, collision, scoring, difficulty,
  pause/resume, and one-time final score submission.
- Neon Drift and Orbital Stack lifecycle and host-contract behavior.
- Game manifest validation, generated catalog/index output, dynamic-loader
  errors, and unknown games.
- Shared controller-input normalization when implemented.
- Achievement, leaderboard, review, token-ledger, and creator software
  development kit logic as those capabilities are added.
- Security-sensitive archive and manifest validation helpers when user game
  submission is implemented.

## Pull-Request Integration

- Run unit tests on every pull request and protected-branch update.
- Make the test check required before merge.
- Publish concise failure output and machine-readable results or coverage
  artifacts.
- Integrate tests into Ralph and future Agentic Workflow completion gates.
- Prevent focused, skipped, or exclusive tests from entering protected branches
  unintentionally.

## Acceptance Criteria

- `yarn test` passes locally and in continuous integration.
- A representative failing assertion causes a nonzero result and blocks
  merging.
- All current workspaces participate automatically.
- Critical game logic runs deterministically without opening a browser or WebGL
  context.
- Coverage reporting identifies untested files and supports enforceable
  thresholds.
- Initial tests cover the shared game contract, generated game catalog, and
  FloppyBird core simulation.
- Flaky-test detection, retry policy, timeouts, and test-writing conventions are
  documented.

## Open Design Decisions

- Vitest or an alternative runner and component-testing libraries.
- Initial and ratcheting coverage thresholds.
- Division among unit, component, browser, integration, visual-regression, and
  performance tests.
- Continuous-integration sharding, caching, and artifact retention.

## Existing Baseline from Pull Request #32

Merged pull request #32 selected Vitest, V8 coverage, JSDOM, and Testing Library;
added root test and coverage commands; established test-integrity checks;
created representative host, component, contract, and FloppyBird manifest
tests; ran coverage in continuous integration; retained JUnit and coverage
artifacts; and added a representative fail-closed test probe.

That baseline does not complete this issue. Missing acceptance work includes an
explicit watch command, pure deterministic game simulations, substantive
FloppyBird core coverage, Neon Drift and Orbital Stack lifecycle coverage,
generator and generated import-map testing, broader shared-contract behavior,
systematic browser/global cleanup helpers, coverage expansion and ratcheting,
documented flaky-test policy and timeouts, and test-specific continuous
integration evidence and failure proofs.
