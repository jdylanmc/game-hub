import type { GameManifest } from '@game-hub/game-contract';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface GameManifestCardProps {
  game: GameManifest;
}

export function GameManifestCard({ game }: GameManifestCardProps) {
  return (
    <Card as="section" className="p-6">
      <div className="flex flex-wrap gap-2">
        {game.featured ? <Badge className="bg-amber-400/10 text-amber-100">Featured</Badge> : null}
        <Badge className="bg-white/5 text-slate-200">{game.technology} workspace</Badge>
        <Badge className="bg-white/5 text-slate-200">games/{game.id}</Badge>
      </div>
      <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight">Runtime manifest</h2>
      <p className="mt-4 leading-7 text-slate-300">{game.description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tagline</p>
          <p className="mt-3 text-lg font-medium text-white">{game.tagline}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Generator order</p>
          <p className="mt-3 text-lg font-medium text-white">{game.order}</p>
        </div>
      </div>
    </Card>
  );
}
