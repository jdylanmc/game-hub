import type { GameHost, GameInstance, GameModule, GameScore } from '@game-hub/game-contract';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { gameFixture } from '../test/game-fixture';
import { GamePage } from './GamePage';

const loadGameModule = vi.hoisted(() => vi.fn<(gameId: string) => Promise<GameModule>>());

vi.mock('../generated/game-import-map', () => ({
  loadGameModule,
}));

beforeEach(() => {
  loadGameModule.mockReset();
});

describe('GamePage', () => {
  it('shows manifest loading and error states before a game is available', () => {
    const { rerender } = render(<GamePage catalogLoading requestedGameId="floppy-bird" />);

    expect(screen.getByText('Loading manifest')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Floppy Bird' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Loading Floppy Bird' })).toBeVisible();

    rerender(<GamePage catalogError="The catalog request failed." requestedGameId="floppy-bird" />);

    expect(screen.getByText('Manifest unavailable')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Game unavailable' })).toBeVisible();
    expect(screen.getByText('The catalog request failed.')).toBeVisible();
  });

  it('renders the ready game details and reports a submitted score visibly', async () => {
    let host: GameHost | undefined;
    const controller: GameInstance = {
      dispose: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      start: vi.fn(),
    };
    loadGameModule.mockResolvedValue({
      createGame: (_canvas, gameHost) => {
        host = gameHost;
        return controller;
      },
      manifest: gameFixture,
    });

    render(<GamePage game={gameFixture} requestedGameId={gameFixture.id} />);

    expect(screen.getByRole('heading', { level: 1, name: 'FloppyBird' })).toBeVisible();
    expect(screen.getByText('Three.js')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Runtime manifest' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Play by sight or by status text' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Advertisement' })).toBeVisible();
    await screen.findByRole('button', { name: 'Reset run' });

    const score: GameScore = {
      gameId: gameFixture.id,
      occurredAt: '2026-08-12T09:00:00.000Z',
      score: 12_345,
    };
    act(() => host?.submitScore(score));

    expect(screen.getByText('Final score recorded locally: 12,345')).toBeVisible();
  });
});
