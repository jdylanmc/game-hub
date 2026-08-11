# Game Hub

A static React and TypeScript website for small WebGL games. Each game has its
own page with placeholders for community posts, ratings, and leaderboards.

The interface uses adapted [Mamba UI](https://github.com/Microwawe/mamba-ui)
Tailwind component patterns. Mamba UI is a copy-and-customize component
collection, so it does not add a runtime package dependency. Shared primitives
live in `src/components/ui`.

## Local development

```bash
yarn install
yarn dev
```

The local site is available at `http://localhost:1337`.

Build the production site with:

```bash
yarn build
```

## Storybook

Run the component Storybook with:

```bash
yarn storybook
```

Storybook uses `http://localhost:6006` and does not change the main app port.

Build the static Storybook site with:

```bash
yarn build-storybook
```

The static Storybook output is written to `storybook-static`.

### Mamba snapshot catalog

Game Hub checks in a generated Mamba UI snapshot catalog that excludes the
upstream full-page templates and includes all 159 non-template variants across
41 component categories.

- Upstream source snapshot: Mamba UI `0.2.1`
- Upstream commit: `de03932581585acb38adb6039ce2cae7e57cd619`
- Upstream commit date: `2024-04-03T22:48:35+03:00`

Checked-in upstream source copies live in `src/storybook/mamba/source`.
Generated React-friendly renderings live in `src/storybook/mamba/generated`,
and the generated story modules live in `src/stories/catalog/mamba`.

Regenerate the catalog after updating the upstream checkout with:

```bash
yarn generate:mamba-storybook --source /absolute/path/to/mamba-ui-source
```

Angular bindings, loops, and theme tokens are resolved ahead of time. Stories
render as static visual snapshots, so interactive upstream behaviors remain
non-interactive in Storybook.

### Avatar and profile grounding

Curated Game Hub stories live under `Game Hub/Avatars & Profiles` and highlight
the domain surfaces where avatars matter most:

- avatar upload preview
- user profile
- leaderboard rows
- reviews
- game votes and ratings

`src/components/community/AvatarUploadPreview.tsx` validates image MIME types,
uses object URLs safely, revokes replaced or unmounted previews, and falls back
to player initials when no image is present.

### Advertising boundary

Curated advertising stories live under `Game Hub/Advertising` and document the
neutral placeholder slot used on the game details page.

- The visible label stays `Advertisement`
- The slot keeps stable mobile and desktop banner dimensions to avoid content
  shift around the WebGL canvas and community cards
- The current implementation is UI-only and intentionally does not load an ad
  network SDK

Future ad integrations should render inside the reserved inner shell provided by
`src/components/ads/AdvertisementPlacement.tsx` without changing the outer slot
height, label, or subdued container styling.

### Curated Storybook overlays

In addition to the full catalog, Storybook includes curated overlays that make
priority surfaces easier to review:

- `Game Hub/Advertising` shows game-details ad placement plus populated,
  loading, and empty/unavailable placeholder states
- `Game Hub/Community Forums` shows per-game topic lists, pinned and locked
  states, thread metadata, recent activity, author avatars, and a UI-only reply
  composer
- `Catalog/Mamba Highlights` surfaces review and navigation/menu components first
- `Game Hub/Marketing` shows how Hero, Call to Action, Feature, Gallery, Stats,
  Testimonial, and Pricing-style Mamba blocks can compose the eventual
  game-browsing homepage

## Adding a game

Games implement the interfaces in `src/game-contract.ts`. A game receives a
canvas and a host object, then reports completed scores through
`host.reportScore(...)`.

Add each game to `src/games/catalog.ts`. The initial games share a small WebGL
placeholder renderer in `src/games/webgl-demo.ts`.

## Azure deployment

The build output is `dist`. When creating an Azure Static Web Apps resource,
use these build settings:

| Setting | Value |
| --- | --- |
| App location | `/` |
| API location | Leave empty |
| Output location | `dist` |
| Build command | `yarn build` |

`public/staticwebapp.config.json` configures client-side route fallback and
basic security headers. An API location can be added later when the container
service is introduced.

## Third-party software

Mamba UI is available under the MIT License. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
