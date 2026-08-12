import {
  createManualSimulationClock,
  createSeededRandomSource,
  type GameEvent,
  type RandomSource,
} from '@game-hub/game-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installAnimationFrameController } from '../../../src/test/boundaries';
import type { WebGLRendererDouble } from '../../../src/test/three-boundary';
import { createGame } from './index';
import type { NeonDriftSimulationInput, NeonDriftSimulationState } from './simulation';

interface SimulationStepRecord {
  elapsedSeconds: number;
  input: Readonly<NeonDriftSimulationInput>;
  result: NeonDriftSimulationState;
  state: Readonly<NeonDriftSimulationState>;
}

const threeState = vi.hoisted(() => ({
  renderers: [] as WebGLRendererDouble[],
}));

const simulationState = vi.hoisted(() => ({
  steps: [] as SimulationStepRecord[],
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  const { createWebGLRendererConstructor } = await import('../../../src/test/three-boundary');

  return {
    ...actual,
    WebGLRenderer: createWebGLRendererConstructor((renderer) => threeState.renderers.push(renderer)),
  };
});

vi.mock('./simulation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./simulation')>();

  return {
    ...actual,
    stepNeonDriftSimulation(
      state: Readonly<NeonDriftSimulationState>,
      input: Readonly<NeonDriftSimulationInput>,
      elapsedSeconds: number,
      random: RandomSource,
    ) {
      const result = actual.stepNeonDriftSimulation(state, input, elapsedSeconds, random);

      simulationState.steps.push({
        elapsedSeconds,
        input: { ...input },
        result,
        state,
      });
      return result;
    },
  };
});

function phaseSequence(events: GameEvent[]): string[] {
  return events.filter((event) => event.type === 'phase').map((event) => event.phase);
}

function announcementSequence(events: GameEvent[]): string[] {
  return events.filter((event) => event.type === 'announcement').map((event) => event.message);
}

function dispatchBoost(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function createLifecycleHarness() {
  const frames = installAnimationFrameController();
  const canvas = document.createElement('canvas');
  const events: GameEvent[] = [];
  const clock = createManualSimulationClock();
  const game = createGame(
    canvas,
    {
      emitEvent: (event) => events.push(event),
      submitScore: vi.fn(),
    },
    {
      clock,
      random: createSeededRandomSource(28),
    },
  );
  const renderer = threeState.renderers.at(-1);

  if (!renderer) {
    throw new Error('Expected Neon Drift to create a renderer.');
  }

  document.body.append(canvas);

  return { canvas, events, frames, game, renderer };
}

beforeEach(() => {
  simulationState.steps.length = 0;
  threeState.renderers.length = 0;
});

describe('Neon Drift lifecycle behavior', () => {
  it('starts exactly one controlled animation loop with a zero-delta first frame', () => {
    const { frames, game, renderer } = createLifecycleHarness();

    expect(frames.pendingCount()).toBe(0);

    game.start();
    game.start();

    expect(frames.pendingCount()).toBe(1);
    expect(frames.request).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(simulationState.steps).toEqual([
      expect.objectContaining({
        elapsedSeconds: 0,
        input: { boost: false },
      }),
    ]);

    frames.runNext(50);

    expect(simulationState.steps.at(-1)?.elapsedSeconds).toBeCloseTo(0.05);
    expect(frames.pendingCount()).toBe(1);

    game.dispose();
  });

  it('pauses and resumes idempotently with one phase and announcement per transition', () => {
    const { canvas, events, frames, game } = createLifecycleHarness();

    game.start();
    frames.runNext(50);
    game.pause();
    game.pause();

    const stepsBeforePauseFrame = simulationState.steps.length;
    const eventsBeforePausedInput = events.length;

    dispatchBoost(canvas);
    frames.runNext(5_000);

    expect(simulationState.steps).toHaveLength(stepsBeforePauseFrame);
    expect(events).toHaveLength(eventsBeforePausedInput);

    game.resume();
    game.resume();
    frames.runNext(5_050);

    expect(phaseSequence(events)).toEqual(['running', 'paused', 'running']);
    expect(announcementSequence(events)).toEqual(['Neon Drift ready.', 'Neon Drift paused.', 'Neon Drift resumed.']);
    expect(simulationState.steps.at(-1)).toMatchObject({
      elapsedSeconds: 0,
      input: { boost: false },
    });

    dispatchBoost(canvas);

    expect(simulationState.steps.at(-1)).toMatchObject({
      elapsedSeconds: 0,
      input: { boost: true },
    });
    expect(announcementSequence(events).at(-1)).toBe('Boost pulse engaged.');

    game.dispose();
  });

  it('disposes input and animation resources once and blocks stale or public lifecycle work', () => {
    const { canvas, events, frames, game, renderer } = createLifecycleHarness();
    const removeCanvasListener = vi.spyOn(canvas, 'removeEventListener');

    game.start();

    const staleFrame = frames.peekNext();
    const eventCount = events.length;
    const renderCount = renderer.render.mock.calls.length;
    const requestCount = frames.request.mock.calls.length;
    const stepCount = simulationState.steps.length;

    game.dispose();
    game.dispose();

    expect(removeCanvasListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(frames.cancel).toHaveBeenCalledWith(staleFrame.id);
    expect(frames.pendingCount()).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledOnce();

    game.start();
    game.pause();
    game.resume();
    dispatchBoost(canvas);
    staleFrame.callback(100_000);

    expect(events).toHaveLength(eventCount);
    expect(renderer.render).toHaveBeenCalledTimes(renderCount);
    expect(frames.request).toHaveBeenCalledTimes(requestCount);
    expect(simulationState.steps).toHaveLength(stepCount);
  });
});
