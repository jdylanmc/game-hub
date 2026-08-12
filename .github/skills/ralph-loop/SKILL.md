---
name: ralph-loop
description: 'Runs Game Hub issue work through fresh GitHub Copilot CLI contexts with repository-backed memory. Use when the user asks to run Ralph, continue an issue autonomously, or select and implement the next prioritized GitHub Issue.'
allowed-tools:
  - ask_user
  - bash
  - glob
  - rg
  - view
---

# Game Hub Ralph Loop

Prepare and launch one or more local Ralph Loops. Every GitHub Issue owns a
deterministic issue branch and sibling Git worktree. Repository-backed memory
carries state between fresh contexts, and the orchestrator may run independent
issue worktrees concurrently while each runner maintains only a draft pull
request.

Constraint: Do not merge pull requests, push to the default branch, bypass
failed checks, store secrets in memory, or run more than one issue in a shared
worktree.

## Prerequisites

- Run from any Game Hub worktree.
- Read `AGENTS.md`, `docs/architecture.md`, and `docs/ralph-loop.md`.
- Require `git`, `gh`, `jq`, and `copilot`.
- Require authenticated GitHub CLI access to the `origin` repository.
- Start with a clean worktree and never modify another issue's worktree.

## Phase 0: Bind the Repository Identity

1. Resolve the repository root with `git rev-parse --show-toplevel`. Do not infer
   a repository from a sibling directory.
2. Resolve `origin` and require it to identify `jdylanmc/game-hub`.
3. Resolve the repository owner's stored token without changing shared GitHub
   CLI state:

   ```bash
   GH_TOKEN="$(GH_TOKEN= GITHUB_TOKEN= gh auth token \
     --hostname github.com --user jdylanmc)"
   ```

4. Use that token only in the current process environment and verify
   `GH_TOKEN="$GH_TOKEN" gh api user --jq .login` returns `jdylanmc`.
5. Never run `gh auth switch` from Ralph automation. It mutates shared global
   state and races with concurrent loops. The orchestrator gives every child
   runner its own environment copy, and standalone runners resolve the same
   owner token without changing the user's active account.

## Phase 1: Select and Distill Issues

1. If the user supplied an issue number or URL, retrieve that issue and use it.
2. If no issue was supplied, check open Ralph pull requests before listing new
   issues:

   ```bash
   yarn ralph:prioritize
   ```

   If the command returns `status: failing`, resume the reported `memoryDir` on
   its reported branch and issue. Do not rank or select a new issue. Treat an
   absent check rollup as blocking because the required completion gate is
   missing. The command stops rather than guessing when the pull request's issue
   marker, draft state, branch, base branch, repository, or unique memory mapping
   cannot be verified.
3. Only when `yarn ralph:prioritize` returns `status: none`, run:

   ```bash
   gh issue list --repo jdylanmc/game-hub --state open --limit 100 \
     --json number,title,body,labels,url
   ```

4. Rank issues by `priority:P0`, `priority:P1`, `priority:P2`, and
   `priority:P3`, then by issue number. Adjust the recommendation when
   dependencies, existing pull requests, or repository state make the first
   issue unsafe or blocked.
5. For every proposed issue, identify:
   - issue dependencies that must be merged to `main` first;
   - conservative repository-relative file or directory prefixes it may change;
   - likely overlap with active issue branches or pull requests.
6. Show the recommended issue or independent parallel set and rationale. Use
   `ask_user` to confirm it.
7. Offer an explicit "continue by best judgment" choice. Record that delegation
   for this invocation only. Without it, do not choose another issue without
   confirmation.

## Phase 2: Create or Resume the Issue Worktree

1. Derive branch `ralph/issue-<number>-<slug>` and deterministic sibling path
   `<primary-repository-parent>/<repository>-worktrees/issue-<number>`.
2. Fetch `origin/main`, then run:

   ```bash
   node .github/skills/ralph-loop/scripts/prepare-ralph-worktree.mjs \
     --issue <number> --branch ralph/issue-<number>-<slug>
   ```

