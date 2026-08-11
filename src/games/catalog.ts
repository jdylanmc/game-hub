import type { GameDefinition } from '../game-contract';
import { createDemoGame } from './webgl-demo';

export const games: GameDefinition[] = [
  createDemoGame({
    id: 'neon-drift',
    title: 'Neon Drift',
    tagline: 'Thread the light.',
    description:
      'A future reflex game about speed, precision, and chasing a cleaner line.',
    accent: '#60a5fa',
    secondaryAccent: '#22d3ee',
    rotationDirection: 1,
  }),
  createDemoGame({
    id: 'orbital-stack',
    title: 'Orbital Stack',
    tagline: 'Build beyond gravity.',
    description:
      'A cosmic stacking challenge where every placement changes the orbit.',
    accent: '#c084fc',
    secondaryAccent: '#f472b6',
    rotationDirection: -1,
  }),
];

export function getGame(gameId: string): GameDefinition | undefined {
  return games.find((game) => game.id === gameId);
}
