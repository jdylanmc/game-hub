import type { GameManifest } from '@game-hub/game-contract';
import { Link } from '../Link';
import { Badge } from '../ui/Badge';
import { cardStyles } from '../ui/Card';

interface GameCardProps {
  featured?: boolean;
  game: GameManifest;
  index: number;
}

export function GameCard({ featured = false, game, index }: GameCardProps) {
  return (
    <Link
      className={cardStyles(
        true,
        featured ? 'group relative overflow-hidden p-8 lg:p-9' : 'group relative overflow-hidden p-7',
      )}
      href={`/games/${game.id}`}
    >
      <div
        className="absolute inset-0 opacity-25 transition-opacity duration-300 group-hover:opacity-40"
        style={{
          background: `radial-gradient(circle at 80% 18%, ${game.accent}, transparent 36%), radial-gradient(circle at 20% 85%, ${game.secondaryAccent}, transparent 34%)`,
        }}
      />
      <div
        className={`relative ${featured ? 'grid min-h-80 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end' : 'flex min-h-72 flex-col justify-between'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {game.featured ? <Badge className="bg-amber-400/15 text-amber-100">Featured</Badge> : null}
            <Badge className="bg-black/20 text-slate-100">{game.technology}</Badge>
          </div>
          <span className="font-mono text-sm text-slate-500">{String(index + 1).padStart(2, '0')}</span>
        </div>

        <div className={featured ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]' : ''}>
          <div>
            <p className="mb-3 text-sm font-medium" style={{ color: game.accent }}>
              {game.tagline}
            </p>
            <h3
              className={`font-display font-semibold tracking-tight ${featured ? 'text-5xl sm:text-6xl' : 'text-4xl'}`}
            >
              {game.title}
            </h3>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">{game.description}</p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white">
              Open workspace
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </span>
          </div>

          <div className={featured ? 'self-end rounded-3xl border border-white/10 bg-black/20 p-5' : 'mt-7'}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Controls</p>
            <ul className="mt-3 space-y-3 text-sm text-slate-300">
              {game.controls.slice(0, featured ? 3 : 2).map((control) => (
                <li key={control.action}>
                  <span className="font-medium text-white">{control.action}</span>
                  <span className="block text-slate-400">{control.inputs.join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Link>
  );
}
