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

Prepare and launch the local Ralph Loop for one Game Hub GitHub Issue. GitHub
Issues define scope, `docs/memories/` carries state between fresh contexts, and
the bundled runner maintains a draft pull request without merging it.

Constraint: Do not merge pull requests, push to the default branch, bypass
failed checks, store secrets in memory, or run more than one issue in a shared
worktree.

## Prerequisites

- Run from the Game Hub repository root.
- Read `AGENTS.md`, `docs/architecture.md`, and `docs/ralph-loop.md`.
- Require `git`, `gh`, `jq`, and `copilot`.
- Require authenticated GitHub CLI access to the `origin` repository.
- Start with a clean worktree.

## Phase 0: Bind the Repository Identity

1. Resolve the repository root with `git rev-parse --show-toplevel`. Do not infer
   a repository from a sibling directory.
2. Resolve `origin` and require it to identify `jdylanmc/game-hub`.
3. Read the active GitHub CLI account with `gh api user --jq .login`.
4. Switch to `jdylanmc` before any `gh repo`, `gh issue`, or `gh pr` operation:

   ```bash
   gh auth switch --hostname github.com --user jdylanmc
   ```

5. Restore the original active account after setup or on any failure. The
   bundled runner performs the same switch and restoration for unattended work.

## Phase 1: Select the Issue

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
5. Show the recommended issue and rationale. Use `ask_user` to confirm it.
6. Offer an explicit "continue by best judgment" choice. Record that delegation
   for this invocation only. Without it, do not choose another issue without
   confirmation.

## Phase 2: Prepare Durable Memory

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
   verifiable. Put dependency stories first.
6. Write `progress.md` with a `# Progress` heading and a `## Codebase Patterns`
   section.
7. Create an empty `iterations/` directory.
8. Show the exact issue identity, repository, branch, story list, acceptance
   criteria, and continuous-mode choice. Require confirmation before committing
   memory or launching the runner.

## Phase 3: Create the Issue Branch

1. Fetch `origin`.
2. Create the `branchName` from the latest `origin/<baseBranch>`.
3. If the branch exists remotely, fetch it and verify that the remote branch is
   an ancestor of the local branch. Stop on behind or diverged state.
4. Query existing pull requests for the branch with
   `--repo jdylanmc/game-hub`. Stop if a pull request is closed, ready for
   review, targets another base branch, or references another issue.
5. Commit the issue memory before starting unattended iterations.
6. Never reuse a branch whose pull request covers a different issue.

## Phase 4: Launch Fresh Contexts

Use the bundled runner:

```bash
.github/skills/ralph-loop/scripts/run-ralph-loop.sh \
  --memory-dir docs/memories/<issue>-<slug> \
  --max-iterations 10
```

When the user explicitly delegated unattended continuation for the selected
issue, replace `--max-iterations 10` with `--continuous`.

The script uses
`references/iteration-prompt.md` as the contract for each fresh Copilot
invocation. Do not resume prior Copilot sessions.

## Phase 5: Report the Run

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
- Restore the original active account before asking the user to authenticate.

### Worktree is dirty

- Fail before launching another context.
- Preserve the changes and report the files. Do not reset or discard them.

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
