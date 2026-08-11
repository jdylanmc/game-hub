import { Avatar } from '../../components/community/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { storybookGames as games } from '../../storybook/gameHubFixtures';
import { createAvatarDataUri } from '../../storybook/game-hub/avatarArt';

const communityMoments = [
  {
    description: 'Players are building repeat rituals around weekend gauntlets and friends-first discovery.',
    label: 'Gallery + testimonial',
    stat: '2.3k watch-list adds',
    title: 'Community moments scale beyond the hero section',
  },
  {
    description: 'Game pages can preview clips, creator notes, and challenge snapshots before the player commits to a launch.',
    label: 'Gallery + feature',
    stat: '81% click-through on featured rows',
    title: 'Discovery stays visual and low-friction',
  },
  {
    description: 'Rotating spotlights keep the homepage feeling alive even with a compact game catalog.',
    label: 'Hero + stats',
    stat: '14 curated beats in August',
    title: 'Marketing modules can stay fresh every week',
  },
];

const marketingHighlights = [
  {
    description: 'Hero and call-to-action patterns frame the immediate value prop and the first “play now” decision.',
    mamba: 'Hero + Call to Action',
    title: 'Open with one confident, high-energy message',
  },
  {
    description: 'Feature and stats blocks explain why Game Hub matters after the first impression lands.',
    mamba: 'Feature + Stats',
    title: 'Back the pitch with reasons to stay',
  },
  {
    description: 'Gallery, testimonial, and review-inspired content give the eventual homepage human texture and proof.',
    mamba: 'Gallery + Testimonial + Review',
    title: 'Turn social proof into part of the browse experience',
  },
];

const playerStories = [
  {
    avatar: createAvatarDataUri('Jordan Rivera', ['#60a5fa', '#8b5cf6']),
    name: 'Jordan Rivera',
    quote:
      'I want the homepage to make it obvious which run is worth my next ten minutes and which friends are already obsessed with it.',
    role: 'Speedrun organizer',
  },
  {
    avatar: createAvatarDataUri('Avery Chen', ['#34d399', '#0ea5e9']),
    name: 'Avery Chen',
    quote:
      'The best marketing blocks are the ones that feel like discovery, not like a detached promo site. Show me the game, the mood, and the crowd around it.',
    role: 'Community curator',
  },
  {
    avatar: createAvatarDataUri('Mina Hart', ['#f59e0b', '#ef4444']),
    name: 'Mina Hart',
    quote:
      'If the homepage can preview challenge structure, creator context, and social proof in one pass, it will pull me straight into a session.',
    role: 'Challenge night host',
  },
];

const playPlans = [
  {
    accent: 'from-blue-400/25 to-cyan-400/10',
    cta: 'Start casually',
    name: 'Drop-in player',
    points: ['Daily picks and fast retries', 'Friend activity callouts', 'Simple rating and watch-list actions'],
    subtitle: 'Pricing-card structure, repurposed for low-commitment game browsing.',
  },
  {
    accent: 'from-violet-400/25 to-fuchsia-400/10',
    cta: 'Chase the bracket',
    name: 'Ranked competitor',
    points: ['Featured ladders and live gauntlets', 'Leaderboard previews in every lane', 'Profile reputation and review depth'],
    subtitle: 'A plan-card treatment for competitive intent and social prestige.',
  },
  {
    accent: 'from-emerald-400/25 to-teal-400/10',
    cta: 'Grow a following',
    name: 'Creator spotlight',
    points: ['Curated shelves for clips and guides', 'Community proof modules', 'Clear prompts to publish strategy notes'],
    subtitle: 'A creator-friendly variant for editorial and UGC programming.',
  },
];

