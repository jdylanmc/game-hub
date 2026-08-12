import { stepSimulation, type RandomSource } from '@game-hub/game-contract';

const PLAYFIELD_TOP = 9.5;
const PLAYFIELD_BOTTOM = -9.5;
const BIRD_X = -6.4;
const BIRD_RADIUS = 0.85;
const FLAP_VELOCITY = 7.4;
const GRAVITY = 20.5;
const MAX_FRAME_DELTA_SECONDS = 0.05;
const BASE_SPEED = 7.2;
const MAX_SPEED = 10.6;
const BASE_GAP = 5.8;
const MIN_GAP = 4.35;
const BASE_SPACING = 8.8;
const MIN_SPACING = 7.1;
const OBSTACLE_WIDTH = 2.4;
const GAP_PATTERN_Y = [-3.8, -2.3, -0.9, 0.9, 2.3, 3.8];
const INITIAL_GAP_SEQUENCE = [2, 4, 1, 5];
const INITIAL_STYLE_SEQUENCE = [0, 2, 1, 4];
const STYLE_COUNT = 5;

export const FLOPPY_BIRD_LAYOUT = {
  birdRadius: BIRD_RADIUS,
  birdX: BIRD_X,
  obstacleWidth: OBSTACLE_WIDTH,
  playfieldBottom: PLAYFIELD_BOTTOM,
  playfieldTop: PLAYFIELD_TOP,
} as const;

export type FloppyBirdSimulationPhase = 'ready' | 'running' | 'paused' | 'game-over';

export interface FloppyBirdObstacleState {
  colorIndex: number;
  gapHeight: number;
  gapY: number;
  scored: boolean;
  x: number;
}

export interface FloppyBirdSimulationState {
  ambience: number;
  birdVelocity: number;
  birdY: number;
  collisionReason: string | null;
  highestObstacleX: number;
  obstacles: FloppyBirdObstacleState[];
  previousGapIndex: number;
  previousStyleIndex: number;
  score: number;
  wingBeat: number;
}

