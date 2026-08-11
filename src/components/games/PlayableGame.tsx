import type {
  GameEvent,
  GameInstance,
  GameManifest,
  GamePhase,
  GameScore,
} from '@game-hub/game-contract';
import { useEffect, useRef, useState } from 'react';
import {
  hasGameLoader,
  loadGameModule,
} from '../../generated/game-import-map';
import { Button } from '../ui/Button';
import { GameHudCard } from './GameHudCard';
import { GameStageStatus } from './GameStageStatus';

interface PlayableGameProps {
  game: GameManifest;
  onScore: (score: GameScore) => void;
}

interface HudSnapshot {
  detail?: string;
  label: string;
  score: number;
}

type LoadState = 'error' | 'loading' | 'ready';

const defaultPhaseMessages: Record<GamePhase, string> = {
  'game-over': 'Run complete. Restart to line up another attempt.',
  paused: 'Game paused. Resume when you are ready.',
  ready: 'The workspace is ready. Follow the control hints to begin.',
  running: 'The workspace is live.',
};

export function PlayableGame({ game, onScore }: PlayableGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameInstance | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [hud, setHud] = useState<HudSnapshot>({
    detail: 'Waiting for the first HUD event from the workspace.',
    label: 'Score',
    score: 0,
  });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [phase, setPhase] = useState<GamePhase>('ready');
  const [phaseMessage, setPhaseMessage] = useState(
    'Importing the workspace bundle and its Three.js scene…',
  );
  const [runtimeError, setRuntimeError] = useState<string>();
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let active = true;
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setAnnouncement(`Loading ${game.title}.`);
    setHud({
      detail: 'Waiting for the first HUD event from the workspace.',
      label: 'Score',
      score: 0,
    });
    setLoadState('loading');
    setPhase('ready');
    setPhaseMessage('Importing the workspace bundle and its Three.js scene…');
    setRuntimeError(undefined);

    const handleEvent = (event: GameEvent) => {
      if (!active) {
        return;
      }

      if (event.type === 'announcement') {
        setAnnouncement(event.message);
        return;
      }

      if (event.type === 'hud') {
        setHud((current) => ({
          detail: event.detail ?? current.detail,
          label: event.label ?? current.label,
          score: event.score,
        }));
        return;
      }

      setPhase(event.phase);
      setPhaseMessage(event.message ?? defaultPhaseMessages[event.phase]);
      setAnnouncement(event.message ?? defaultPhaseMessages[event.phase]);
    };

    const startWorkspace = async () => {
      try {
        const gameId = game.id;

        if (!hasGameLoader(gameId)) {
          throw new Error(`No generated workspace loader exists for "${gameId}".`);
        }

        const module = await loadGameModule(gameId);

        if (!active) {
          return;
        }

        if (module.manifest.id !== game.id) {
          throw new Error(
            `The loaded workspace manifest id "${module.manifest.id}" does not match route id "${game.id}".`,
          );
        }

        const controller = module.createGame(canvas, {
          emitEvent: handleEvent,
          submitScore: (score) => {
            if (!active) {
              return;
            }

            onScore(score);
          },
        });

        controllerRef.current = controller;
        controller.start();
        setLoadState('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        setLoadState('error');
        setRuntimeError(
          error instanceof Error
            ? error.message
            : 'The workspace could not be loaded.',
        );
      }
    };

    void startWorkspace();

    return () => {
      active = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [game.id, game.title, onScore, sessionKey]);

  const restart = () => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setSessionKey((current) => current + 1);
  };

  const pause = () => controllerRef.current?.pause();
  const resume = () => controllerRef.current?.resume();

  const stageStatus =
    loadState === 'loading' ? (
      <GameStageStatus
        accent={game.accent}
        message="Importing the workspace module and keeping Three.js out of the landing-page startup path."
        state="loading"
        title={`Loading ${game.title}`}
      />
    ) : loadState === 'error' ? (
      <GameStageStatus
        actionLabel="Try again"
        accent={game.accent}
        message={runtimeError ?? 'The workspace could not be loaded.'}
        onAction={restart}
        state="error"
        title="Workspace unavailable"
      />
    ) : phase === 'ready' ? (
      <GameStageStatus
        accent={game.accent}
        message={phaseMessage}
        state="ready"
        title="Ready to play"
      />
    ) : phase === 'paused' ? (
      <GameStageStatus
        actionLabel="Resume"
        accent={game.accent}
        message={phaseMessage}
        onAction={resume}
        state="paused"
        title="Paused"
      />
    ) : phase === 'game-over' ? (
      <GameStageStatus
        actionLabel="Restart run"
        accent={game.accent}
        message={phaseMessage}
        onAction={restart}
        score={hud.score}
        state="game-over"
        title="Run complete"
      />
    ) : null;

  return (
    <section
      className="rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl"
      style={{ boxShadow: `0 30px 100px -40px ${game.accent}` }}
    >
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-slate-950">
        <canvas
          aria-label={`${game.title} gameplay canvas`}
          className={`aspect-video w-full rounded-[1.4rem] bg-slate-950 transition-opacity ${loadState !== 'ready' ? 'opacity-0' : phase === 'paused' ? 'opacity-65' : 'opacity-100'}`}
          ref={canvasRef}
          tabIndex={0}
        />
        {stageStatus}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <GameHudCard
          accent={game.accent}
          detail={hud.detail ?? phaseMessage}
          label={hud.label}
          phase={phase}
          score={hud.score}
        />

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {loadState === 'ready' && phase === 'running' ? (
            <Button onClick={pause}>Pause</Button>
          ) : null}
          {loadState === 'ready' && phase === 'paused' ? (
            <Button onClick={resume} variant="primary">
              Resume
            </Button>
          ) : null}
          {loadState === 'ready' ? (
            <Button onClick={restart} variant={phase === 'game-over' ? 'primary' : 'secondary'}>
              {phase === 'game-over' ? 'Restart run' : 'Reset run'}
            </Button>
          ) : null}
          {loadState === 'error' ? (
            <Button onClick={restart} variant="primary">
              Retry workspace
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        The browser fetches catalog metadata first, then lazy-loads this workspace and its Three.js scene when you open the route.
      </p>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
