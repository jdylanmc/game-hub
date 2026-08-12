import { describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameHost, GameInstance, GameModule, GameScore } from './index';

describe('game contract', () => {
  it('supports typed lifecycle, event, and score behavior', () => {
    const events: GameEvent[] = [];
    const scores: GameScore[] = [];
    const host: GameHost = {
      emitEvent: (event) => events.push(event),
      submitScore: (score) => scores.push(score),
    };
    const dispose = vi.fn();
    const instance: GameInstance = {
      dispose,
      pause: vi.fn(),
      resume: vi.fn(),
      start() {
        host.emitEvent({ phase: 'running', type: 'phase' });
        host.submitScore({ gameId: 'contract-test', occurredAt: '2026-08-11T00:00:00.000Z', score: 42 });
      },
    };
    const module: GameModule = {
      createGame: () => instance,
      manifest: {
        accent: '#ffffff',
        controls: [],
        description: 'Contract fixture.',
        id: 'contract-test',
        instructions: [],
        order: 1,
        secondaryAccent: '#000000',
        tagline: 'Typed fixture.',
        technology: 'Three.js',
        title: 'Contract Test',
      },
    };

    const game = module.createGame(document.createElement('canvas'), host);
    game.start();
    game.dispose();

    expect(events).toEqual([{ phase: 'running', type: 'phase' }]);
    expect(scores).toEqual([{ gameId: 'contract-test', occurredAt: '2026-08-11T00:00:00.000Z', score: 42 }]);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
