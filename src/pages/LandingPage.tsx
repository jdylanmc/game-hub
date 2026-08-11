import { Link } from '../components/Link';
import { SiteHeader } from '../components/SiteHeader';
import { Badge } from '../components/ui/Badge';
import { cardStyles } from '../components/ui/Card';
import { games } from '../games/catalog';

export function LandingPage() {
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
              <span className="block text-slate-400">Big bragging rights.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              Jump into quick browser games, chase the leaderboard, and find the
              community around every challenge.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                Now playing
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
                Choose your next run
              </h2>
            </div>
            <p className="hidden text-sm text-slate-500 sm:block">2 games available</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {games.map((game, index) => (
              <Link
                className={cardStyles(
                  true,
                  'group relative overflow-hidden p-7',
                )}
                href={`/games/${game.id}`}
                key={game.id}
              >
                <div
                  className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-30"
                  style={{
                    background: `radial-gradient(circle at 85% 15%, ${game.accent}, transparent 45%)`,
                  }}
                />
                <div className="relative flex min-h-72 flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <Badge className="bg-black/20">WebGL</Badge>
                    <span className="font-mono text-sm text-slate-500">0{index + 1}</span>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium" style={{ color: game.accent }}>
                      {game.tagline}
                    </p>
                    <h3 className="font-display text-4xl font-semibold tracking-tight">
                      {game.title}
                    </h3>
                    <p className="mt-4 max-w-md leading-7 text-slate-400">
                      {game.description}
                    </p>
                    <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white">
                      Play now
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
