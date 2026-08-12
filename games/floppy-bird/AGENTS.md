# FloppyBird Workspace Agent Guide

`@game-hub/floppy-bird` is a self-contained Three.js game workspace. Read the
[root agent guide](../../AGENTS.md) and
[Ralph Loop](../../docs/ralph-loop.md) before editing this workspace.

## Workspace Contract

- Keep Three.js rendering, browser input, and host effects in `src/index.ts`;
  keep pure state progression in `src/simulation.ts`.
- Advance simulation from explicit state, input, elapsed time, and a supplied
  random source without reading browser or Three.js state.
- Clamp gameplay frame deltas inside `src/simulation.ts` so direct callers and
  tests preserve the same bounded physics as the rendering adapter.
- Keep paused and game-over simulation states fully frozen, including ambience
  and wing animation state.
- Use `FloppyBirdRuntimeOptions` to inject deterministic clocks, randomness,
  and score timestamps in runtime tests without replacing ambient globals.
- Keep `game.manifest.json`, the exported manifest, and controls synchronized.
- Use `@game-hub/game-contract` for host lifecycle, events, and score reporting.
- Keep Three.js as a direct workspace dependency.
- Run `yarn generate:games` after changing workspace discovery metadata.
- Verify host integration with `yarn typecheck` and `yarn build`.

## Ralph Loop Memory

Read the selected issue memory under `docs/memories/` before changing the game.
Complete one bounded story per iteration. Store story results in the issue
memory and add only reusable FloppyBird conventions to this file.