3. The preparer must reject a branch checked out elsewhere, another branch at
   the deterministic path, dirty state, and local/remote divergence. It never
   removes a worktree. Do not delete any dirty or unmerged worktree
   automatically.
4. Change into the returned worktree before creating memory or launching the
   first iteration. The primary checkout is coordination-only.

## Phase 3: Prepare Durable Memory

1. Derive `docs/memories/<issue>-<slug>/` using the numeric issue ID and a
   lowercase ASCII slug. Reject absolute paths, `.` or `..` components, and
   paths outside `docs/memories/`.
2. Check whether the exact directory already exists. If it does, read
   `issue.md`, `plan.json`, and `progress.md` before writing. Ask whether to
   resume the matching issue memory or choose a different path. Never overwrite
   existing memory blindly.
3. Write `issue.md` with the issue number, title, URL, labels, body, and
   acceptance criteria. Preserve the issue's meaning; do not invent scope.
4. Write `plan.json` with this shape:

   ```json
   {
     "repoNameWithOwner": "jdylanmc/game-hub",
     "issueNumber": 27,
     "issueTitle": "Repository-Wide Code Linting",
     "issueUrl": "https://github.com/jdylanmc/game-hub/issues/27",
     "branchName": "ralph/issue-27-repository-wide-code-linting",
     "baseBranch": "main",
     "continuousByBestJudgment": false,
     "orchestration": {
       "priority": 1,
       "dependencies": [],
       "changeScopes": ["games/example-game"]
     },
     "publication": {
       "requiredStatusChecks": ["Continuous integration"],
       "adversarialStatusChecks": []
     },
     "stories": [
       {
         "id": "US-001",
         "title": "Add the lint toolchain",
         "description": "Install and configure the repository lint toolchain.",
         "acceptanceCriteria": [
           "The root lint command exits successfully"
         ],
         "priority": 1,
         "passes": false,
         "notes": ""
       }
     ]
   }
   ```

   Set `continuousByBestJudgment` to `true` only after the user explicitly
   delegates unattended continuation for this issue.

5. Make each story small enough for one Copilot context and independently
   verifiable. Target about 45 minutes of implementation plus verification
   time; the runner stops any one iteration after 90 minutes by default. Put
   dependency stories first.
6. When live or external work is required, split it into separate stories or
   checkpoints instead of one multi-hour story. Live deployment, calibration,
   exact-head publication, and enforcement or adversarial review are separate
   checkpoints when applicable.
7. Record publication requirements in `plan.json.publication`. Keep
   `requiredStatusChecks` aligned with the exact pull-request checks that must
   pass on the published head. Add `adversarialStatusChecks` only when an
   additional exact-head external check is required.
8. Write `progress.md` with a `# Progress` heading and a `## Codebase Patterns`
   section.
9. Create an empty `iterations/` directory.
10. Show the exact issue identity, repository, branch, story list, acceptance
   criteria, and continuous-mode choice. Require confirmation before committing
   memory or launching the runner.

## Phase 4: Validate the Issue Branch

1. Fetch `origin`.
2. Confirm the branch was created from the latest `origin/<baseBranch>` by the
   worktree preparer.
3. If the branch exists remotely, fetch it and verify that the remote branch is
   an ancestor of the local branch. Stop on behind or diverged state.
4. Query existing pull requests for the branch with
   `--repo jdylanmc/game-hub`. Stop if a pull request is closed, ready for
   review, targets another base branch, or references another issue.
5. Commit the issue memory before starting unattended iterations.
6. Never reuse a branch whose pull request covers a different issue.

## Phase 5: Launch Fresh Contexts

Use the bundled runner:

```bash
.github/skills/ralph-loop/scripts/run-ralph-loop.sh \
  --memory-dir docs/memories/<issue>-<slug> \
  --max-iterations 10 \
  --iteration-deadline-minutes 90
```

When the user explicitly delegated unattended continuation for the selected
issue, replace `--max-iterations 10` with `--continuous`.

