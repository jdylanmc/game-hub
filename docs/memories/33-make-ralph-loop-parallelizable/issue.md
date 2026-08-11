# Issue #33: Make Ralph Loop parallelizable

- URL: https://github.com/jdylanmc/game-hub/issues/33
- Labels: none
- Branch: `ralph/issue-33-make-ralph-loop-parallelizable`

## Body

The orchestrator should be able to manage multiple Ralph loops, prioritizing
which get run in parallel and distilling down interdependencies. Two independent
games should be creatable by two different agents at the same time. Ralph loops
always work in their own Git worktree, using worktrees and branches to
distinguish loops. The orchestrator should report meaningful changes and
periodic status without flooding output.

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
