# Ralph Loop Memories

This directory stores reviewable state that lets fresh Ralph Loop iterations
continue a GitHub Issue. Each issue uses its own subdirectory and commits state
changes with the implementation they describe.

## Directory Contract

Use `docs/memories/<issue>-<slug>/` for each run. The directory contains:

| Path | Purpose |
| --- | --- |
| `issue.md` | Snapshot of the selected GitHub Issue and acceptance criteria |
| `plan.json` | Ordered, bounded stories with pass state |
| `progress.md` | Append-only outcomes, decisions, and reusable discoveries |
| `iterations/` | Gitignored local output from each fresh Copilot invocation |

Keep product requirements in GitHub Issues. Memory files record the execution
state for one issue; they do not replace or silently broaden the issue.

## Memory Rules

- Commit memory updates with the implementation they describe.
- Append to `progress.md`; do not rewrite prior iteration entries.
- Update `plan.json` only after the story's required checks pass.
- Summarize durable log information in `progress.md`; do not commit raw logs.
- Store reusable workspace conventions in the nearest `AGENTS.md`.
- Store only project information that belongs in source control.
- Do not store credentials, tokens, personal data, private messages, or local
  machine configuration.

See [Ralph Loop](../ralph-loop.md) for the iteration model and safety rules.
