# Game Hub Agent Guide

Game Hub is a Yarn workspaces monorepo for a React, TypeScript, Vite, and
Tailwind website that hosts independently packaged browser games. Read this file
before changing the repository, then read the nearest workspace `AGENTS.md`
before editing a workspace.

## Repository Map

| Path | Purpose |
| --- | --- |
| `src/` | Host website, routes, shared components, and Storybook stories |
| `games/*/` | Independently packaged game workspaces |
| `packages/game-contract/` | Shared host-to-game TypeScript contract |
| `scripts/` | Repository generators |
| `docs/` | Architecture and operating documentation |
| `.github/skills/ralph-loop/` | Local Ralph Loop skill and runner |

Read [Game Hub Architecture](docs/architecture.md) before planning a change. It
defines the system boundaries, pinned technology versions, official
documentation links, and required architectural invariants.

## Required Commands

Run the smallest commands that cover the files you changed. The repository
currently provides:

```bash
yarn typecheck
yarn build
yarn build-storybook
yarn generate:check
yarn policy:check
yarn bundle:check
yarn infra:check
```

When lint and test scripts exist, treat them as required gates for every Ralph
Loop iteration.

Infrastructure changes must use the Bicep version in
`infra/.bicep-version`. Run `yarn infra:install` to install that version through
Azure CLI before `yarn infra:check`.

Run `yarn generate:check` after changing game workspace metadata or discovery
logic. It fails when generation changes Git state or the committed catalog
outputs are dirty.

## Continuous Integration

`.github/workflows/continuous-integration.yml` runs the same root validation
commands as local development. Keep action references pinned to full commit
SHAs, preserve least-privilege permissions and fork safety, and retain the
workflow's logs, test results, coverage, production build, and Storybook
evidence.

`yarn policy:check` rejects unapproved lint suppressions and weakened workflow
invariants. Record an exceptional suppression with a specific rationale in
`config/lint-suppressions.json`. `yarn bundle:check` enforces the reviewed
raw-byte entry, async chunk, JavaScript, stylesheet, and total budgets in
`config/bundle-budgets.json` after `yarn build`; budget increases require an
explained review.

`yarn test:ci-fail-closed` creates an isolated detached worktree and injects
representative failures into every mandatory gate. Keep each probe tied to the
canonical root command and require evidence that it failed for the intended
reason.

The `main` branch requires the GitHub Actions `Continuous integration` check,
an up-to-date branch, and a non-author Code Owner review. Keep workflow and
ownership paths covered by `.github/CODEOWNERS`; `yarn policy:check` rejects
weakened ownership rules.

## Test Integrity

Keep at least one deterministic test under each of `src/`, `games/`, and
`packages/`. Do not commit focused, skipped, todo, or quarantined tests; the root
test command rejects those states and enforces coverage thresholds.

## GitHub CLI Account

GitHub CLI stores both `dylanmccurry_microsoft` and `jdylanmc` credentials for
`github.com`. The active account controls GitHub API operations such as
`gh issue`, `gh pr`, and `gh repo`.

Switch to the repository owner before operating on `jdylanmc/game-hub`:

```bash
gh auth switch --hostname github.com --user jdylanmc
```

Restore the primary work account after the GitHub operation completes:

```bash
gh auth switch --hostname github.com --user dylanmccurry_microsoft
```

Use a shell trap for unattended scripts so failures also restore the original
account. Do not log out either account or replace its stored credential. Git
pushes use the repository's SSH configuration and do not require changing the
active GitHub CLI account.

Ralph automation is the exception to interactive account switching: concurrent
processes must resolve the repository owner's stored token once, pass it through
their own `GH_TOKEN` environment, and never run `gh auth switch`. The active
GitHub CLI account is shared machine state and is unsafe for parallel loops.

## Ralph Loop

The Ralph Loop completes one bounded story in a fresh GitHub Copilot CLI context,
persists its state, and starts another context only when work remains. Every
issue owns the branch `ralph/issue-<number>-<slug>` and deterministic sibling
worktree `<repository>-worktrees/issue-<number>`, including its first iteration.
GitHub Issues define product scope. The selected issue, a story plan, progress,
and iteration logs live under `docs/memories/<issue>-<slug>/` in that worktree.

The Ralph orchestrator may run clean, dependency-free issue worktrees in
parallel only when their declared repository-relative change scopes do not
overlap. Never edit another issue's worktree, automatically remove a dirty or
unmerged worktree, or reuse an issue branch for another loop.

Orchestrator status is transition-driven. Emit reports for launch, story,
publication or continuous-integration changes, blocker, and completion;
coalesce changes found in one observation, suppress unchanged polls, and use a
longer heartbeat for periodic unchanged status.

Use `yarn ralph:status -- --memory-dir docs/memories/<issue>-<slug>` when you
need a truthful Ralph status. The runner's live lease, heartbeat, and
checkpoint state live under the repository's shared git common directory and
must not be committed.

Before ranking an unassigned issue, run `yarn ralph:prioritize`. A blocking open
Ralph pull request must map to exactly one matching issue memory; missing or
ambiguous identity stops selection rather than falling through to new work.

Follow [Ralph Loop](docs/ralph-loop.md) for the full model and safety rules.

### Iteration Rules

1. Confirm the current path is the issue's deterministic worktree, then read
   the selected GitHub Issue, this file, `docs/architecture.md`, the
   nearest workspace `AGENTS.md`, the issue memory, and recent Git history.
2. Select one story that fits in one context window.
3. Implement and verify that story.
4. Update the issue memory and any reusable workspace guidance.
5. Commit only when the required local checks pass.
6. Push the issue branch and create or update its draft pull request.
7. Never merge a pull request from the Ralph Loop.

Stop the loop when an iteration leaves uncommitted changes, authentication
fails, required checks cannot run, or the agent cannot make safe progress.

## Workspace Agent Files

Every Yarn workspace must contain its own `AGENTS.md`. Add the file when adding
a workspace. Keep workspace guidance scoped to durable conventions, commands,
dependencies, and non-obvious relationships. Store issue-specific discoveries
in `docs/memories/`.
