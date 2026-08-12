import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { gameFixture } from '../../test/game-fixture';
import { GameCard } from './GameCard';
import { GameControlsCard } from './GameControlsCard';
import { GameHudCard } from './GameHudCard';
import { GameManifestCard } from './GameManifestCard';

describe('game presentation components', () => {
  it('exposes a catalog card as a descriptive game link', () => {
    render(<GameCard featured game={gameFixture} index={0} />);

    const link = screen.getByRole('link', { name: /FloppyBird.*Open workspace/i });
    expect(link).toHaveAttribute('href', '/games/floppy-bird');
    expect(screen.getByText('Featured')).toBeVisible();
    expect(screen.getByText('01')).toBeVisible();
    expect(screen.getByText('Spacebar · Pointer')).toBeVisible();
    expect(screen.getByText('P')).toBeVisible();
    expect(screen.getByText('R')).toBeVisible();
  });

  it('renders manifest and control details as labelled sections', () => {
    render(
      <>
        <GameManifestCard game={gameFixture} />
        <GameControlsCard game={gameFixture} />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'Runtime manifest' })).toBeVisible();
    expect(screen.getByText('Three.js workspace')).toBeVisible();
    expect(screen.getByText('games/floppy-bird')).toBeVisible();
    expect(screen.getByText('Generator order').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByRole('heading', { name: 'Play by sight or by status text' })).toBeVisible();
    expect(screen.getByText('Clear every gate.')).toBeVisible();
    expect(screen.getByText('Pause whenever you need a break.')).toBeVisible();
  });

  it.each([
    ['ready', 'Ready'],
    ['running', 'Running'],
    ['paused', 'Paused'],
    ['game-over', 'Game over'],
  ] as const)('announces the %s HUD phase with the current score', (phase, label) => {
    render(
      <GameHudCard
        accent={gameFixture.accent}
        detail="Speed 342 rpm"
        label="Gates cleared"
        phase={phase}
        score={1_234}
      />,
    );

    expect(screen.getByRole('heading', { name: '1,234' })).toBeVisible();
    expect(screen.getByText('Gates cleared')).toBeVisible();
    expect(screen.getByText('Speed 342 rpm')).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
  });
});
