# Progress

## Codebase Patterns

- Ralph issue worktrees use the deterministic sibling path
  `<repository>-worktrees/issue-<number>`.
- Orchestration dependencies mean the dependency issue is closed by a pull
  request merged to the configured base branch.
- Change scopes are conservative repository-relative file or directory
  prefixes; prefix overlap is unsafe for concurrent execution.

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
