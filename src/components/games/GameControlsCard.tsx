import type { GameManifest } from '@game-hub/game-contract';
import { Card } from '../ui/Card';

interface GameControlsCardProps {
  game: GameManifest;
}

export function GameControlsCard({ game }: GameControlsCardProps) {
  return (
    <Card as="section" className="p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Controls & accessibility</p>
      <h2 className="mt-3 font-display text-2xl font-semibold">Play by sight or by status text</h2>
      <div className="mt-6 space-y-5">
        {game.controls.map((control) => (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={control.action}>
            <p className="text-sm font-semibold text-white">{control.action}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{control.inputs.join(' · ')}</p>
          </div>
        ))}
      </div>
      <ul className="mt-6 space-y-3 text-sm leading-7 text-slate-300">
        {game.instructions.map((instruction) => (
          <li className="flex gap-3" key={instruction}>
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-300" />
            <span>{instruction}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
