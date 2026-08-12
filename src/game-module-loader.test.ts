import type { GameModule } from '@game-hub/game-contract';
import { describe, expect, it, vi } from 'vitest';

import { createGameModuleLoader } from './game-module-loader';

describe('game module loader', () => {
  it('rejects unknown games with the available identifiers', async () => {
    const loader = createGameModuleLoader(['alpha', 'beta'] as const, {
      alpha: vi.fn<() => Promise<GameModule>>(),
      beta: vi.fn<() => Promise<GameModule>>(),
    });

    await expect(loader.loadGameModule('missing-game')).rejects.toThrow(
      'Unknown game id "missing-game". Registered game ids: alpha, beta.',
    );
  });

  it('wraps dynamic import failures with the requested game identifier and cause', async () => {
    const importFailure = new Error('fixture chunk unavailable');
    const importGame = vi.fn<() => Promise<GameModule>>().mockRejectedValue(importFailure);
    const loader = createGameModuleLoader(['fixture-game'] as const, {
      'fixture-game': importGame,
    });

    const error = await loader.loadGameModule('fixture-game').then(
      () => undefined,
      (loadError: unknown) => loadError,
    );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new TypeError('Expected the game module loader to reject with an Error.');
    }
    expect(importGame).toHaveBeenCalledOnce();
    expect(error.message).toBe('Failed to dynamically import game "fixture-game": fixture chunk unavailable');
    expect(error.cause).toBe(importFailure);
  });
});