export interface FloppyBirdSimulationInput {
  flap: boolean;
  phase: FloppyBirdSimulationPhase;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function difficultyForScore(score: number): number {
  return clamp(score / 24, 0, 1);
}

export function flightSpeedForScore(score: number): number {
  return lerp(BASE_SPEED, MAX_SPEED, difficultyForScore(score));
}

function obstacleGapForScore(score: number): number {
  return lerp(BASE_GAP, MIN_GAP, difficultyForScore(score));
}

function obstacleSpacingForScore(score: number): number {
  return lerp(BASE_SPACING, MIN_SPACING, difficultyForScore(score));
}

function randomIndex(candidates: number[], random: RandomSource): number {
  return candidates[Math.floor(random.next() * candidates.length)];
}

function nextGapIndex(previousGapIndex: number, random: RandomSource): number {
  let candidates = GAP_PATTERN_Y.map((_, index) => index).filter(
    (index) => index !== previousGapIndex && Math.abs(index - previousGapIndex) > 1,
  );

  if (candidates.length === 0) {
    candidates = GAP_PATTERN_Y.map((_, index) => index).filter((index) => index !== previousGapIndex);
  }

  return randomIndex(candidates, random);
}

function nextStyleIndex(previousStyleIndex: number, random: RandomSource): number {
  const candidates = Array.from({ length: STYLE_COUNT }, (_, index) => index).filter(
    (index) => index !== previousStyleIndex,
  );
  return randomIndex(candidates, random);
}

function detectCollision(birdY: number, obstacles: FloppyBirdObstacleState[]): string | null {
  if (birdY + BIRD_RADIUS >= PLAYFIELD_TOP || birdY - BIRD_RADIUS <= PLAYFIELD_BOTTOM) {
    return 'The floppy disk clipped the boundary.';
  }

  for (const obstacle of obstacles) {
    const overlapsX =
      BIRD_X + BIRD_RADIUS > obstacle.x - OBSTACLE_WIDTH / 2 && BIRD_X - BIRD_RADIUS < obstacle.x + OBSTACLE_WIDTH / 2;
    const outsideGap =
      birdY + BIRD_RADIUS > obstacle.gapY + obstacle.gapHeight / 2 ||
      birdY - BIRD_RADIUS < obstacle.gapY - obstacle.gapHeight / 2;

    if (overlapsX && outsideGap) {
      return 'A gate closed in before the wings could clear it.';
    }
  }

  return null;
}

export function createFloppyBirdSimulationState(): FloppyBirdSimulationState {
  const obstacles = INITIAL_GAP_SEQUENCE.map((gapIndex, index) => ({
    colorIndex: INITIAL_STYLE_SEQUENCE[index],
    gapHeight: BASE_GAP,
    gapY: GAP_PATTERN_Y[gapIndex],
    scored: false,
    x: 9 + index * BASE_SPACING,
  }));

  return {
    ambience: 0,
    birdVelocity: 0,
    birdY: 0,
    collisionReason: null,
    highestObstacleX: obstacles.at(-1)?.x ?? 0,
    obstacles,
    previousGapIndex: INITIAL_GAP_SEQUENCE.at(-1) ?? 0,
    previousStyleIndex: INITIAL_STYLE_SEQUENCE.at(-1) ?? 0,
    score: 0,
    wingBeat: 0,
  };
}

export function stepFloppyBirdSimulation(
  state: Readonly<FloppyBirdSimulationState>,
  input: Readonly<FloppyBirdSimulationInput>,
  elapsedSeconds: number,
  random: RandomSource,
): FloppyBirdSimulationState {
  return stepSimulation(state, input, elapsedSeconds, random, (current, context) => {
    const frameDeltaSeconds = Math.min(context.elapsedSeconds, MAX_FRAME_DELTA_SECONDS);
    const ambience = context.input.phase === 'paused' ? current.ambience : current.ambience + frameDeltaSeconds;
    let birdVelocity = context.input.flap ? FLAP_VELOCITY : current.birdVelocity;
    let birdY = current.birdY;
    let highestObstacleX = current.highestObstacleX;
    let previousGapIndex = current.previousGapIndex;
    let previousStyleIndex = current.previousStyleIndex;
    let score = current.score;
    let wingBeat = context.input.flap ? 1 : current.wingBeat;
    let obstacles = current.obstacles.map((obstacle) => ({ ...obstacle }));

    if (context.input.phase === 'ready') {
      birdY = Math.sin(ambience * 2.4) * 0.45;
      birdVelocity = 0;
    }

    if (context.input.phase === 'running') {
      birdVelocity -= GRAVITY * frameDeltaSeconds;
      birdY += birdVelocity * frameDeltaSeconds;
      const speed = flightSpeedForScore(score);
      const movedObstacles = obstacles.map((obstacle) => ({
        ...obstacle,
        x: obstacle.x - speed * frameDeltaSeconds,
      }));

      if (movedObstacles.length > 0) {
        highestObstacleX = Math.max(...movedObstacles.map((obstacle) => obstacle.x));
      }

      obstacles = movedObstacles.map((nextObstacle) => {
        if (!nextObstacle.scored && nextObstacle.x + OBSTACLE_WIDTH / 2 < BIRD_X) {
          nextObstacle.scored = true;
          score += 1;
        }

        if (nextObstacle.x < -19) {
          const gapIndex = nextGapIndex(previousGapIndex, context.random);
          const styleIndex = nextStyleIndex(previousStyleIndex, context.random);

          previousGapIndex = gapIndex;
          previousStyleIndex = styleIndex;
          nextObstacle.x = highestObstacleX + obstacleSpacingForScore(score);
          highestObstacleX = nextObstacle.x;
          nextObstacle.gapHeight = obstacleGapForScore(score);
          nextObstacle.gapY = GAP_PATTERN_Y[gapIndex] * lerp(1, 0.84, difficultyForScore(score));
          nextObstacle.scored = false;
          nextObstacle.colorIndex = styleIndex;
        }

        return nextObstacle;
      });
    }

    wingBeat = Math.max(0, wingBeat - frameDeltaSeconds * 2.6);

    return {
      ambience,
      birdVelocity,
      birdY,
      collisionReason: context.input.phase === 'running' ? detectCollision(birdY, obstacles) : null,
      highestObstacleX,
      obstacles,
      previousGapIndex,
      previousStyleIndex,
      score,
      wingBeat,
    };
  });
}
