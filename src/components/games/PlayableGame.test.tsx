import type { GameHost, GameInstance, GameModule, GameScore } from '@game-hub/game-contract';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { gameFixture } from '../../test/game-fixture';
import { PlayableGame } from './PlayableGame';

const loadGameModule = vi.hoisted(() => vi.fn<(gameId: string) => Promise<GameModule>>());

vi.mock('../../generated/game-import-map', () => ({
  loadGameModule,
}));

function createRuntimeFixture() {
  let host: GameHost | undefined;
  const controller: GameInstance = {
    dispose: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
  };
  const module: GameModule = {
    createGame: (_canvas, gameHost) => {
      host = gameHost;
      return controller;
    },
    manifest: gameFixture,
  };

  return {
    controller,
    getHost: () => {
      if (!host) {
        throw new Error('The game host has not been created.');
      }
      return host;
    },
    module,
  };
}

beforeEach(() => {
  loadGameModule.mockReset();
});

describe('PlayableGame', () => {
  it('moves from loading through ready, running, and paused controls', async () => {
    const user = userEvent.setup();
    const runtime = createRuntimeFixture();
    let resolveModule: ((module: GameModule) => void) | undefined;
    loadGameModule.mockReturnValue(
      new Promise<GameModule>((resolve) => {
        resolveModule = resolve;
      }),
    );

    render(<PlayableGame game={gameFixture} onScore={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Loading FloppyBird' })).toBeVisible();
    expect(screen.getByText(/keeping Three.js out of the landing-page startup path/i)).toBeVisible();
    expect(screen.getByLabelText('FloppyBird gameplay canvas')).toBeVisible();

    await act(async () => {
      resolveModule?.(runtime.module);
      await Promise.resolve();
    });

    expect(await screen.findByRole('heading', { name: 'Ready to play' })).toBeVisible();
    expect(runtime.controller.start).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Reset run' })).toBeEnabled();

    act(() => runtime.getHost().emitEvent({ phase: 'running', type: 'phase' }));

    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Ready to play' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(runtime.controller.pause).toHaveBeenCalledOnce();

    act(() =>
      runtime.getHost().emitEvent({
        message: 'Paused at the next safe frame.',
        phase: 'paused',
        type: 'phase',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Paused' })).toBeVisible();
    expect(screen.getAllByText('Paused at the next safe frame.')).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Resume' })[0]);
    expect(runtime.controller.resume).toHaveBeenCalledOnce();
  });

  it('publishes HUD, announcement, score, game-over, and restart behavior', async () => {
    const user = userEvent.setup();
    const onScore = vi.fn<(score: GameScore) => void>();
    const runtime = createRuntimeFixture();
    loadGameModule.mockResolvedValue(runtime.module);

    render(<PlayableGame game={gameFixture} onScore={onScore} />);
    await screen.findByRole('button', { name: 'Reset run' });

    act(() => {
      runtime.getHost().emitEvent({
        detail: 'Speed 342 rpm',
        label: 'Gates cleared',
        score: 1_234,
        type: 'hud',
      });
      runtime.getHost().emitEvent({ message: 'One gate to go.', politeness: 'polite', type: 'announcement' });
    });

    expect(screen.getByRole('heading', { name: '1,234' })).toBeVisible();
    expect(screen.getByText('Gates cleared')).toBeVisible();
    expect(screen.getByText('Speed 342 rpm')).toBeVisible();
    expect(screen.getByText('One gate to go.')).toBeInTheDocument();

    const score: GameScore = {
      gameId: gameFixture.id,
      occurredAt: '2026-08-12T09:00:00.000Z',
      score: 1_234,
    };
    act(() => {
      runtime.getHost().submitScore(score);
      runtime.getHost().emitEvent({ message: 'Final gate missed.', phase: 'game-over', type: 'phase' });
    });

    expect(onScore).toHaveBeenCalledWith(score);
    expect(screen.getByRole('heading', { name: 'Run complete' })).toBeVisible();
    expect(screen.getAllByText('Final gate missed.')).toHaveLength(2);
    expect(screen.getAllByText('1,234')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Restart run' })[0]);

    await waitFor(() => expect(loadGameModule).toHaveBeenCalledTimes(2));
    expect(runtime.controller.dispose).toHaveBeenCalledOnce();
  });

  it('shows a loader failure and retries the workspace successfully', async () => {
    const user = userEvent.setup();
    const runtime = createRuntimeFixture();
    loadGameModule.mockRejectedValueOnce(new Error('Fixture chunk unavailable.')).mockResolvedValue(runtime.module);

    render(<PlayableGame game={gameFixture} onScore={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
    expect(screen.getByText('Fixture chunk unavailable.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Retry workspace' }));

    expect(await screen.findByRole('heading', { name: 'Ready to play' })).toBeVisible();
    expect(loadGameModule).toHaveBeenCalledTimes(2);
    expect(runtime.controller.start).toHaveBeenCalledOnce();
  });
});
