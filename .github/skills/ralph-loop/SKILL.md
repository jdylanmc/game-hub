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

## Phase 1: Select the Issue

1. If the user supplied an issue number or URL, retrieve that issue and use it.
2. If no issue was supplied, run:

   ```bash
   gh issue list --state open --limit 100 \
     --json number,title,body,labels,url
   ```

3. Rank issues by `priority:P0`, `priority:P1`, `priority:P2`, and
   `priority:P3`, then by issue number. Adjust the recommendation when
   dependencies, existing pull requests, or repository state make the first
   issue unsafe or blocked.
4. Show the recommended issue and rationale. Use `ask_user` to confirm it.
5. Offer an explicit "continue by best judgment" choice. Record that delegation
   for this invocation only. Without it, do not choose another issue without
   confirmation.

## Phase 2: Prepare Durable Memory

1. Create `docs/memories/<issue>-<slug>/`.
2. Write `issue.md` with the issue number, title, URL, labels, body, and
   acceptance criteria. Preserve the issue's meaning; do not invent scope.
3. Write `plan.json` with this shape:

   ```json
   {
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

4. Make each story small enough for one Copilot context and independently
   verifiable. Put dependency stories first.
5. Write `progress.md` with a `# Progress` heading and a `## Codebase Patterns`
   section.
6. Create an empty `iterations/` directory.

## Phase 3: Create the Issue Branch

1. Fetch `origin`.
2. Create the `branchName` from the latest `origin/<baseBranch>`.
3. Commit the issue memory before starting unattended iterations.
4. Never reuse a branch whose pull request covers a different issue.

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

- Fail if `gh repo view` cannot read the `origin` repository.
- Ask the user to authenticate the correct GitHub account, then rerun.

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
