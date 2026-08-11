export interface GameScore {
  gameId: string;
  score: number;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GameHost {
  reportScore: (result: GameScore) => void;
}

export interface GameInstance {
  start: () => void;
  dispose: () => void;
}

export interface GameDefinition {
  id: string;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  secondaryAccent: string;
  create: (canvas: HTMLCanvasElement, host: GameHost) => GameInstance;
}
