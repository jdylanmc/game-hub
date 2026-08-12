// @vitest-environment node

import { createSeededRandomSource } from '@game-hub/game-contract';
import { describe, expect, it } from 'vitest';
import {
  createFloppyBirdSimulationState,
  flightSpeedForScore,
  FLOPPY_BIRD_LAYOUT,
  stepFloppyBirdSimulation,
  type FloppyBirdObstacleState,
  type FloppyBirdSimulationState,
} from './simulation';

const RUNNING_INPUT = { flap: false, phase: 'running' } as const;

function stepRunning(
  state: Readonly<FloppyBirdSimulationState>,
  elapsedSeconds = 0,
  seed = 28,
): FloppyBirdSimulationState {
  return stepFloppyBirdSimulation(state, RUNNING_INPUT, elapsedSeconds, createSeededRandomSource(seed));
}

function createCollisionState(birdY: number, obstacles: FloppyBirdObstacleState[]): FloppyBirdSimulationState {
  const initialState = createFloppyBirdSimulationState();

  return {
    ...initialState,
    birdY,
    highestObstacleX: obstacles.length > 0 ? Math.max(...obstacles.map((obstacle) => obstacle.x)) : 0,
    obstacles,
  };
}

function createGate(overrides: Partial<FloppyBirdObstacleState> = {}): FloppyBirdObstacleState {
  return {
    colorIndex: 0,
    gapHeight: 5.8,
    gapY: 0,
    scored: false,
    x: FLOPPY_BIRD_LAYOUT.birdX,
    ...overrides,
  };
}

function collectRecycledObstacles(seed: number): FloppyBirdObstacleState[] {
  const random = createSeededRandomSource(seed);
  let state = createFloppyBirdSimulationState();
  const sequence: FloppyBirdObstacleState[] = [];

  for (let index = 0; index < 6; index += 1) {
    const obstacles = state.obstacles.map((obstacle, obstacleIndex) => ({
      ...obstacle,
      scored: obstacleIndex === 0,
      x: obstacleIndex === 0 ? -19 : 9 + obstacleIndex * 8.8,
    }));

    state = stepFloppyBirdSimulation(
      {
        ...state,
        birdVelocity: 0,
        birdY: 0,
        highestObstacleX: Math.max(...obstacles.map((obstacle) => obstacle.x)),
        obstacles,
        score: 0,
      },
      RUNNING_INPUT,
      0.05,
      random,
    );
    sequence.push({ ...state.obstacles[0] });
  }

  return sequence;
}

function recycleAtScore(score: number): {
  gapHeight: number;
  spacing: number;
} {
  const initialState = createFloppyBirdSimulationState();
  const obstacles = [
    createGate({ scored: true, x: -19 }),
    createGate({ x: 0 }),
    createGate({ x: 8 }),
    createGate({ x: 16 }),
  ];
  const nextState = stepRunning(
    {
      ...initialState,
      highestObstacleX: 16,
      obstacles,
      score,
    },
    0.05,
  );
  const recycledObstacle = nextState.obstacles[0];
  const highestUnrecycledX = Math.max(...nextState.obstacles.slice(1).map((obstacle) => obstacle.x));

  return {
    gapHeight: recycledObstacle.gapHeight,
    spacing: recycledObstacle.x - highestUnrecycledX,
  };
}

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

describe('FloppyBird obstacles and scoring', () => {
  it('recycles obstacles into repeatable seeded sequences with bounded layouts', () => {
    const firstSequence = collectRecycledObstacles(28);
    const repeatedSequence = collectRecycledObstacles(28);
    const seededSequences = [1, 28, 90210, Number.MAX_SAFE_INTEGER].map(collectRecycledObstacles);

    expect(repeatedSequence).toEqual(firstSequence);
    expect(new Set(seededSequences.map((sequence) => JSON.stringify(sequence))).size).toBeGreaterThan(1);

    for (const sequence of seededSequences) {
      for (const obstacle of sequence) {
        expect(obstacle.colorIndex).toBeGreaterThanOrEqual(0);
        expect(obstacle.colorIndex).toBeLessThan(5);
        expect(obstacle.gapHeight).toBe(5.8);
        expect(obstacle.gapY).toBeGreaterThanOrEqual(-3.8);
        expect(obstacle.gapY).toBeLessThanOrEqual(3.8);
        expect(obstacle.scored).toBe(false);
        expect(obstacle.x).toBeGreaterThan(35);
      }
    }
  });

  it.each([
    { collisionY: 8.65, safeY: 8.649 },
    { collisionY: -8.65, safeY: -8.649 },
  ])('collides at the playfield boundary while preserving nearby safe flight', ({ collisionY, safeY }) => {
    expect(stepRunning(createCollisionState(safeY, [])).collisionReason).toBeNull();
    expect(stepRunning(createCollisionState(collisionY, [])).collisionReason).toMatch(/boundary/i);
  });

  it('allows a gate-edge passage but collides immediately outside the opening', () => {
    const gateEdgeY = 5.8 / 2 - FLOPPY_BIRD_LAYOUT.birdRadius;
    const safePassage = stepRunning(createCollisionState(gateEdgeY, [createGate()]));
    const gateCollision = stepRunning(createCollisionState(gateEdgeY + 0.001, [createGate()]));

    expect(safePassage.collisionReason).toBeNull();
    expect(gateCollision.collisionReason).toMatch(/gate/i);
  });

  it('scores a passed gate only once', () => {
    const initialState = createCollisionState(0, [createGate({ x: -7.59 })]);
    const scoredState = stepRunning(initialState, 0.01);
    const laterState = stepRunning(scoredState, 0.05);

    expect(scoredState.score).toBe(1);
    expect(scoredState.obstacles[0].scored).toBe(true);
    expect(laterState.score).toBe(1);
    expect(laterState.obstacles[0].scored).toBe(true);
    expect(initialState.score).toBe(0);
    expect(initialState.obstacles[0].scored).toBe(false);
  });

  it.each([
    { gapHeight: 5.8, score: 0, spacing: 8.8, speed: 7.2 },
    { gapHeight: 5.075, score: 12, spacing: 7.95, speed: 8.9 },
    { gapHeight: 4.35, score: 24, spacing: 7.1, speed: 10.6 },
    { gapHeight: 4.35, score: 240, spacing: 7.1, speed: 10.6 },
  ])(
    'applies score $score difficulty through the speed, gap, and spacing caps',
    ({ gapHeight, score, spacing, speed }) => {
      const recycled = recycleAtScore(score);

      expect(flightSpeedForScore(score)).toBeCloseTo(speed);
      expect(recycled.gapHeight).toBeCloseTo(gapHeight);
      expect(recycled.spacing).toBeCloseTo(spacing);
    },
  );
});

describe('FloppyBird lifecycle simulation', () => {
  it.each(['paused', 'game-over'] as const)('freezes every simulation field during the %s phase', (phase) => {
    const state: FloppyBirdSimulationState = {
      ...createFloppyBirdSimulationState(),
      ambience: 3,
      birdVelocity: -4,
      birdY: 2,
      collisionReason: 'Terminal collision.',
      score: 7,
      wingBeat: 0.8,
    };
    let randomCalls = 0;
    const random = {
      next: () => {
        randomCalls += 1;
        return 0.5;
      },
    };
    const nextState = stepFloppyBirdSimulation(state, { flap: true, phase }, 10, random);

    expect(nextState).toEqual(state);
    expect(nextState).not.toBe(state);
    expect(nextState.obstacles).not.toBe(state.obstacles);
    expect(randomCalls).toBe(0);
  });
});
