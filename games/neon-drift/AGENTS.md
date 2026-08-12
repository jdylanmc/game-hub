# Neon Drift Workspace Agent Guide

`@game-hub/neon-drift` is a placeholder Three.js game workspace. Read the
[root agent guide](../../AGENTS.md) and
[Ralph Loop](../../docs/ralph-loop.md) before editing this workspace.

## Workspace Contract

- Keep Three.js rendering, browser input, and host effects in `src/index.ts`;
  keep pure state progression in `src/simulation.ts`.
- Advance simulation from explicit state, input, elapsed time, and a supplied
  random source without reading browser or Three.js state.
- Keep `game.manifest.json`, the exported manifest, and controls synchronized.
- Use `@game-hub/game-contract` for host lifecycle, events, and score reporting.
- Keep Three.js as a direct workspace dependency.
- Run `yarn generate:games` after changing workspace discovery metadata.
- Verify host integration with `yarn typecheck` and `yarn build`.

## Ralph Loop Memory

Read the selected issue memory under `docs/memories/` before changing the game.
Complete one bounded story per iteration. Store story results in the issue
memory and add only reusable Neon Drift conventions to this file.
