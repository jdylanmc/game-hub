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
```

Adversarial reviewer calibration is versioned and fail-closed. Use
`yarn calibrate:adversarial --mode fixture` for deterministic local evaluation;
only a complete real-Azure report that passes
`yarn calibration:check --report <path>` is eligible for promotion. Recalibrate
after any fingerprinted model, prompt, tool, framework, schema, policy, or
architecture change.

Gilfoyle additionally requires a GitHub artifact attestation from its exact
protected calibration workflow run. `yarn calibration:attestation:verify`
cryptographically binds the exact repository head, workflow run and attempt,
registered configuration, Azure deployment and workload identity, benchmark
inputs, report artifact, and verified timestamps. Repository-authored JSON,
unsigned bundles, stale or replayed runs, and mismatched evidence cannot
self-assert promotion.

When lint and test scripts exist, treat them as required gates for every Ralph
Loop iteration.

Run `yarn generate:check` after changing game workspace metadata or discovery
logic. It fails when generation changes Git state or the committed catalog
outputs are dirty.

## Continuous Integration

`.github/workflows/continuous-integration.yml` runs the same root validation
commands as local development, then runs an independent read-only deterministic
security job. The required `Continuous integration` check is a final
fail-closed aggregate of both jobs. Keep action references pinned to full
commit SHAs, preserve least-privilege permissions and fork safety, and retain
the workflow's logs, test results, coverage, production build, Storybook, and
security evidence. Fresh `node-modules` runners must bootstrap with direct
`yarn install --immutable` before invoking package scripts. Every command piped
to an evidence log must run with Bash `pipefail` semantics.

Order deterministic gates from cheapest to most expensive so formatting,
linting, policy, generation, type, and test failures stop work before builds,
Storybook, fail-closed simulations, or model-backed review. Adversarial-agent
workflows must depend on the complete deterministic workflow succeeding; they
must not consume model capacity while any deterministic gate is missing,
pending, canceled, or failing.

`yarn context:collect` creates bounded adversarial-review evidence from local
Git objects and explicit issue/pull-request metadata. It treats every collected
value as inert untrusted data and must never check out, import, install, build,
test, or execute pull-request content.

Use `yarn context:collect --agent gilfoyle-security-architect` for the
independently hashed security profile. Preserve its explicit security-surface
inventory, trust boundaries, privileged identities, source/sink flows,
control-change mapping, and fail-closed mandatory-context behavior. Gilfoyle
also requires the bounded exact-head manifest through
`--deterministic-evidence`; missing, failed, stale, downgraded, oversized, or
misattributed deterministic evidence blocks before model access.

The deterministic security job runs pinned CodeQL and dependency-review
actions plus dependency audit, redacted added-secret detection, workflow
policy, pinned Bicep compilation, and an explicit container-surface guard. A
container definition fails closed as unsupported until a reviewed scanner is
configured; an absent container surface is recorded as `NOT_APPLICABLE`.
Gilfoyle can consume the resulting hashes and summaries but can never override
the authoritative workflow conclusion.

Adversarial source-issue resolution accepts canonical Ralph markers, matching
`issue-<number>` branch identity, and explicit close/fix/resolve/track/address
declarations. Generic prose such as a dependency's "issue #N" is not identity;
conflicting canonical signals must fail closed.

`yarn review:adversarial` consumes only a ready context packet. Keep its
versioned system policy separate from the human review prompt, authenticate with
Microsoft Entra ID, register no model tools, restrict Azure OpenAI destinations,
and return schema-valid blocking errors whenever bounded execution cannot
produce a policy-safe verdict.

Every adversarial agent also owns a content-hashed bounded-tools contract.
Keep prompt, tools, schema, policy, model, calibration, check, and state
attribution independent so one agent cannot weaken or impersonate another.

`yarn publish:adversarial` validates reviewer output again before publishing one
agent-specific GitHub check for the exact head commit. It writes a retained,
redacted evidence bundle; the artifact is authoritative when repeated runs
supersede annotations. Publication must remain downstream of complete
deterministic continuous integration.

`.github/workflows/adversarial-review.yml` runs only from protected default-
branch code after the exact pull-request head passes complete deterministic
continuous integration. Never check out or execute pull-request code in that
workflow. Preserve its three deterministic capacity lanes, two exact-head
revalidations, least-privilege job permissions, promoted-calibration gate, and
90-day evidence retention.

Microsoft Entra ID federated credentials for repository workflows must use
GitHub's immutable subject format with both owner and repository numeric IDs.
Keep the exact protected-environment mappings in
`infra/federated-identity-*.bicepparam` and deploy them through the pinned,
subscription-guarded Bicep path; never restore name-only repository subjects.

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
Ralph completion and prioritization use `config/ralph-required-checks.json`;
every listed check must exist exactly once and succeed for the current head SHA.

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
