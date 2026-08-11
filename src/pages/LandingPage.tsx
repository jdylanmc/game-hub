import type { GameManifest } from '@game-hub/game-contract';
import type { GameCatalogState } from '../game-catalog';
import { SiteHeader } from '../components/SiteHeader';
import { GameCard } from '../components/games/GameCard';
import { Card } from '../components/ui/Card';

interface LandingPageProps {
  catalog: GameCatalogState;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-[2rem] border border-white/10 bg-slate-900/60 p-8">
        <div className="h-5 w-28 rounded-full bg-white/10" />
        <div className="mt-6 h-12 max-w-md rounded-full bg-white/10" />
        <div className="mt-4 h-5 max-w-2xl rounded-full bg-white/10" />
        <div className="mt-3 h-5 max-w-xl rounded-full bg-white/5" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((value) => (
          <div className="animate-pulse rounded-[2rem] border border-white/10 bg-slate-900/60 p-7" key={value}>
            <div className="h-5 w-20 rounded-full bg-white/10" />
            <div className="mt-8 h-10 w-56 rounded-full bg-white/10" />
            <div className="mt-4 h-5 w-full rounded-full bg-white/10" />
            <div className="mt-3 h-5 w-5/6 rounded-full bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function splitGames(games: GameManifest[]) {
  const featuredGame = games.find((game) => game.featured) ?? games[0];
  const remainingGames = featuredGame
    ? games.filter((game) => game.id !== featuredGame.id)
    : [];

  return { featuredGame, remainingGames };
}

export function LandingPage({ catalog }: LandingPageProps) {
  const games = catalog.status === 'ready' ? catalog.games : [];
  const { featuredGame, remainingGames } = splitGames(games);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.24),transparent_35%),radial-gradient(circle_at_85%_30%,rgba(168,85,247,0.18),transparent_30%)]" />
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10 lg:py-32">
            <p className="mb-5 font-display text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">
              Pick up. Play. Compete.
            </p>
            <h1 className="max-w-4xl font-display text-5xl font-bold tracking-[-0.04em] text-balance sm:text-7xl">
              Small games.
              <span className="block text-slate-400">Workspace-sized launch velocity.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              The root site stays lean while each game ships from its own workspace,
              manifest, and lazy-loaded Three.js scene.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                Now playing
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
                Choose your next run
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              {catalog.status === 'ready'
                ? `${games.length} games available`
                : catalog.status === 'loading'
                  ? 'Loading game catalog…'
                  : 'Catalog unavailable'}
            </p>
          </div>

          {catalog.status === 'error' ? (
            <Card as="section" className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                Manifest error
              </p>
              <h3 className="mt-3 font-display text-2xl font-semibold">The catalog could not be loaded</h3>
              <p className="mt-4 leading-7 text-slate-300">{catalog.error}</p>
            </Card>
          ) : null}

          {catalog.status === 'loading' ? <LoadingSkeleton /> : null}

          {catalog.status === 'ready' && featuredGame ? (
            <div className="space-y-6">
              <GameCard featured game={featuredGame} index={0} />
              {remainingGames.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2">
                  {remainingGames.map((game, index) => (
                    <GameCard game={game} index={index + 1} key={game.id} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
