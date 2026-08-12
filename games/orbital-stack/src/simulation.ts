import { stepSimulation, type RandomSource } from '@game-hub/game-contract';

export interface OrbitalStackSimulationState {
  elapsedSeconds: number;
  stackHeight: number;
}

export interface OrbitalStackSimulationInput {
  addPlate: boolean;
}

export function createOrbitalStackSimulationState(): OrbitalStackSimulationState {
  return {
    elapsedSeconds: 0,
    stackHeight: 3,
  };
}

export function stepOrbitalStackSimulation(
  state: Readonly<OrbitalStackSimulationState>,
  input: Readonly<OrbitalStackSimulationInput>,
  elapsedSeconds: number,
  random: RandomSource,
): OrbitalStackSimulationState {
  return stepSimulation(state, input, elapsedSeconds, random, (current, context) => ({
    elapsedSeconds: current.elapsedSeconds + context.elapsedSeconds,
    stackHeight: context.input.addPlate ? Math.min(18, current.stackHeight + 1) : current.stackHeight,
  }));
}
