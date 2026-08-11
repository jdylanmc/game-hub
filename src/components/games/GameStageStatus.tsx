import { Button } from '../ui/Button';

export type StageStatusState = 'error' | 'game-over' | 'loading' | 'paused' | 'ready';

interface GameStageStatusProps {
  actionLabel?: string;
  accent: string;
  message: string;
  onAction?: () => void;
  score?: number;
  state: StageStatusState;
  title: string;
}

const eyebrowByState: Record<StageStatusState, string> = {
  error: 'Load error',
  'game-over': 'Run complete',
  loading: 'Workspace load',
  paused: 'Paused',
  ready: 'Ready',
};

export function GameStageStatus({
  actionLabel,
  accent,
  message,
  onAction,
  score,
  state,
  title,
}: GameStageStatusProps) {
  const interactive = Boolean(actionLabel && onAction);

  return (
    <div
      className={`absolute inset-0 grid place-items-center bg-slate-950/70 px-6 text-center backdrop-blur-sm ${interactive ? '' : 'pointer-events-none'}`}
    >
      <div className="max-w-lg rounded-[2rem] border border-white/15 bg-slate-950/85 p-6 shadow-2xl shadow-black/35 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.26em]" style={{ color: accent }}>
          {eyebrowByState[state]}
        </p>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 leading-7 text-slate-300">{message}</p>
        {typeof score === 'number' ? (
          <p className="mt-5 font-mono text-4xl font-semibold text-white">{score.toLocaleString()}</p>
        ) : null}
        {actionLabel && onAction ? (
          <Button className="mt-6" onClick={onAction} variant="primary">
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
