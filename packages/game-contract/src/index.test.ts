import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createSubmitScoreOnce,
  type ControllerInputNormalizer,
  type GameEvent,
  type GameHost,
  type GameInstance,
  type GameManifest,
  type GameManifestIndex,
  type GameModule,
  type GamePhase,
  type GameScore,
} from './index';

const lifecyclePhases = ['ready', 'running', 'paused', 'game-over'] as const satisfies readonly GamePhase[];

const manifestFixture = {
  accent: '#ffffff',
  controls: [
    {
      action: 'Exercise the contract',
      inputs: ['Test fixture'],
    },
  ],
  description: 'Representative shared-contract fixture.',
  featured: true,
  id: 'contract-test',
  instructions: ['Drive the fixture through the public game lifecycle.'],
  order: 1,
  secondaryAccent: '#000000',
  tagline: 'Typed host and game boundaries.',
  technology: 'Three.js',
  title: 'Contract Test',
} satisfies GameManifest;

const manifestIndexFixture = {
  games: [manifestFixture],
} satisfies GameManifestIndex;

const scoreFixture = {
  gameId: manifestFixture.id,
  metadata: {
    durationSeconds: 12,
    flawless: true,
    technology: manifestFixture.technology,
  },
  occurredAt: '2026-08-12T08:00:00.000Z',
  score: 42,
} as const satisfies GameScore;

const eventFixtures = [
  { message: 'Ready for host input.', phase: 'ready', type: 'phase' },
  { phase: 'running', type: 'phase' },
  { message: 'Paused by the host.', phase: 'paused', type: 'phase' },
  { message: 'Run complete.', phase: 'game-over', type: 'phase' },
  {
    bestScore: 84,
    detail: 'Representative heads-up display payload.',
    label: 'Contract score',
    score: scoreFixture.score,
    type: 'hud',
  },
  { message: 'Run started.', politeness: 'polite', type: 'announcement' },
  { message: 'Run complete.', politeness: 'assertive', type: 'announcement' },
  { message: 'Default announcement behavior.', type: 'announcement' },
] as const satisfies readonly GameEvent[];

type RawControllerFixture = {
  readonly fixtureValue: unknown;
};

type NormalizedControllerFixture = {
  readonly fixtureValue: unknown;
};

function createHostHarness() {
  const events: GameEvent[] = [];
  const scores: GameScore[] = [];
  const host = {
    emitEvent: (event: GameEvent) => events.push(event),
    submitScore: (score: GameScore) => scores.push(score),
  } satisfies GameHost;

  return { events, host, scores };
}

function createModuleFixture(dispose: () => void) {
  const createGame = vi.fn((_canvas: HTMLCanvasElement, host: GameHost): GameInstance => {
    const submitScoreOnce = createSubmitScoreOnce(host);

    return {
      dispose,
      pause() {
        host.emitEvent(eventFixtures[2]);
      },
      resume() {
        host.emitEvent(eventFixtures[1]);
        host.emitEvent(eventFixtures[3]);
        host.emitEvent(eventFixtures[4]);
        host.emitEvent(eventFixtures[6]);
        submitScoreOnce(scoreFixture);
        submitScoreOnce({ ...scoreFixture, score: 999 });
      },
      start() {
        host.emitEvent(eventFixtures[0]);
        host.emitEvent(eventFixtures[1]);
        host.emitEvent(eventFixtures[4]);
        host.emitEvent(eventFixtures[5]);
        host.emitEvent(eventFixtures[7]);
      },
    };
  });
  const module = {
    createGame,
    manifest: manifestFixture,
  } satisfies GameModule;

  return { createGame, module };
}

describe('game contract', () => {
  it('keeps compile-time fixtures aligned with every shared boundary', () => {
    expectTypeOf(lifecyclePhases).toMatchTypeOf<readonly GamePhase[]>();
    expectTypeOf(manifestFixture).toMatchTypeOf<GameManifest>();
    expectTypeOf(manifestIndexFixture).toMatchTypeOf<GameManifestIndex>();
    expectTypeOf(scoreFixture).toMatchTypeOf<GameScore>();
    expectTypeOf(eventFixtures).toMatchTypeOf<readonly GameEvent[]>();
    expectTypeOf<ControllerInputNormalizer<RawControllerFixture, NormalizedControllerFixture>>().toEqualTypeOf<
      (input: Readonly<RawControllerFixture>) => NormalizedControllerFixture
    >();

    expect(lifecyclePhases).toEqual(['ready', 'running', 'paused', 'game-over']);
    expect(manifestIndexFixture.games).toEqual([manifestFixture]);
  });

  it('exercises every lifecycle phase and event variant through the public host-game interaction', () => {
    const canvas = document.createElement('canvas');
    const dispose = vi.fn();
    const { events, host, scores } = createHostHarness();
    const { createGame, module } = createModuleFixture(dispose);

    const game = module.createGame(canvas, host);

    game.start();
    game.pause();
    game.resume();
    game.dispose();

    expect(createGame).toHaveBeenCalledWith(canvas, host);
    expect(events.filter((event) => event.type === 'phase').map((event) => event.phase)).toEqual([
      'ready',
      'running',
      'paused',
      'running',
      'game-over',
    ]);
    expect(events.filter((event) => event.type === 'hud')).toEqual([eventFixtures[4], eventFixtures[4]]);
    expect(events.filter((event) => event.type === 'announcement')).toEqual([
      eventFixtures[5],
      eventFixtures[7],
      eventFixtures[6],
    ]);
    expect(scores).toEqual([scoreFixture]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('submits the first complete score payload exactly once through GameHost', () => {
    const { host, scores } = createHostHarness();
    const submitScoreOnce = createSubmitScoreOnce(host);

    expect(submitScoreOnce(scoreFixture)).toBe(true);
    expect(submitScoreOnce({ ...scoreFixture, score: 999 })).toBe(false);

    expect(scores).toEqual([scoreFixture]);
  });
});
