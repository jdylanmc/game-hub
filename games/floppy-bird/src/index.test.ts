import {
  createManualSimulationClock,
  createSeededRandomSource,
  type GameEvent,
  type GameScore,
  type RandomSource,
} from '@game-hub/game-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installAnimationFrameController } from '../../../src/test/boundaries';
import type { WebGLRendererDouble } from '../../../src/test/three-boundary';
import { createGame, manifest } from './index';
import type { FloppyBirdSimulationInput, FloppyBirdSimulationState } from './simulation';

interface SimulationStepRecord {
  elapsedSeconds: number;
  input: Readonly<FloppyBirdSimulationInput>;
  result: FloppyBirdSimulationState;
  state: Readonly<FloppyBirdSimulationState>;
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
    stepFloppyBirdSimulation(
      state: Readonly<FloppyBirdSimulationState>,
      input: Readonly<FloppyBirdSimulationInput>,
      elapsedSeconds: number,
      random: RandomSource,
    ) {
      const result = actual.stepFloppyBirdSimulation(state, input, elapsedSeconds, random);

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

function dispatchPointerFlap(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function dispatchSpace(target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space' }));
}

function createLifecycleHarness() {
  const frames = installAnimationFrameController();
  const canvas = document.createElement('canvas');
  const events: GameEvent[] = [];
  const scores: GameScore[] = [];
  const clock = createManualSimulationClock(1_000);
  const game = createGame(
    canvas,
    {
      emitEvent: (event) => events.push(event),
      submitScore: (score) => scores.push(score),
    },
    {
      clock,
      random: createSeededRandomSource(28),
      scoreOccurredAt: () => '2026-08-12T07:00:00.000Z',
    },
  );
  const renderer = threeState.renderers.at(-1);

  if (!renderer) {
    throw new Error('Expected FloppyBird to create a renderer.');
  }

  document.body.append(canvas);

  return { canvas, clock, events, frames, game, renderer, scores };
}

beforeEach(() => {
  simulationState.steps.length = 0;
  threeState.renderers.length = 0;
});

describe('FloppyBird manifest behavior', () => {
  it('declares stable host integration and accessible controls', () => {
    expect(manifest.id).toBe('floppy-bird');
    expect(manifest.technology).toBe('Three.js');
    expect(manifest.controls).toContainEqual({
      action: 'Flap upward',
      inputs: ['Spacebar', 'Click', 'Touch'],
    });
    expect(manifest.controls).toContainEqual({
      action: 'Pause or resume',
      inputs: ['Host controls'],
    });
    expect(
      manifest.instructions.some((instruction) => /host HUD and overlays stay in the DOM/i.test(instruction)),
    ).toBe(true);
  });
});

describe('FloppyBird lifecycle behavior', () => {
  it('freezes ready simulation, suppresses paused input, and resumes ready', () => {
    const { canvas, events, frames, game } = createLifecycleHarness();

    game.start();
    frames.runNext(1_050);
    game.pause();

    const stepsBeforeInput = simulationState.steps.length;
    const eventsBeforeInput = events.length;

    dispatchPointerFlap(canvas);
    dispatchSpace();

    expect(simulationState.steps).toHaveLength(stepsBeforeInput);
    expect(events).toHaveLength(eventsBeforeInput);

    frames.runNext(2_050);
    const pausedStep = simulationState.steps.at(-1);

    expect(pausedStep?.input.phase).toBe('paused');
    expect(pausedStep?.result).toEqual(pausedStep?.state);

    game.resume();
    frames.runNext(2_100);

    expect(phaseSequence(events)).toEqual(['ready', 'paused', 'ready']);
    expect(simulationState.steps.at(-1)).toMatchObject({
      elapsedSeconds: 0,
      input: { flap: false, phase: 'ready' },
    });

    game.dispose();
  });

  it('freezes running simulation and restores running without accepting paused flaps', () => {
    const { canvas, events, frames, game } = createLifecycleHarness();

    game.start();
    dispatchPointerFlap(canvas);
    frames.runNext(1_050);
    game.pause();

    const stepsBeforeInput = simulationState.steps.length;

    dispatchPointerFlap(canvas);
    dispatchSpace();
    expect(simulationState.steps).toHaveLength(stepsBeforeInput);

    frames.runNext(5_050);
    const pausedStep = simulationState.steps.at(-1);

    expect(pausedStep?.input.phase).toBe('paused');
    expect(pausedStep?.result).toEqual(pausedStep?.state);

    game.resume();
    frames.runNext(5_100);
    const resumedStep = simulationState.steps.at(-1);

    expect(phaseSequence(events)).toEqual(['ready', 'running', 'paused', 'running']);
    expect(resumedStep).toMatchObject({
      elapsedSeconds: 0,
      input: { flap: false, phase: 'running' },
    });

    frames.runNext(5_150);
    expect(simulationState.steps.at(-1)?.result).not.toEqual(resumedStep?.result);

    game.dispose();
  });

  it('emits lifecycle events and submits one deterministic final score across repeated terminal frames', () => {
    const { canvas, clock, events, frames, game, scores } = createLifecycleHarness();

    game.start();
    dispatchPointerFlap(canvas);
    clock.set(4_650);

    let timestamp = 1_050;

    while (scores.length === 0 && timestamp < 6_000) {
      frames.runNext(timestamp);
      timestamp += 50;
    }

    expect(scores).toEqual([
      {
        gameId: 'floppy-bird',
        metadata: {
          durationSeconds: 4,
          technology: 'Three.js',
        },
        occurredAt: '2026-08-12T07:00:00.000Z',
        score: 0,
      },
    ]);
    expect(phaseSequence(events)).toEqual(['ready', 'running', 'game-over']);
    expect(events).toContainEqual({
      message: 'Game over. Final score 0.',
      politeness: 'assertive',
      type: 'announcement',
    });

    const terminalEventCount = events.length;

    frames.runNext(timestamp);
    frames.runNext(timestamp + 50);
    frames.runNext(timestamp + 100);
    dispatchPointerFlap(canvas);
    dispatchSpace();
    game.pause();
    game.resume();

    expect(simulationState.steps.slice(-3).every((step) => step.input.phase === 'game-over')).toBe(true);
    expect(simulationState.steps.slice(-3).every((step) => step.result.collisionReason !== null)).toBe(true);
    expect(events).toHaveLength(terminalEventCount);
    expect(scores).toHaveLength(1);

    game.dispose();
  });

  it('disposes listeners and prevents stale animation, lifecycle events, input, or score submission', () => {
    const { canvas, events, frames, game, renderer, scores } = createLifecycleHarness();
    const removeCanvasListener = vi.spyOn(canvas, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');

    game.start();
    dispatchPointerFlap(canvas);

    const staleFrame = frames.peekNext();
    const eventCount = events.length;
    const renderCount = renderer.render.mock.calls.length;
    const requestCount = frames.request.mock.calls.length;

    game.dispose();
    game.dispose();

    expect(removeCanvasListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(frames.cancel).toHaveBeenCalledWith(staleFrame.id);
    expect(frames.pendingCount()).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledOnce();

    game.start();
    game.pause();
    game.resume();
    dispatchPointerFlap(canvas);
    dispatchSpace();
    staleFrame.callback(100_000);

    expect(events).toHaveLength(eventCount);
    expect(scores).toHaveLength(0);
    expect(renderer.render).toHaveBeenCalledTimes(renderCount);
    expect(frames.request).toHaveBeenCalledTimes(requestCount);
  });
});
