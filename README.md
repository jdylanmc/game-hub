# Game Hub

Game Hub is a Yarn workspaces monorepo for small browser games. The React +
Vite + TypeScript + Tailwind website stays at the repo root, while each game is
its own workspace under `games/*` with its own manifest, source, assets, and
`package.json`.

## Local development

```bash
yarn install
yarn dev
```

The main site always runs at `http://localhost:1337`.

## Documentation

- [Game Hub Architecture](docs/architecture.md) defines system boundaries,
  pinned versions, and upstream documentation.
- [Azure Hosting Infrastructure](docs/hosting-infrastructure.md) defines the
  selected Azure topology, trust boundaries, environments, costs, and outputs.
- [Continuous Integration Contract](docs/continuous-integration.md) defines the
  reproducible local gates, retained evidence, and fail-closed merge contract.
- [Repository Linting](docs/linting.md) defines lint and safe-fix usage, rule
  and environment choices, exclusions, suppressions, and acceptance evidence.
- [Branch Protection](docs/branch-protection.md) records the required merge
  controls and live verification procedure.
- [Ralph Loop](docs/ralph-loop.md) defines the fresh-context autonomous
  development workflow.

## Commands

```bash
yarn generate:games     # discover game workspaces and refresh generated artifacts
yarn dev                # generate + start Vite on port 1337
yarn lint               # check all authored code with zero warnings
yarn lint:fix           # apply supported ESLint fixes without formatting
yarn validate           # reproduce the complete continuous integration contract
yarn build              # generate + typecheck + production build
yarn storybook          # generate + run Storybook on port 6006
yarn build-storybook    # generate + build static Storybook
yarn generate:mamba-storybook --source /absolute/path/to/mamba-ui-source
```

## Workspace architecture

```text
.
├── games/
│   ├── floppy-bird/
│   ├── neon-drift/
│   └── orbital-stack/
├── packages/
│   └── game-contract/
├── public/generated/
│   └── games.manifest.json      # generated public catalog metadata
└── src/generated/
    └── game-import-map.ts       # generated typed dynamic import map
```

### Root app

- Hosts routing, landing page, Storybook, and shared UI.
- Fetches `/generated/games.manifest.json` at runtime for catalog metadata.
- Loads game code only after a game route opens.

### `packages/game-contract`

Shared strict runtime contract between the host and every game workspace:

- lifecycle: `start`, `pause`, `resume`, `dispose`
- score submission: `submitScore(...)`
- typed game events: phase, HUD, and announcement updates
- manifest typing shared by the generator, host UI, and workspaces

### `games/*`

Each game workspace owns:

- `package.json`
- `game.manifest.json`
- `src/index.ts`
- `assets/`

## Three.js ownership and deduplication

`three` belongs to each individual game workspace, not the root website.

- `games/floppy-bird/package.json` declares `three`
- `games/neon-drift/package.json` declares `three`
- `games/orbital-stack/package.json` declares `three`
- the root `package.json` does **not** declare `three`

This keeps game implementation details out of the host dependency graph while
still letting Yarn deduplicate compatible versions in `node_modules`. The root
currently carries `@types/three` for shared build typing; runtime Three.js
ownership remains with each game workspace.

## Runtime manifest schema

Each `game.manifest.json` must include:

```json
{
  "id": "floppy-bird",
  "title": "FloppyBird",
  "tagline": "Flap the disk. Beat the gates.",
  "description": "...",
  "accent": "#f59e0b",
  "secondaryAccent": "#22d3ee",
  "technology": "Three.js",
  "featured": true,
  "order": 1,
  "controls": [
    { "action": "Flap upward", "inputs": ["Spacebar", "Click", "Touch"] }
  ],
  "instructions": ["..."]
}
```

The generator validates these fields before writing any artifacts.

## Generator workflow

`yarn generate:games` scans `games/*` for workspace `package.json` files with a
`gameHub` block:

```json
{
  "gameHub": {
    "manifest": "./game.manifest.json",
    "entry": "./src/index.ts"
  }
}
```

The generator emits two committed artifacts:

1. `public/generated/games.manifest.json` — runtime catalog metadata fetched by
   the browser in development and production.
2. `src/generated/game-import-map.ts` — a typed, statically analyzable dynamic
   import map for Vite.

Root dev, build, and Storybook commands run the generator automatically.

## Runtime loading flow

1. The browser loads the root website bundle.
2. The app fetches `/generated/games.manifest.json` for landing-page and
   details-page metadata.
3. Opening `/games/<id>` uses `src/generated/game-import-map.ts` to lazy-load
   the matching workspace source.
4. Vite emits separate lazy chunks per game workspace.
5. If Vite extracts a shared Three.js vendor chunk, it is still only requested
   after a game route opens.

Result: game code and Three.js stay out of the landing-page startup bundle.

## Creating a new game workspace

1. Create `games/<slug>/`.
2. Add a `package.json` with:
   - a unique workspace package name
   - `@game-hub/game-contract` as a workspace dependency
   - `three` as a direct dependency if the game renders with Three.js
   - a `gameHub` block pointing to the manifest and source entry
3. Add `game.manifest.json`.
4. Implement `src/index.ts` that exports:
   - `manifest`
   - `createGame(canvas, host)`
5. Add generated or source-controlled assets under `assets/` if needed.
6. Run `yarn generate:games`.
7. Validate with `yarn build` and `yarn build-storybook`.

No root catalog edit is required—the generator discovers the workspace.

## Storybook and the checked-in Mamba catalog

Storybook remains the official grounding surface for host UI and marketing
studies. The generated Mamba catalog under `src/storybook/mamba/generated` and
`src/stories/catalog/mamba` stays checked in.

Game-specific grounding stories live under `Game Hub/Games/*`.

## Azure deployment

The production app output is still `dist`. For Azure Static Web Apps use:

| Setting | Value |
| --- | --- |
| App location | `/` |
| API location | Leave empty |
| Output location | `dist` |
| Build command | `yarn build` |

`public/staticwebapp.config.json` continues to provide client-side routing
fallbacks and baseline security headers.

## Third-party software

Mamba UI is available under the MIT License. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
