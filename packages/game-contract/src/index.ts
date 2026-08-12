export type GameTechnology = 'Three.js';

export interface GameControl {
  action: string;
  inputs: string[];
}

export interface GameManifest {
  id: string;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  secondaryAccent: string;
  technology: GameTechnology;
  featured?: boolean;
  order: number;
  controls: GameControl[];
  instructions: string[];
}

export interface GameManifestIndex {
  games: GameManifest[];
}

export interface GameScore {
  gameId: string;
  score: number;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export type GamePhase = 'ready' | 'running' | 'paused' | 'game-over';

export type GameEvent =
  | {
      type: 'phase';
      phase: GamePhase;
      message?: string;
    }
  | {
      type: 'hud';
      score: number;
      label?: string;
      detail?: string;
      bestScore?: number;
    }
  | {
      type: 'announcement';
      message: string;
      politeness?: 'polite' | 'assertive';
    };

export interface GameHost {
  emitEvent: (event: GameEvent) => void;
  submitScore: (result: GameScore) => void;
}

export interface GameInstance {
  start: () => void;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
}

export interface GameModule {
  manifest: GameManifest;
  createGame: (canvas: HTMLCanvasElement, host: GameHost) => GameInstance;
}

export * from './simulation';
