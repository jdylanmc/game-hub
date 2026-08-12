# Game Contract Workspace Agent Guide

`@game-hub/game-contract` defines the shared TypeScript boundary between the host
website and every trusted game workspace. Read the
[root agent guide](../../AGENTS.md) and
[Ralph Loop](../../docs/ralph-loop.md) before editing this workspace.

## Workspace Contract

- Treat exported types as a compatibility boundary for every game.
- Preserve lifecycle cleanup through `dispose`.
- Keep score submissions, phase events, heads-up display events, and
  announcements typed.
- Use `createSubmitScoreOnce` when a game has one terminal score so repeated
  terminal frames cannot duplicate the public host submission.
- Keep controller normalization as a type-only adapter seam until product
  normalization behavior is implemented and specified.
- Keep exported simulation clocks, random sources, and stepping helpers
  dependency-free and deterministic; they must not read or replace ambient
  browser or Node.js globals.
- Update all affected games and host call sites when changing an exported type.
- Verify contract changes with `yarn typecheck` and `yarn build`.

## Ralph Loop Memory

Contract changes often span multiple workspaces. Split them into stories that
leave the repository type-safe after every iteration. Store issue-specific
coordination in `docs/memories/` and add only reusable contract conventions to
this file.
