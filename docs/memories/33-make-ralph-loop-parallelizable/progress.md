# Progress

## Codebase Patterns

- Ralph issue worktrees use the deterministic sibling path
  `<repository>-worktrees/issue-<number>`.
- Orchestration dependencies mean the dependency issue is closed by a pull
  request merged to the configured base branch.
- Change scopes are conservative repository-relative file or directory
  prefixes; prefix overlap is unsafe for concurrent execution.
- Status polling is observational, not itself report-worthy. Reports are
  event-driven for state transitions, with one coalesced report per observation
  and a separate rate-limited heartbeat for unchanged long-running work.
- GitHub CLI's active account is shared user configuration. Concurrent Ralph
  processes must use verified `GH_TOKEN` environments and never mutate that
  global selection.

## 2026-08-11 — Concurrent GitHub identity defect

- Issue #29 found a real race: a concurrent `gh auth switch` changed the active
  account while another Ralph runner was querying its repository.
- Added `US-005` and replaced orchestrator/runner account switching with
  process-local repository-owner token binding. The orchestrator passes an
  independent environment object to every child process.
- The repository is now public by explicit user approval so issue #29 can
  enable branch protection. Ralph's identity and publication invariants remain
  unchanged.
- Checks passed:
  - no `gh auth switch` invocation remains in Ralph automation scripts
  - `bash -n .github/skills/ralph-loop/scripts/run-ralph-loop.sh`
  - Node syntax checks for the authentication and orchestration scripts
  - `node --test .github/skills/ralph-loop/tests/ralph-parallel.test.mjs`
    (9 tests, including concurrent identity isolation during simulated global
    account switches)
  - `yarn typecheck`
  - `yarn build`
  - `yarn build-storybook`

## 2026-08-11 — Live issue status-reporting update

- Re-read the live issue and added its explicit status-reporting requirement to
  `issue.md` and the new `US-004` plan story before publication.
- Meaningful transitions are loop launch, story completion, local/remote or
  draft pull-request publication change, continuous-integration state change,
  blocker, and loop completion.
- The orchestrator polls observable state at a short configurable interval but
  emits nothing for unchanged polls until the longer heartbeat interval.
  Multiple transitions discovered in one poll are coalesced into one report.
- Added `ralph-status-reporter.mjs` and integrated status snapshots of passed
  stories, local and remote commits, draft pull-request publication, and
  continuous-integration rollups into the orchestrator.
- Checks passed:
  - Node syntax checks for all Ralph JavaScript scripts
  - `bash -n .github/skills/ralph-loop/scripts/run-ralph-loop.sh`
  - `node --test .github/skills/ralph-loop/tests/ralph-parallel.test.mjs`
    (8 tests, including meaningful-change emission and unchanged-poll
    suppression)
  - `yarn typecheck`
  - `yarn build`
  - `yarn build-storybook`

## 2026-08-11 — Implementation

- Added deterministic worktree preparation, common-git-directory ownership
  locks, priority/dependency/scope orchestration, periodic status, and focused
  simulations.
- Updated repository, architecture, skill, iteration, and memory documentation.
- PR #32 is concurrently changing `AGENTS.md` and `.gitignore` and may later add
  root lint/test commands or alter selection guidance. This branch intentionally
  remains based on `origin/main`; integration should preserve PR #32's new gates
  while retaining issue #33's worktree and orchestration rules.
- Checks passed:
  - `bash -n .github/skills/ralph-loop/scripts/run-ralph-loop.sh`
  - Node syntax checks for all new Ralph scripts
  - `node --test .github/skills/ralph-loop/tests/ralph-parallel.test.mjs`
    (6 tests)
  - Ralph runner `--dry-run` preflight, including deterministic worktree
    identity, plan validation, lock cleanup, and GitHub account restoration
  - `yarn typecheck`
  - `yarn build`
  - `yarn build-storybook`
- `yarn install --immutable` was required once because this isolated worktree
  did not yet have Yarn's local node-modules state; it completed without
  changing dependency manifests or the lockfile.
