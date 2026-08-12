// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createManualSimulationClock, createSeededRandomSource, sampleClock, stepSimulation } from './simulation';

describe('deterministic simulation primitives', () => {
  it('advances and samples an explicit clock without ambient timers', () => {
    const clock = createManualSimulationClock(1_000);

    expect(sampleClock(clock, null)).toEqual({ elapsedSeconds: 0, nowMilliseconds: 1_000 });

    clock.advanceBy(275);

    expect(sampleClock(clock, 1_000)).toEqual({ elapsedSeconds: 0.275, nowMilliseconds: 1_275 });
    expect(sampleClock(clock, 1_000, 0.05)).toEqual({ elapsedSeconds: 0.05, nowMilliseconds: 1_275 });
  });

  it('replays identical seeded random sequences within the unit interval', () => {
    const first = createSeededRandomSource(28);
    const second = createSeededRandomSource(28);
    const different = createSeededRandomSource(29);
    const firstSequence = Array.from({ length: 6 }, () => first.next());
    const secondSequence = Array.from({ length: 6 }, () => second.next());
    const differentSequence = Array.from({ length: 6 }, () => different.next());

    expect(firstSequence).toEqual(secondSequence);
    expect(firstSequence).not.toEqual(differentSequence);
    expect(firstSequence.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('steps state from explicit input, elapsed time, and randomness', () => {
    const random = createSeededRandomSource(90210);
    const initialState = { distance: 3, samples: [] as number[] };
    const nextState = stepSimulation(initialState, { velocity: 4 }, 0.5, random, (state, context) => ({
      distance: state.distance + context.input.velocity * context.elapsedSeconds,
      samples: [...state.samples, context.random.next()],
    }));

    expect(nextState).toEqual({
      distance: 5,
      samples: [0.2817299449816346],
    });
    expect(initialState).toEqual({ distance: 3, samples: [] });
  });

  it('rejects invalid time and seed inputs instead of hiding nondeterminism', () => {
    const clock = createManualSimulationClock(100);
    const random = createSeededRandomSource(1);

    clock.set(50);

    expect(() => sampleClock(clock, 100)).toThrow(/cannot move backwards/i);
    expect(() => createManualSimulationClock(Number.NaN)).toThrow(/finite non-negative/i);
    expect(() => createSeededRandomSource(1.5)).toThrow(/safe integer/i);
    expect(() => stepSimulation({}, {}, -0.1, random, () => ({}))).toThrow(/finite non-negative/i);
  });
});
