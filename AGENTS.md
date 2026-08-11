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
```

When lint and test scripts exist, treat them as required gates for every Ralph
Loop iteration.

Run `yarn generate:check` after changing game workspace metadata or discovery
logic. It fails when generation changes Git state or the committed catalog
outputs are dirty.

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

## Ralph Loop

The Ralph Loop completes one bounded story in a fresh GitHub Copilot CLI context,
persists its state, and starts another context only when work remains. GitHub
Issues define product scope. The selected issue, a story plan, progress, and
iteration logs live under `docs/memories/<issue>-<slug>/`.

Follow [Ralph Loop](docs/ralph-loop.md) for the full model and safety rules.

### Iteration Rules

1. Read the selected GitHub Issue, this file, `docs/architecture.md`, the
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
