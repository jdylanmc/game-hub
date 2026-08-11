# Game Hub Architecture

Game Hub is a statically hosted React application with independently packaged
browser-game workspaces and a shared TypeScript integration contract. This
reference defines the repository's architectural boundaries, resolved
technology versions, and canonical documentation sources.

> **Audience:** Read this reference before planning or implementing a Game Hub
> change. Every Ralph Loop iteration reads it before selecting a story.

## Why the Architecture Uses Workspace Boundaries

The landing page must remain fast while the game catalog grows. Each game owns
its rendering code, assets, manifest, and Three.js dependency in a Yarn
workspace. The host loads a game only after the user opens its route.

The `@game-hub/game-contract` workspace keeps host integration consistent across
games. It defines lifecycle, score submission, and event types without coupling
the website to a game's rendering implementation.

Build-generated discovery keeps the catalog extensible without runtime code
scanning. A generator reads workspace metadata and emits one public manifest
plus one statically analyzable Vite import map.

## System Boundaries

| Boundary | Location | Responsibility |
| --- | --- | --- |
| Static host | `src/` | Landing page, routing, shared UI, catalog display, and game mounting |
| Game workspaces | `games/*/` | Game rendering, input, assets, manifests, and score production |
| Integration contract | `packages/game-contract/` | Typed lifecycle, score, and event boundary |
| Discovery generator | `scripts/generate-game-workspaces.mjs` | Validate workspaces and generate catalog artifacts |
| Runtime catalog | `public/generated/games.manifest.json` | Public game metadata fetched by the browser |
| Lazy import map | `src/generated/game-import-map.ts` | Vite-analyzable dynamic game imports |
| Component grounding | `.storybook/`, `src/stories/`, `src/storybook/` | Shared component and composition development |
| Static hosting config | `public/staticwebapp.config.json` | Azure Static Web Apps routing and security headers |
| Azure infrastructure | `infra/` when introduced | Idempotent Bicep resources and environment parameter files |
| Autonomous development | `.github/skills/ralph-loop/`, `docs/memories/`, sibling issue worktrees | Fresh-context issue execution, parallel-safe orchestration, and persistent state |

The planned containerized application programming interface (API) remains
outside the current runtime. Introduce its workspace, container boundary, and
deployment contract when an issue requires server behavior.

## Pinned Runtime and Toolchain Versions

`package.json` defines direct dependency constraints. `yarn.lock` pins the exact
resolved dependency graph used by builds. Update this table in the same pull
request whenever a core resolved version changes.

