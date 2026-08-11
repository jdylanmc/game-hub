# Ralph Iteration Contract

You are one fresh iteration of the Game Hub Ralph Loop.

The runner supplies `MEMORY_DIR`. Complete at most one bounded story and leave
the repository in a clean, committed state.

## Read Before Editing

1. Read `/AGENTS.md`.
2. Read `/docs/architecture.md`.
3. Read `/docs/ralph-loop.md`.
4. Read `$MEMORY_DIR/issue.md`, `$MEMORY_DIR/plan.json`, and
   `$MEMORY_DIR/progress.md`.
5. Read the nearest `AGENTS.md` for every workspace you may change.
6. Inspect recent Git history, the current draft pull request, and its checks.

Treat the GitHub Issue snapshot as scope and GitHub as the current source of
truth. If the live issue materially differs from the snapshot, update the
snapshot and stop so the next iteration can re-plan.

## Select One Story

If every planned story passes but the draft pull request has a failing required
check, add one bounded remediation story for one coherent failure and work on
that story. Do not mark existing implementation stories failed when their
acceptance criteria still pass.

Choose the lowest-priority-number story whose `passes` value is `false` and
whose dependencies are complete. Work on no other story.

If the story cannot fit in this context, split it into smaller stories in
`plan.json`, append the reason to `progress.md`, commit the planning change, and
end the iteration.

## Implement and Verify

- Follow existing repository patterns and all relevant `AGENTS.md` files.
- Keep the change within the selected issue and story.
- Run the smallest existing checks that cover the change.
- Run `yarn typecheck` and `yarn build` for code changes.
- Run root `lint` and `test` scripts when they exist.
- Verify user-visible changes in a browser with available browser automation.
- Do not mark a story passed when a required check is unavailable or failing.

## Persist the Result

When every acceptance criterion passes:

1. Set the story's `passes` value to `true` in `plan.json`.
2. Add concise notes to the story when future iterations need them.
3. Append an entry to `progress.md` with:
   - date and story ID;
   - implementation summary;
   - files changed;
   - checks run and outcomes;
   - reusable discoveries;
   - blockers or follow-up work.
4. Add reusable workspace conventions to the nearest `AGENTS.md`. Keep
   issue-specific details in the memory directory.
5. Commit all implementation and memory changes together. Follow repository
   commit conventions.

If checks fail, fix them within this story when safe. If you cannot finish,
append the blocker to `progress.md` and leave a clean worktree. Do not create a
passing commit for broken code.

## Pull Request Rules

- Let the outer runner push commits and create or update the draft pull request.
- Do not push, create pull requests, mark them ready, close them, or merge them.
- Read failed CI logs and use a later iteration to fix them.
- Keep changes compatible with one draft pull request for the selected issue.

## Completion Signal

Output `<promise>COMPLETE</promise>` only when:

- every story in `plan.json` has `passes: true`;
- the worktree is clean;
- all required local checks pass;
- the latest reported CI checks pass, or the branch has no pull request yet
  because the outer runner has not published the current commit.

End normally when more work remains.
