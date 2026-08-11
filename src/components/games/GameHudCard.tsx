import type { GamePhase } from '@game-hub/game-contract';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface GameHudCardProps {
  accent: string;
  detail?: string;
  label: string;
  phase: GamePhase;
  score: number;
}

const phaseLabels: Record<GamePhase, string> = {
  'game-over': 'Game over',
  paused: 'Paused',
  ready: 'Ready',
  running: 'Running',
};

export function GameHudCard({ accent, detail, label, phase, score }: GameHudCardProps) {
  return (
    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Live HUD
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold">{score.toLocaleString()}</h2>
          <p className="mt-1 text-sm text-slate-400">{label}</p>
        </div>
        <Badge className="bg-white/5 text-slate-200" style={{ borderColor: `${accent}55`, color: accent }}>
          {phaseLabels[phase]}
        </Badge>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-300">{detail ?? 'Waiting for the scene to publish the next HUD event.'}</p>
    </Card>
  );
}