| Technology | Pinned or resolved version | Repository role | Documentation |
| --- | --- | --- | --- |
| Node.js | `24.13.0` | Script, generator, TypeScript, Vite, and Storybook runtime | [Node.js v24 API](https://nodejs.org/docs/latest-v24.x/api/) |
| Yarn | `4.17.1` | Workspace and dependency manager | [Yarn documentation](https://yarnpkg.com/getting-started) |
| TypeScript | `5.9.3` | Static types and project builds | [TypeScript documentation](https://www.typescriptlang.org/docs/) |
| React | `18.3.1` | Host website component model | [React documentation](https://react.dev/) |
| React DOM | `18.3.1` | Browser rendering for React | [React DOM APIs](https://react.dev/reference/react-dom) |
| Vite | `7.3.6` | Development server, lazy chunking, and production bundling | [Vite guide](https://vite.dev/guide/) |
| Tailwind CSS | `3.4.19` | Utility-first website and Storybook styling | [Tailwind CSS v3 documentation](https://v3.tailwindcss.com/docs/installation) |
| Storybook | `10.5.7` | Component, composition, and accessibility grounding | [Storybook documentation](https://storybook.js.org/docs) |
| Three.js | `0.179.1` | Per-game WebGL rendering dependency | [Three.js documentation](https://threejs.org/docs/) and [r179 source](https://github.com/mrdoob/three.js/tree/r179) |
| PostCSS | `8.5.26` | Resolved CSS transformation runtime | [PostCSS documentation](https://postcss.org/) |
| Autoprefixer | `10.5.4` | Resolved browser-prefix generation | [Autoprefixer documentation](https://github.com/postcss/autoprefixer#readme) |

The repository pins Node.js in `.node-version` and `package.json`, pins Yarn in
`packageManager`, and pins the full JavaScript dependency graph in `yarn.lock`.
Do not infer versions from a globally installed tool when these files specify a
version.

## Supporting Packages

| Package | Resolved version | Purpose | Documentation |
| --- | --- | --- | --- |
| `@storybook/react-vite` | `10.5.7` | Storybook framework adapter | [React with Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite) |
| `@storybook/addon-a11y` | `10.5.7` | Story accessibility checks | [Accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing) |
| `@tailwindcss/forms` | `0.5.11` | Form-control normalization | [Forms plugin](https://github.com/tailwindlabs/tailwindcss-forms#readme) |
| `@tailwindcss/typography` | `0.5.20` | Prose styling | [Typography plugin](https://github.com/tailwindlabs/tailwindcss-typography#readme) |
| `@types/react` | `18.3.20` | React TypeScript declarations | [DefinitelyTyped package](https://www.npmjs.com/package/@types/react) |
| `@types/react-dom` | `18.3.5` | React DOM TypeScript declarations | [DefinitelyTyped package](https://www.npmjs.com/package/@types/react-dom) |
| `@types/three` | `0.185.4` | Three.js TypeScript declarations used by the root build | [DefinitelyTyped package](https://www.npmjs.com/package/@types/three) |
| `@azure/identity` | `4.13.1` | Microsoft Entra ID authentication for the Azure adversarial reviewer engine | [Azure Identity for JavaScript](https://learn.microsoft.com/javascript/api/overview/azure/identity-readme) |

Keep Three.js itself declared by each game workspace. Do not move it into the
root website dependency list.

## Build and Runtime Decisions

### The browser target is ES2022

`vite.config.ts` sets `build.target` to `es2022`. Use browser APIs and syntax
that Vite can emit for this target, or add an explicit compatibility decision
before lowering the target.

### Local development uses port 1337

Vite uses port `1337` with `strictPort: true`. Automation must fail when the port
is occupied; it must not silently select another port.

### Games load after route navigation

The host fetches catalog metadata at runtime, then resolves the selected game
through `src/generated/game-import-map.ts`. Preserve dynamic imports so game and
Three.js chunks stay outside the landing-page startup bundle.

### Generated catalog files are committed

Run `yarn generate:games` after adding a game or changing workspace discovery
metadata. Commit both generated outputs:

- `public/generated/games.manifest.json`
- `src/generated/game-import-map.ts`

### Azure Static Web Apps hosts the static output

`yarn build` writes the production site to `dist/`.
`public/staticwebapp.config.json` provides the single-page application fallback
and baseline response headers. Azure Static Web Apps is a managed service, so
the repository does not pin a service runtime or client software development
kit (SDK) version.

Read the [Azure Static Web Apps documentation](https://learn.microsoft.com/azure/static-web-apps/)
before changing deployment behavior.

### Adversarial review runs only after deterministic CI

The model-backed review workflow is triggered by the completed canonical
continuous integration (CI) workflow, not directly by pull-request code.
GitHub loads the workflow from protected `main`; both jobs explicitly check out
that protected commit. Pull-request Git objects are fetched without checkout
and are consumed only by the bounded untrusted-data collector.

Three deterministic concurrency lanes cap shared model work at three active
reviews. A successful deterministic result, current exact head SHA, promoted
calibration, protected-environment OpenID Connect identity, restricted Azure
endpoint, and revalidated structured output are mandatory before publication.
The downstream model check never replaces the deterministic CI check.

### Azure infrastructure uses Bicep

Define every Azure resource through idempotent
[Bicep](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)
declarations. Reapplying the same template and environment parameters must
converge on the intended state without creating duplicate resources or requiring
manual cleanup.

Store environment-specific values in committed Bicep parameter or configuration
files. Keep credentials and secret values in an approved secret store and pass
them at deployment time; do not commit them in environment files.

The first infrastructure change must pin the Bicep CLI version used by local and
continuous integration (CI) deployments. Update that pin through a reviewed
dependency change, not an implicit workstation or hosted-agent upgrade.

Target Azure subscription
`11213dbd-39fe-46ba-87db-5f5e8c449aed` unless a future architecture decision
defines another subscription for a specific environment. Deployment automation
must select the subscription explicitly before previewing or applying changes.

## Architectural Invariants

1. **The root website does not own game rendering dependencies.** Each game
   declares Three.js or another rendering library directly.
2. **Every trusted game integrates through `@game-hub/game-contract`.** Host and
   game code do not create private lifecycle or score channels.
3. **The landing bundle excludes game implementations.** Route navigation
   triggers game code loading.
4. **Workspace manifests drive discovery.** Do not maintain a second handwritten
   game catalog.
5. **Every Yarn workspace contains an `AGENTS.md`.** Ralph reads the relevant
   workspace contract before editing it.
6. **GitHub Issues define product scope.** Ralph memory tracks execution without
   replacing issue requirements.
7. **The static host and future API remain separate deployable boundaries.**
   Browser code must not assume same-process access to future server code.
8. **Azure infrastructure is idempotent and declarative.** Use Bicep with
   environment-specific parameter or configuration files; do not create
   long-lived Azure resources through undocumented imperative commands.
9. **Autonomous issue work is isolated by branch and worktree.** Every Ralph
   issue uses `ralph/issue-<number>-<slug>` in the deterministic sibling path
   `<repository>-worktrees/issue-<number>`; concurrent loops must declare
   non-overlapping change scopes and have no unmet issue dependencies.
10. **Orchestration status is transition-driven and rate-limited.** Meaningful
    loop, story, publication, continuous-integration, blocker, and completion
    transitions emit coalesced reports; unchanged polling is silent except for
    a longer periodic heartbeat.
11. **Concurrent GitHub identity is process-local.** Ralph resolves the
    repository owner's credential without changing GitHub CLI global state and
    binds each orchestrator and child runner through its own `GH_TOKEN`
    environment.

## Version Update Procedure

When an issue requires a core technology update:

1. Update the direct constraint in the owning `package.json`.
2. Run `yarn install` to update `yarn.lock`.
3. Update the resolved version in this reference.
4. Read the upstream migration and release notes.
5. Run the repository's type, build, lint, test, Storybook, and browser checks
   that apply.
6. Verify the landing bundle still excludes game code.

## See Also

- [Ralph Loop](ralph-loop.md)
- [Root Agent Guide](../AGENTS.md)
- [Game Contract Agent Guide](../packages/game-contract/AGENTS.md)
- [Game Hub README](../README.md)
