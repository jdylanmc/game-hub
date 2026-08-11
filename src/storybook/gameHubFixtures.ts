import type { GameManifest } from '@game-hub/game-contract';
import floppyBirdManifestData from '../../games/floppy-bird/game.manifest.json';
import neonDriftManifestData from '../../games/neon-drift/game.manifest.json';
import orbitalStackManifestData from '../../games/orbital-stack/game.manifest.json';

const manifests = [
  floppyBirdManifestData,
  neonDriftManifestData,
  orbitalStackManifestData,
] as GameManifest[];

export const storybookGames = [...manifests].sort(
  (left, right) =>
    Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
    left.order - right.order ||
    left.title.localeCompare(right.title),
);

export const featuredStorybookGame = storybookGames[0];
