import type { GameManifest } from '@game-hub/game-contract';

export const gameFixture: GameManifest = {
  accent: '#f59e0b',
  controls: [
    { action: 'Flap upward', inputs: ['Spacebar', 'Pointer'] },
    { action: 'Pause', inputs: ['P'] },
    { action: 'Restart', inputs: ['R'] },
  ],
  description: 'Guide a disk through gates.',
  featured: true,
  id: 'floppy-bird',
  instructions: ['Clear every gate.', 'Pause whenever you need a break.'],
  order: 1,
  secondaryAccent: '#22d3ee',
  tagline: 'Flap the disk.',
  technology: 'Three.js',
  title: 'FloppyBird',
};

export const secondaryGameFixture: GameManifest = {
  ...gameFixture,
  accent: '#8b5cf6',
  featured: false,
  id: 'orbital-stack',
  order: 2,
  secondaryAccent: '#34d399',
  tagline: 'Build the orbit.',
  title: 'Orbital Stack',
};