const meta = {
  title: 'Game Hub/Marketing',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

export const HomepageComposition = {
  name: 'Homepage composition',
  render: () => (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Game Hub</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Marketing study</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-white/5 text-slate-200">Mamba-inspired homepage</Badge>
            <Button variant="secondary">Share direction</Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_0%,rgba(37,99,235,0.24),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.18),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(2,6,23,0.94))]" />
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-24">
            <div>
              <Badge className="bg-blue-400/10 text-blue-200">
                Mamba inspiration · Hero + Call to Action + Header
              </Badge>
              <h1 className="mt-6 max-w-4xl font-display text-5xl font-bold tracking-[-0.05em] sm:text-7xl">
                Make the game-browsing homepage feel like the start of the next great run.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                This curated Storybook page shows how Hero, Call to Action, Feature,
                Gallery, Stats, Testimonial, and Pricing-style Mamba blocks can evolve
                into a browse-first landing experience for Game Hub.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button className="px-6 py-3" variant="primary">Explore featured games</Button>
                <Button className="px-6 py-3" variant="secondary">View community proof</Button>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                {[playerStories[0], playerStories[1], playerStories[2]].map((player) => (
                  <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2" key={player.name}>
                    <Avatar alt={`${player.name} community avatar`} name={player.name} size="sm" src={player.avatar} status="online" />
                    <span className="text-sm text-slate-300">{player.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {games.map((game, index) => (
                <Card as="article" className="relative overflow-hidden p-0" key={game.id}>
                  <div
                    className="absolute inset-0 opacity-90"
                    style={{
                      background: `linear-gradient(160deg, ${game.accent}33, transparent 55%), radial-gradient(circle at top right, ${game.secondaryAccent}55, transparent 38%), #0f172a`,
                    }}
                  />
                  <div className="relative flex min-h-72 flex-col justify-between p-6">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-black/25 text-slate-100">Hero shelf {index + 1}</Badge>
                      <span className="text-sm text-slate-400">{game.tagline}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: game.secondaryAccent }}>
                        Featured launch target
                      </p>
                      <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight">
                        {game.title}
                      </h2>
                      <p className="mt-4 max-w-sm leading-7 text-slate-300">{game.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
              <Card as="article" className="sm:col-span-2 p-6">
                <Badge className="bg-violet-400/10 text-violet-200">Mamba inspiration · Stats</Badge>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {[
                    ['2', 'Games ready for spotlight'],
                    ['18K', 'Projected first-session visits'],
                    ['4.8', 'Target homepage quality signal'],
                  ].map(([value, label]) => (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={label}>
                      <p className="font-display text-4xl font-semibold text-white">{value}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <Badge className="bg-white/5 text-slate-200">Mamba inspiration · Feature + Stats</Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight">
              Use feature blocks to explain why browsing here feels better than scrolling a flat list.
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {marketingHighlights.map((highlight) => (
              <Card as="article" className="h-full p-6" key={highlight.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                  {highlight.mamba}
                </p>
                <h3 className="mt-4 font-display text-2xl font-semibold text-white">
                  {highlight.title}
                </h3>
                <p className="mt-4 leading-7 text-slate-400">{highlight.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-slate-900/45">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
            <div className="mb-8 max-w-3xl">
              <Badge className="bg-white/5 text-slate-200">Mamba inspiration · Gallery + Feature</Badge>
              <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight">
                Gallery-like storytelling can sell the mood of a play session before a single click.
              </h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {communityMoments.map((moment, index) => (
                <Card as="article" className="relative overflow-hidden p-0" key={moment.title}>
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        index === 0
                          ? 'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(15,23,42,0.92))'
                          : index === 1
                            ? 'linear-gradient(135deg, rgba(192,132,252,0.22), rgba(15,23,42,0.92))'
                            : 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(15,23,42,0.92))',
                    }}
                  />
                  <div className="relative flex min-h-80 flex-col justify-between p-6">
                    <div className="flex items-center justify-between gap-3">
                      <Badge className="bg-black/20 text-slate-100">{moment.label}</Badge>
                      <span className="text-sm text-slate-300">{moment.stat}</span>
                    </div>
                    <div>
                      <h3 className="font-display text-3xl font-semibold tracking-tight text-white">
                        {moment.title}
                      </h3>
                      <p className="mt-4 max-w-sm leading-7 text-slate-300">{moment.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <Badge className="bg-white/5 text-slate-200">Mamba inspiration · Testimonial + Review</Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight">
              Social proof should feel like part of discovery, not like a separate marketing appendix.
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {playerStories.map((story) => (
              <Card as="article" className="h-full p-6" key={story.name}>
                <div className="flex items-center gap-4">
                  <Avatar alt={`${story.name} testimonial avatar`} name={story.name} ringTone="blue" size="lg" src={story.avatar} />
                  <div>
                    <h3 className="font-semibold text-white">{story.name}</h3>
                    <p className="text-sm text-slate-400">{story.role}</p>
                  </div>
                </div>
                <p className="mt-6 text-lg leading-8 text-slate-300">“{story.quote}”</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_38%),linear-gradient(180deg,rgba(2,6,23,1),rgba(15,23,42,0.92))]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
            <div className="mb-8 max-w-3xl">
              <Badge className="bg-white/5 text-slate-200">Mamba inspiration · Pricing-style plans</Badge>
              <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight">
                Pricing cards can become play-style cards that segment the homepage without feeling transactional.
              </h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {playPlans.map((plan) => (
                <Card as="article" className="relative overflow-hidden p-0" key={plan.name}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${plan.accent}`} />
                  <div className="relative flex h-full flex-col p-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                      {plan.name}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{plan.subtitle}</p>
                    <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-200">
                      {plan.points.map((point) => (
                        <li className="flex gap-3" key={point}>
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-white/80" aria-hidden="true" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="mt-8 w-full" variant="primary">{plan.cta}</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 text-center lg:px-10">
          <Badge className="bg-blue-400/10 text-blue-200">Mamba inspiration · Final call to action</Badge>
          <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            The eventual Game Hub homepage can market the catalog without pretending it is a separate product.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            The most relevant Mamba marketing blocks already translate well into browse-first, game-first, and community-aware storytelling for the landing experience.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button className="px-6 py-3" variant="primary">Prototype the homepage</Button>
            <Button className="px-6 py-3" variant="secondary">Review source categories</Button>
          </div>
        </section>
      </main>
    </div>
  ),
};
