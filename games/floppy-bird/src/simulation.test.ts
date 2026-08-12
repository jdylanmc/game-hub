// @vitest-environment node

import { createSeededRandomSource } from '@game-hub/game-contract';
import { describe, expect, it } from 'vitest';
import { createFloppyBirdSimulationState, stepFloppyBirdSimulation } from './simulation';

describe('FloppyBird flight physics', () => {
  it('uses explicit ready frames for deterministic idle motion', () => {
    const initialState = createFloppyBirdSimulationState();
    const random = createSeededRandomSource(28);
    const readyState = stepFloppyBirdSimulation(initialState, { flap: false, phase: 'ready' }, 0.05, random);

    expect(readyState.ambience).toBeCloseTo(0.05);
    expect(readyState.birdY).toBeCloseTo(Math.sin(0.05 * 2.4) * 0.45);
    expect(readyState.birdVelocity).toBe(0);
    expect(readyState.obstacles).toEqual(initialState.obstacles);
    expect(initialState).toEqual(createFloppyBirdSimulationState());
  });

  it('progresses explicitly from ready motion to flap, gravity, and position integration', () => {
    const random = createSeededRandomSource(28);
    const readyState = stepFloppyBirdSimulation(
      createFloppyBirdSimulationState(),
      { flap: false, phase: 'ready' },
      0.02,
      random,
    );
    const flappedState = stepFloppyBirdSimulation(readyState, { flap: true, phase: 'running' }, 0, random);
    const fallingState = stepFloppyBirdSimulation(flappedState, { flap: false, phase: 'running' }, 0.02, random);

    expect(flappedState.birdVelocity).toBe(7.4);
    expect(flappedState.birdY).toBe(readyState.birdY);
    expect(flappedState.ambience).toBe(readyState.ambience);
    expect(fallingState.birdVelocity).toBeCloseTo(6.99);
    expect(fallingState.birdY).toBeCloseTo(readyState.birdY + 0.1398);
  });

  it('clamps long frame deltas inside the pure simulation', () => {
    const initialState = createFloppyBirdSimulationState();
    const clampedFrame = stepFloppyBirdSimulation(
      initialState,
      { flap: false, phase: 'running' },
      0.05,
      createSeededRandomSource(28),
    );
    const delayedFrame = stepFloppyBirdSimulation(
      initialState,
      { flap: false, phase: 'running' },
      2,
      createSeededRandomSource(28),
    );

    expect(delayedFrame).toEqual(clampedFrame);
    expect(delayedFrame.birdVelocity).toBeCloseTo(-1.025);
    expect(delayedFrame.birdY).toBeCloseTo(-0.05125);
  });

  it('repeats explicit ready-to-running state advancement', () => {
    const advance = () => {
      const random = createSeededRandomSource(90210);
      let state = createFloppyBirdSimulationState();

      state = stepFloppyBirdSimulation(state, { flap: false, phase: 'ready' }, 0.02, random);
      state = stepFloppyBirdSimulation(state, { flap: true, phase: 'running' }, 0, random);
      state = stepFloppyBirdSimulation(state, { flap: false, phase: 'running' }, 0.016, random);
      return stepFloppyBirdSimulation(state, { flap: false, phase: 'running' }, 0.016, random);
    };

    expect(advance()).toEqual(advance());
  });
});
