import { useCallback, useState } from 'react';
import { AdvertisementPlacement } from '../components/ads/AdvertisementPlacement';
import { GameCanvas } from '../components/GameCanvas';
import { Link } from '../components/Link';
import { SiteHeader } from '../components/SiteHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { GameDefinition, GameScore } from '../game-contract';

interface GamePageProps {
  game: GameDefinition;
}

const sampleLeaders = [
  { name: 'pixelPilot', score: '98,420' },
  { name: 'orbitKid', score: '91,760' },
  { name: 'guest_2048', score: '88,100' },
];

export function GamePage({ game }: GamePageProps) {
  const [latestScore, setLatestScore] = useState<GameScore>();
  const handleScore = useCallback((score: GameScore) => setLatestScore(score), []);

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
            <p className="font-display text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: game.accent }}>
              {game.tagline}
            </p>
            <h1 className="mt-3 font-display text-5xl font-bold tracking-[-0.04em]">
              {game.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button>☆ Rate</Button>
            <span className="text-sm text-slate-500">4.8 · 312 ratings</span>
          </div>
        </div>

        <div
          className="rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl"
          style={{ boxShadow: `0 30px 100px -40px ${game.accent}` }}
        >
          <GameCanvas game={game} onScore={handleScore} />
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Click the game canvas to submit a placeholder score.
        </p>

        {latestScore && (
          <div className="mt-5 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
            Placeholder score recorded locally: {latestScore.score.toLocaleString()}
          </div>
        )}

        <AdvertisementPlacement className="mt-8" state="populated" />

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Community
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold">
              Talk strategy
            </h2>
            <p className="mt-3 leading-7 text-slate-400">
              Sign in to share tips, post your best run, and meet other players.
              Community posts will appear here when the service is connected.
            </p>
            <Button className="mt-6" variant="primary">
              Join the conversation
            </Button>
          </Card>

          <Card as="section" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Leaderboard
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">Top runs</h2>
              </div>
              <span className="text-xs text-slate-500">All time</span>
            </div>
            <ol className="mt-6 space-y-4">
              {sampleLeaders.map((leader, index) => (
                <li className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0" key={leader.name}>
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
