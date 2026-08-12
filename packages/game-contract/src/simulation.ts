export interface SimulationClock {
  nowMilliseconds: () => number;
}

export interface ManualSimulationClock extends SimulationClock {
  advanceBy: (milliseconds: number) => number;
  set: (milliseconds: number) => void;
}

export interface RandomSource {
  next: () => number;
}

export interface SimulationStepContext<Input> {
  elapsedSeconds: number;
  input: Input;
  random: RandomSource;
}

export type SimulationReducer<State, Input> = (
  state: Readonly<State>,
  context: Readonly<SimulationStepContext<Input>>,
) => State;

export interface ClockSample {
  elapsedSeconds: number;
  nowMilliseconds: number;
}

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

export function createManualSimulationClock(initialMilliseconds = 0): ManualSimulationClock {
  requireNonNegativeFinite(initialMilliseconds, 'Initial clock time');
  let currentMilliseconds = initialMilliseconds;

  return {
    advanceBy(milliseconds) {
      requireNonNegativeFinite(milliseconds, 'Clock advance');
      currentMilliseconds += milliseconds;
      return currentMilliseconds;
    },
    nowMilliseconds() {
      return currentMilliseconds;
    },
    set(milliseconds) {
      requireNonNegativeFinite(milliseconds, 'Clock time');
      currentMilliseconds = milliseconds;
    },
  };
}

export function sampleClock(
  clock: SimulationClock,
  previousMilliseconds: number | null,
  maximumElapsedSeconds = Number.POSITIVE_INFINITY,
): ClockSample {
  const nowMilliseconds = clock.nowMilliseconds();
  requireNonNegativeFinite(nowMilliseconds, 'Clock time');

  if (
    maximumElapsedSeconds !== Number.POSITIVE_INFINITY &&
    (!Number.isFinite(maximumElapsedSeconds) || maximumElapsedSeconds < 0)
  ) {
    throw new RangeError('Maximum elapsed time must be a non-negative number.');
  }

  if (previousMilliseconds === null) {
    return { elapsedSeconds: 0, nowMilliseconds };
  }

  requireNonNegativeFinite(previousMilliseconds, 'Previous clock time');

  if (nowMilliseconds < previousMilliseconds) {
    throw new RangeError('Clock time cannot move backwards between samples.');
  }

  return {
    elapsedSeconds: Math.min((nowMilliseconds - previousMilliseconds) / 1000, maximumElapsedSeconds),
    nowMilliseconds,
  };
}

export function createSeededRandomSource(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('Random seed must be a safe integer.');
  }

  let state = seed >>> 0;

  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}

export function stepSimulation<State, Input>(
  state: Readonly<State>,
  input: Input,
  elapsedSeconds: number,
  random: RandomSource,
  reducer: SimulationReducer<State, Input>,
): State {
  requireNonNegativeFinite(elapsedSeconds, 'Elapsed simulation time');
  return reducer(state, { elapsedSeconds, input, random });
}
