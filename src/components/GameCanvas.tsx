import { useEffect, useRef, useState } from 'react';
import type { GameDefinition, GameScore } from '../game-contract';

interface GameCanvasProps {
  game: GameDefinition;
  onScore: (score: GameScore) => void;
}

export function GameCanvas({ game, onScore }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      const instance = game.create(canvas, { reportScore: onScore });
      instance.start();
      return () => instance.dispose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'The game could not start.',
      );
    }
  }, [game, onScore]);

  if (error) {
    return (
      <div className="grid aspect-video place-items-center rounded-2xl border border-red-400/30 bg-red-950/20 p-8 text-center text-red-200">
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={`${game.title} WebGL game canvas`}
      className="aspect-video w-full rounded-2xl bg-slate-950"
    />
  );
}