The script uses
`references/iteration-prompt.md` as the contract for each fresh Copilot
invocation. It also writes a git-local lease, heartbeat, and checkpoint under
the repository's shared git common directory so status and recovery do not rely
on todo rows or shell history. Do not resume prior Copilot sessions.

For multiple confirmed loops, create a local orchestration manifest based on
`references/orchestration-manifest.example.json` and run:

```bash
node .github/skills/ralph-loop/scripts/orchestrate-ralph-loops.mjs \
  --manifest <path> --max-parallel <count>
```

The orchestrator verifies dependency pull requests are merged to the base
branch, sorts eligible work by priority and issue number, refuses duplicate
ownership and overlapping eligible scopes, starts each runner in its own
worktree, and emits coalesced status reports for loop launch, story completion,
publication or continuous-integration state changes, blockers, and completion.
Unchanged short-interval polls are silent; a longer rate-limited heartbeat
reports continued work without flooding output.

Use the status command to inspect truthful runtime state for one loop:

```bash
yarn ralph:status -- --memory-dir docs/memories/<issue>-<slug>
```

## Phase 6: Report the Run

Report:

- selected issue and branch;
- completed and remaining stories;
- draft pull request URL;
- local and CI check status;
- stopping reason when incomplete.

Do not describe an incomplete or failing pull request as ready.

## Error Handling

### GitHub authentication fails

- Fail if the `jdylanmc` account is unavailable or `gh repo view
  jdylanmc/game-hub` fails.
- Do not fall back to `gh auth switch`; preserve global account state and ask
  the user to restore the stored `jdylanmc` credential.

### Worktree is dirty

- Fail before launching another context.
- Preserve the changes and report the files. Do not reset or discard them.
- Never remove the worktree automatically, even when its pull request is
  merged; cleanup is an explicit human lifecycle action.

### Lease is stale or cancelled

- The runner writes an atomic `lease.json` heartbeat and `checkpoint.json`
  under the git common directory for the issue.
- A fresh runner refuses an active healthy lease, archives stale or stopped
  state before recovery, and stops when dirty files block deterministic resume.
- Recovery resumes from the last verified checkpoint; it never auto-commits
  unvalidated dirty files.

### Copilot exits unsuccessfully

- Preserve the iteration log under the issue memory.
- Stop the loop. Do not continue from an unknown partial state.

### Checks fail

- Keep the pull request in draft.
- Let the next bounded iteration diagnose and fix the failure.
- Stop when the iteration limit is reached or safe progress is blocked.

### Memory is malformed

- Fail before invoking Copilot.
- Repair `plan.json` or the required memory files and commit the repair.

### Remote branch diverges

- Stop before launching or pushing another iteration.
- Preserve local and remote commits. Do not force-push, reset, rebase, or merge
  without a human decision.

### Parallel ownership or scope collides

- Stop before launching any colliding eligible loops.
- Report the duplicate issue/branch/worktree or exact overlapping scopes.
- A dependency edge may serialize overlapping work, but must not be removed
  merely to make both loops eligible.

### Publication partially succeeds

- Report the exact pushed commit, branch, and pull request state.
- Rerun only after verifying that the existing branch and pull request still
  match the issue memory.

## Examples

### Explicit issue

**User:** "Run the Ralph Loop for issue #27."

**Action:** Prepare issue #27 memory, confirm its story plan, create its issue
branch, and run bounded fresh contexts.

### Issue recommendation

**User:** "Pick up the next Game Hub issue with Ralph."

**Action:** Rank open issues, recommend one, ask for confirmation, and prepare
the confirmed issue.

### Overnight run

**User:** "Run issue #27 overnight and continue by best judgment."

**Action:** Confirm issue #27 and its plan, record the delegation, and launch
the runner with `--continuous`. Maintain a draft pull request and never merge.

---

<!-- 🤖 This skill was created using the create-skill AI skill. https://github.com/gaming-microsoft/ai-skills -->
