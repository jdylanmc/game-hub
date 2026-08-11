# Issue #33: Make Ralph Loop parallelizable

- URL: https://github.com/jdylanmc/game-hub/issues/33
- Labels: none
- Branch: `ralph/issue-33-make-ralph-loop-parallelizable`

## Body

The orchestrator should be able to manage multiple ralph loops, prioritizing
which get run in parallel and distilling down interdependencies. The idea is
that two independent games could be created by two different agents at the same
time.

To achieve this, ralph loops _always_ work in their own git worktree. We use
worktrees on branches to distinguish different loops.

The orchestrator should also output a status report, each time a meaningful
change has occurred. Do not flood with status reports, but do provide an update
periodically as ralphs are working.

## Acceptance Criteria

- Every issue loop, including the first, runs in its own deterministic worktree
  and issue branch.
- The orchestrator prioritizes eligible issues, blocks unmet dependencies, and
  refuses duplicate ownership or overlapping change scopes.
- Existing identity, clean-state, draft pull request, human merge, divergence,
  stale-lock, and GitHub account restoration invariants remain enforced.
- Dirty or unmerged worktrees are never automatically deleted.
- Executable simulations cover parallel coexistence and all requested safety
  failures.
- Documentation, skill guidance, runner contracts, and durable memory describe
  the parallel model.
- Status reporting emits on meaningful loop, story, publication, continuous
  integration, blocker, and completion transitions; unchanged polling is quiet
  except for a rate-limited heartbeat.
