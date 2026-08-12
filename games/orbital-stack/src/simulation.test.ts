// @vitest-environment node

import { createSeededRandomSource } from '@game-hub/game-contract';
import { describe, expect, it } from 'vitest';
import { createOrbitalStackSimulationState, stepOrbitalStackSimulation } from './simulation';

describe('Orbital Stack simulation', () => {
  it('increments the stack deterministically from explicit plate input', () => {
    const initialState = createOrbitalStackSimulationState();
    const firstPlate = stepOrbitalStackSimulation(initialState, { addPlate: true }, 0, createSeededRandomSource(28));
    const elapsedState = stepOrbitalStackSimulation(firstPlate, { addPlate: false }, 0.5, createSeededRandomSource(28));

    expect(firstPlate).toEqual({
      elapsedSeconds: 0,
      stackHeight: 4,
    });
    expect(elapsedState).toEqual({
      elapsedSeconds: 0.5,
      stackHeight: 4,
    });
    expect(initialState).toEqual(createOrbitalStackSimulationState());
  });

  it('stops at the eighteen-plate maximum without consuming randomness', () => {
    let randomCalls = 0;
    const random = {
      next: () => {
        randomCalls += 1;
        return 0.5;
      },
    };
    let state = createOrbitalStackSimulationState();

    for (let index = 0; index < 20; index += 1) {
      state = stepOrbitalStackSimulation(state, { addPlate: true }, 0, random);
    }

    expect(state).toEqual({
      elapsedSeconds: 0,
      stackHeight: 18,
    });
    expect(randomCalls).toBe(0);
  });

  it('repeats the same explicit stack and time progression', () => {
    const advance = () => {
      const random = createSeededRandomSource(90210);
      let state = createOrbitalStackSimulationState();

      state = stepOrbitalStackSimulation(state, { addPlate: false }, 0.016, random);
      state = stepOrbitalStackSimulation(state, { addPlate: true }, 0, random);
      state = stepOrbitalStackSimulation(state, { addPlate: false }, 0.034, random);
      return state;
    };

    expect(advance()).toEqual(advance());
  });
});
