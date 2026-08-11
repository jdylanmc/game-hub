# Ralph Loop

The Game Hub Ralph Loop runs one bounded unit of issue work in each fresh GitHub
Copilot CLI context. It stores durable state in the repository so long-running
development can continue without depending on conversation history.

> **Audience:** Use this concept when preparing or supervising local autonomous
> development for Game Hub.

## Why the Loop Exists

Long agent sessions accumulate instructions, implementation details, tool
output, and failed approaches. As the context window fills, the agent may lose
important constraints through compaction or give recent details too much
weight. Practitioners often call the high-context region where quality drops the
"dumb zone."

The Ralph Loop prevents context accumulation. Each iteration launches a new
Copilot process, reads the current repository state, completes one story, and
writes its result to disk. Git history and files carry the state that the next
iteration needs.

Geoff Huntley named and popularized the
[Ralph Wiggum pattern](https://ghuntley.com/ralph/). The
[`snarktank/ralph`](https://github.com/snarktank/ralph) project demonstrates the
fresh-context shell loop, story plan, progress log, and `AGENTS.md` update
pattern that informed this implementation.

## How the Loop Works

Each iteration follows the same cycle:

1. **Read** the GitHub Issue, story plan, progress, relevant `AGENTS.md` files,
   pull request checks, and recent Git history.
2. **Plan** one story small enough to complete and verify within the fresh
   context.
3. **Execute** the implementation without expanding the GitHub Issue's scope.
4. **Verify** the smallest available type, build, lint, test, and browser checks
   that cover the change.
5. **Write** the story result, reusable discoveries, and iteration log to disk.
6. **Publish** a passing commit to the issue branch and create or update its
   draft pull request.
7. **Restart** with another fresh context when unfinished stories or failing CI
   checks remain.

The local runner starts a new `copilot --prompt` process for every iteration. It
does not resume a prior Copilot session.

## GitHub Issues Define Scope

GitHub Issues are the source of truth for Game Hub functionality. Start the loop
with one issue number whenever possible.

When no issue is supplied, the `ralph-loop` skill:

1. Lists open issues.
2. Ranks issues by `priority:P0`, `priority:P1`, `priority:P2`, and
   `priority:P3`, then by issue number.
3. Recommends the next issue based on priority, dependencies, repository state,
   and whether another pull request already covers it.
4. Asks for confirmation before preparing the run.

The user may explicitly delegate selection and continuation by best judgment.
That delegation removes later issue-selection prompts for the current run; it
does not permit autonomous merges, scope outside open issues, or bypassing
failed checks. The runner rejects `--continuous` unless `plan.json` records that
delegation.

## Persistent State Lives in `docs/memories`

Every issue run owns one directory:

```text
docs/memories/<issue>-<slug>/
├── issue.md
├── plan.json
├── progress.md
└── iterations/
    └── <iteration>.log
```

`issue.md` snapshots the issue title, URL, body, labels, and acceptance criteria
used to prepare the run. `plan.json` splits the issue into ordered stories and
binds the run to one repository, issue, branch, and base branch while recording
ordered story pass state. `progress.md` records outcomes and reusable context.
The runner writes raw Copilot output to the local `iterations/` directory. Git
ignores these logs because tool output can contain machine-specific or sensitive
data. Durable context belongs in the committed `progress.md`.

Committed repository memory is transparent and reviewable. Never put
credentials, personal data, access tokens, private chat, or unrelated repository
content in these files.

## Workspace Guidance Carries Durable Conventions

Every Yarn workspace contains an `AGENTS.md`. An iteration reads the root file
and each workspace file that covers edited paths.

Update a workspace `AGENTS.md` only when the iteration discovers a reusable
convention or dependency, such as a required generated artifact or a workspace
specific validation command. Put story status, temporary debugging notes, and
failed attempts in the issue memory.

## Required Invariants

1. **Each iteration uses a fresh Copilot context.** Resuming a session defeats
   the context-isolation property.
2. **Each iteration completes at most one story.** Oversized iterations recreate
   the context pressure the loop is designed to avoid.
3. **The worktree starts and ends clean.** Uncommitted changes stop the loop so a
   later context cannot compound an unknown partial state.
4. **Passing checks precede commits.** Broken commits make every later iteration
   less reliable.
5. **Every run uses an issue branch and draft pull request.** The loop never
   pushes directly to the default branch.
6. **The loop never merges.** A human owns the merge decision.
7. **All cross-iteration memory lives under `docs/memories`.** Conversation
   history and local hidden files are not durable project state.
8. **Run identity cannot drift.** Repository, issue, branch, base branch, and
   draft pull request must continue to identify the same work.
9. **Remote state is reconciled before publication.** The runner fetches and
   stops on branch divergence or pull request collisions.
10. **GitHub API calls use the repository owner account.** The runner switches
    to `jdylanmc` and restores the account that was active at startup.

The runner enforces branch, clean-worktree, workspace guidance, tool, and memory
preconditions before launching Copilot.

## Natural Recovery

Git commits define successful checkpoints. If Copilot exits with an error or
leaves uncommitted changes, the runner stops and preserves the files for human
inspection. Restart the loop after resolving the blocker and restoring a clean
worktree.

The next fresh context reads the last committed plan and progress. It does not
inherit the failed context's assumptions.

## Unattended Operation

Use a finite iteration limit during daytime development. Use continuous mode
only after confirming the issue, reviewing its story plan, authenticating
Copilot and GitHub CLI, and verifying that local checks run successfully.

Continuous mode means "continue until the selected issue and its draft pull
request are ready." It does not mean "ignore failures." The runner stops on
dirty state, lost authentication, stale or diverged branches, pull request
identity conflicts, malformed memory, absent CI gates, or repeated tool failure.

## When the Pattern Backfires

Avoid the Ralph Loop when the work cannot be divided into independently
verifiable stories. A broad migration that must remain coherent across hundreds
of files may need one coordinated context and a human-authored plan first.

The pattern also performs poorly when:

- the story plan omits critical requirements;
- tests or CI are absent, slow, or flaky;
- multiple loops share one worktree or branch;
- an iteration requires an interactive product or security decision;
- credentials or external systems require repeated human approval;
- the task depends on tacit context that has not been written to memory;
- a story is too large to complete within one context.

Fix the state, checks, or story boundaries before increasing the iteration
limit. More iterations amplify weak feedback loops.

## Local Entry Point

Invoke the repository skill from Copilot CLI:

```text
Run the ralph-loop skill for issue #27.
```

After the skill creates and commits the issue memory, it runs:

```bash
.github/skills/ralph-loop/scripts/run-ralph-loop.sh \
  --memory-dir docs/memories/27-repository-wide-code-linting \
  --max-iterations 10
```

Pass `--continuous` only after the user explicitly delegates unattended
continuation for the selected issue.

## See Also

- [Memory Directory](memories/README.md)
- [Root Agent Guide](../AGENTS.md)
- [snarktank/ralph](https://github.com/snarktank/ralph)
- [Geoff Huntley's Ralph article](https://ghuntley.com/ralph/)
