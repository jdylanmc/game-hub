import { useEffect, useState } from 'react';
import type { GameControl, GameManifestIndex, GameManifest } from '@game-hub/game-contract';

const gameCatalogUrl = '/generated/games.manifest.json';

export type GameCatalogState =
  | {
      status: 'loading';
    }
  | {
      status: 'error';
      error: string;
    }
  | {
      status: 'ready';
      games: GameManifest[];
    };

let catalogPromise: Promise<GameManifest[]> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }

  return value;
}

function parseNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }

  return value;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`);
  }

  return value;
}

function parseStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  return value.map((entry, index) => parseString(entry, `${path}[${index}]`));
}

function parseControl(value: unknown, path: string): GameControl {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  return {
    action: parseString(value.action, `${path}.action`),
    inputs: parseStringArray(value.inputs, `${path}.inputs`),
  };
}

function parseManifest(value: unknown, path: string): GameManifest {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object.`);
  }

  const technology = parseString(value.technology, `${path}.technology`);

  if (technology !== 'Three.js') {
    throw new Error(`${path}.technology must be "Three.js".`);
  }

  return {
    accent: parseString(value.accent, `${path}.accent`),
    controls: Array.isArray(value.controls)
      ? value.controls.map((entry, index) => parseControl(entry, `${path}.controls[${index}]`))
      : (() => {
          throw new Error(`${path}.controls must be an array.`);
        })(),
    description: parseString(value.description, `${path}.description`),
    featured: typeof value.featured === 'undefined' ? undefined : parseBoolean(value.featured, `${path}.featured`),
    id: parseString(value.id, `${path}.id`),
    instructions: parseStringArray(value.instructions, `${path}.instructions`),
    order: parseNumber(value.order, `${path}.order`),
    secondaryAccent: parseString(value.secondaryAccent, `${path}.secondaryAccent`),
    tagline: parseString(value.tagline, `${path}.tagline`),
    technology,
    title: parseString(value.title, `${path}.title`),
  };
}

function parseCatalogIndex(value: unknown): GameManifestIndex {
  if (!isRecord(value) || !Array.isArray(value.games)) {
    throw new Error('The game catalog must contain a top-level games array.');
  }

  return {
    games: value.games.map((entry, index) => parseManifest(entry, `games[${index}]`)),
  };
}

export async function loadGameCatalog(): Promise<GameManifest[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(gameCatalogUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The game catalog request failed with ${response.status} ${response.statusText}.`);
        }

        return parseCatalogIndex(await response.json()).games;
      })
      .catch((error) => {
        catalogPromise = undefined;
        throw error;
      });
  }

  return catalogPromise;
}

export function useGameCatalog(): GameCatalogState {
  const [state, setState] = useState<GameCatalogState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    void loadGameCatalog()
      .then((games) => {
        if (!active) {
          return;
        }

        setState({ games, status: 'ready' });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setState({
          error: error instanceof Error ? error.message : 'The game catalog could not be loaded.',
          status: 'error',
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function findGame(games: GameManifest[], gameId: string): GameManifest | undefined {
  return games.find((game) => game.id === gameId);
}

export function formatGameId(gameId: string): string {
  return gameId
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}
