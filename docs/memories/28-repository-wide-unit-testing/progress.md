# Progress

## Codebase Patterns

- Root `package.json` commands are the canonical local and continuous
  integration entry points.
- Vitest currently discovers tests under `src/`, `games/`, `packages/`, and
  `scripts/`; `scripts/check-test-integrity.mjs` separately requires at least
  one test file under the first three roots.
- Browser-oriented tests use JSDOM and Testing Library setup from
  `src/test/setup.ts`.
- Game rendering, input, timing, and simulation currently coexist in each
  workspace's `src/index.ts`; pure simulation boundaries are not yet present.
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
