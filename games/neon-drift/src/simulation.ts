import { stepSimulation, type RandomSource } from '@game-hub/game-contract';

export interface NeonDriftSimulationState {
  boostPulse: number;
  driftCombo: number;
  elapsedSeconds: number;
}

export interface NeonDriftSimulationInput {
  boost: boolean;
}

export function createNeonDriftSimulationState(): NeonDriftSimulationState {
  return {
    boostPulse: 0,
    driftCombo: 18,
    elapsedSeconds: 0,
  };
}

export function stepNeonDriftSimulation(
  state: Readonly<NeonDriftSimulationState>,
  input: Readonly<NeonDriftSimulationInput>,
  elapsedSeconds: number,
  random: RandomSource,
): NeonDriftSimulationState {
  return stepSimulation(state, input, elapsedSeconds, random, (current, context) => {
    const boostedCombo = context.input.boost ? Math.min(99, current.driftCombo + 7) : current.driftCombo;
    const boostedPulse = context.input.boost ? 1 : current.boostPulse;

    return {
      boostPulse: Math.max(0, boostedPulse - context.elapsedSeconds * 1.9),
      driftCombo: Math.max(12, boostedCombo - context.elapsedSeconds * 1.8),
      elapsedSeconds: current.elapsedSeconds + context.elapsedSeconds,
    };
  });
}
