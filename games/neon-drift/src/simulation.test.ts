// @vitest-environment node

import { createSeededRandomSource } from '@game-hub/game-contract';
import { describe, expect, it } from 'vitest';
import { createNeonDriftSimulationState, stepNeonDriftSimulation } from './simulation';

describe('Neon Drift simulation', () => {
  it('applies boost and decay deterministically from explicit elapsed time', () => {
    const random = createSeededRandomSource(28);
    const initialState = createNeonDriftSimulationState();
    const boostedState = stepNeonDriftSimulation(initialState, { boost: true }, 0, random);
    const decayedState = stepNeonDriftSimulation(boostedState, { boost: false }, 0.5, random);

    expect(boostedState).toEqual({
      boostPulse: 1,
      driftCombo: 25,
      elapsedSeconds: 0,
    });
    expect(decayedState.boostPulse).toBeCloseTo(0.05);
    expect(decayedState.driftCombo).toBeCloseTo(24.1);
    expect(decayedState.elapsedSeconds).toBe(0.5);
    expect(initialState).toEqual(createNeonDriftSimulationState());
  });

  it('clamps decayed values while preserving the full explicit elapsed time', () => {
    const state = stepNeonDriftSimulation(
      {
        boostPulse: 0.4,
        driftCombo: 13,
        elapsedSeconds: 2,
      },
      { boost: false },
      10,
      createSeededRandomSource(28),
    );

    expect(state).toEqual({
      boostPulse: 0,
      driftCombo: 12,
      elapsedSeconds: 12,
    });
  });

  it('repeats the same boost sequence without ambient timing or randomness', () => {
    const advance = () => {
      const random = createSeededRandomSource(90210);
      let state = createNeonDriftSimulationState();

      state = stepNeonDriftSimulation(state, { boost: false }, 0.016, random);
      state = stepNeonDriftSimulation(state, { boost: true }, 0, random);
      state = stepNeonDriftSimulation(state, { boost: false }, 0.034, random);
      return state;
    };

    expect(advance()).toEqual(advance());
  });
});
