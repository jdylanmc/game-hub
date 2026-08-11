import type { GameManifest, GameScore } from '@game-hub/game-contract';
import { useCallback, useState } from 'react';
import { AdvertisementPlacement } from '../components/ads/AdvertisementPlacement';
import { GameControlsCard } from '../components/games/GameControlsCard';
import { GameManifestCard } from '../components/games/GameManifestCard';
import { GameStageStatus } from '../components/games/GameStageStatus';
import { PlayableGame } from '../components/games/PlayableGame';
import { Link } from '../components/Link';
import { SiteHeader } from '../components/SiteHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatGameId } from '../game-catalog';

interface GamePageProps {
  catalogError?: string;
  catalogLoading?: boolean;
  game?: GameManifest;
  requestedGameId: string;
}

const sampleLeaders = [
  { name: 'pixelPilot', score: '98,420' },
  { name: 'orbitKid', score: '91,760' },
  { name: 'guest_2048', score: '88,100' },
];

export function GamePage({ catalogError, catalogLoading = false, game, requestedGameId }: GamePageProps) {
  const [latestScore, setLatestScore] = useState<GameScore>();
  const handleScore = useCallback((score: GameScore) => setLatestScore(score), []);

  if (!game) {
    const accent = '#60a5fa';
    const title = formatGameId(requestedGameId);

    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
          <Link
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
            href="/"
          >
            ← All games
          </Link>

          <div className="mb-8">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">
              {catalogLoading ? 'Loading manifest' : 'Manifest unavailable'}
            </p>
            <h1 className="mt-3 font-display text-5xl font-bold tracking-[-0.04em]">{title}</h1>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/70">
            <div className="aspect-video">
              <GameStageStatus
                accent={accent}
                message={
                  catalogLoading
                    ? 'Fetching the runtime catalog before loading the selected workspace.'
                    : (catalogError ?? 'The runtime manifest for this game could not be loaded.')
                }
                state={catalogLoading ? 'loading' : 'error'}
                title={catalogLoading ? `Loading ${title}` : 'Game unavailable'}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
          href="/"
        >
          ← All games
        </Link>

        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              {game.featured ? <Badge className="bg-amber-400/10 text-amber-100">Featured</Badge> : null}
              <Badge className="bg-white/5 text-slate-200">{game.technology}</Badge>
            </div>
            <p
              className="mt-4 font-display text-sm font-semibold uppercase tracking-[0.22em]"
              style={{ color: game.accent }}
            >
              {game.tagline}
            </p>
            <h1 className="mt-3 font-display text-5xl font-bold tracking-[-0.04em]">{game.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button>☆ Rate</Button>
            <span className="text-sm text-slate-500">4.8 · 312 ratings</span>
          </div>
        </div>

        <PlayableGame game={game} onScore={handleScore} />

        {latestScore ? (
          <div className="mt-5 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
            Final score recorded locally: {latestScore.score.toLocaleString()}
          </div>
        ) : null}

        <div className="mt-10 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <GameManifestCard game={game} />
          <GameControlsCard game={game} />
        </div>

        <AdvertisementPlacement className="mt-8" state="populated" />

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Community</p>
            <h2 className="mt-3 font-display text-2xl font-semibold">Talk strategy</h2>
            <p className="mt-3 leading-7 text-slate-400">
              Sign in to share tips, post your best run, and meet other players. Community posts will appear here when
              the service is connected.
            </p>
            <Button className="mt-6" variant="primary">
              Join the conversation
            </Button>
          </Card>

          <Card as="section" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leaderboard</p>
                <h2 className="mt-3 font-display text-2xl font-semibold">Top runs</h2>
              </div>
              <span className="text-xs text-slate-500">All time</span>
            </div>
            <ol className="mt-6 space-y-4">
              {sampleLeaders.map((leader, index) => (
                <li
                  className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0"
                  key={leader.name}
                >
                  <span className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-slate-600">{index + 1}</span>
                    {leader.name}
                  </span>
                  <span className="font-mono text-sm text-slate-300">{leader.score}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>
    </div>
  );
}
