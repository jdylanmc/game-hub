import { Avatar } from '../../components/community/Avatar';
import { AvatarUploadPreview } from '../../components/community/AvatarUploadPreview';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StorySurface } from '../../storybook/StorySurface';
import { createAvatarDataUri } from '../../storybook/game-hub/avatarArt';

const leaderboardPlayers = [
  {
    accent: 'text-blue-300',
    avatar: createAvatarDataUri('Ari Mercer', ['#60a5fa', '#8b5cf6']),
    name: 'Ari Mercer',
    rank: '#1',
    score: '98,420',
    status: 'online' as const,
  },
  {
    accent: 'text-violet-300',
    avatar: createAvatarDataUri('Noah Vega', ['#8b5cf6', '#ec4899']),
    name: 'Noah Vega',
    rank: '#2',
    score: '96,105',
    status: 'away' as const,
  },
  {
    accent: 'text-emerald-300',
    avatar: createAvatarDataUri('Mina Hart', ['#34d399', '#0ea5e9']),
    name: 'Mina Hart',
    rank: '#3',
    score: '94,882',
    status: 'online' as const,
  },
  {
    accent: 'text-amber-300',
    avatar: undefined,
    name: 'Kai Sol',
    rank: '#4',
    score: '91,764',
    status: 'busy' as const,
  },
];

const reviews = [
  {
    avatar: createAvatarDataUri('June Holloway', ['#f59e0b', '#ef4444']),
    name: 'June Holloway',
    quote:
      'The checkpoint pacing feels great now. I can see who wrote the top route notes at a glance, and the avatar treatment keeps the feed feeling personal.',
    rating: '5.0',
    title: 'Improved flow for challenge nights',
    when: '2 hours ago',
  },
  {
    avatar: createAvatarDataUri('Parker Lin', ['#38bdf8', '#10b981']),
    name: 'Parker Lin',
    quote:
      'Review cards finally have enough identity for creators. The avatar, score, and helpful count read clearly even when the content wraps to two lines.',
    rating: '4.5',
    title: 'Creator reviews are much easier to scan',
    when: 'Yesterday',
  },
  {
    avatar: undefined,
    name: 'Taylor Ruiz',
    quote:
      'Fallback initials still feel deliberate. That matters when players have not uploaded an image yet but still need presence in votes and social proof.',
    rating: '4.8',
    title: 'Initials fallback still feels premium',
    when: '3 days ago',
  },
];

const voteCards = [
  {
    avatar: createAvatarDataUri('Sam Ortega', ['#a855f7', '#3b82f6']),
    friends: ['AR', 'NV', 'MH'],
    owner: 'Sam Ortega',
    rating: '4.9',
    subtitle: '92% would recommend this run to friends.',
    title: 'Nebula Dash weekly cup',
  },
  {
    avatar: createAvatarDataUri('Mila Rhodes', ['#14b8a6', '#22c55e']),
    friends: ['JH', 'PL', 'TS'],
    owner: 'Mila Rhodes',
    rating: '4.6',
    subtitle: 'Most upvotes mention readable controls and cozy pacing.',
    title: 'Puzzle Forge community jam',
  },
  {
    avatar: undefined,
    friends: ['KS', 'AM', 'JR'],
    owner: 'Kai Sol',
    rating: '4.3',
    subtitle: 'New players are voting this up after the accessibility pass.',
    title: 'Orbit Breaker remix vote',
  },
];

function ReviewStars() {
  return <span aria-hidden="true">★★★★★</span>;
}

const meta = {
  title: 'Game Hub/Avatars & Profiles',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

export const UploadPreview = {
  name: 'Avatar upload preview',
  render: () => (
    <StorySurface
      eyebrow="Core profile flows"
      title="Avatar uploads should feel safe, accessible, and unmistakably personal"
      description="UI-only upload previews validate image MIME types, render initials fallback before selection, and revoke object URLs when they are replaced or reset."
      maxWidthClassName="max-w-5xl"
    >
      <AvatarUploadPreview displayName="Jordan Rivera" handle="@jordo-runs" />
    </StorySurface>
  ),
};

export const UserProfile = {
  name: 'User profile',
  render: () => (
    <StorySurface
      eyebrow="Profile composition"
      title="Player identity carries the full profile view"
      description="A polished profile card should make the avatar feel central to ownership, status, and reputation without overwhelming the rest of the metadata."
      maxWidthClassName="max-w-5xl"
    >
      <Card as="section" className="overflow-hidden p-0">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.24),_transparent_45%),radial-gradient(circle_at_85%_15%,_rgba(168,85,247,0.18),_transparent_35%)] p-8">
            <Badge className="bg-black/20 text-slate-100">Featured member</Badge>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
              <Avatar
                alt="Ari Mercer profile avatar"
                name="Ari Mercer"
                ringTone="violet"
                size="xl"
                src={createAvatarDataUri('Ari Mercer', ['#60a5fa', '#8b5cf6'])}
                status="online"
              />
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-white">Ari Mercer</h2>
                <p className="mt-2 text-sm text-blue-200">@aim-high · challenge curator</p>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                  Hosts weekly speedrun brackets, writes route primers, and keeps the puzzle ladder friendly for
                  first-time competitors.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-8 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ['Wins', '214'],
              ['Review score', '4.9'],
              ['Helpful votes', '1.2K'],
            ].map(([label, value]) => (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={label}>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-2 font-display text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
            <div className="sm:col-span-3 lg:col-span-1">
              <Button className="w-full" variant="primary">
                Edit public profile
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </StorySurface>
  ),
};

export const LeaderboardRows = {
  name: 'Leaderboard rows',
  render: () => (
    <StorySurface
      eyebrow="Competitive surfaces"
      title="Leaderboard rows keep score and identity in the same visual lane"
      description="Players should be able to spot their rivals instantly, even when avatars fall back to initials or statuses shift during a live event."
      maxWidthClassName="max-w-4xl"
    >
      <Card as="section" className="p-0">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leaderboard</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Nebula Dash all-time top runs</h2>
          </div>
          <Badge className="bg-blue-400/10 text-blue-200">Live bracket</Badge>
        </header>
        <ol className="divide-y divide-white/10">
          {leaderboardPlayers.map((player) => (
            <li className="flex items-center gap-4 px-6 py-4" key={player.rank}>
              <span className={`w-10 text-sm font-semibold ${player.accent}`}>{player.rank}</span>
              <Avatar
                alt={`${player.name} leaderboard avatar`}
                name={player.name}
                ringTone="blue"
                size="md"
                src={player.avatar}
                status={player.status}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{player.name}</p>
                <p className="text-sm text-slate-400">Weekend gauntlet finalist</p>
              </div>
              <span className="font-mono text-sm text-slate-200">{player.score}</span>
            </li>
          ))}
        </ol>
      </Card>
    </StorySurface>
  ),
};

export const Reviews = {
  name: 'Reviews',
  render: () => (
    <StorySurface
      eyebrow="Community reviews"
      title="Reviews gain trust when the author avatar earns a real seat in the card"
      description="Each review keeps its author, star rating, and recency tightly grouped so players can judge tone and credibility without extra scanning."
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {reviews.map((review) => (
          <Card as="article" className="flex h-full flex-col p-6" key={review.title}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar
                  alt={`${review.name} review avatar`}
                  name={review.name}
                  ringTone="amber"
                  size="md"
                  src={review.avatar}
                />
                <div>
                  <h2 className="font-semibold text-white">{review.name}</h2>
                  <p className="text-sm text-slate-400">{review.when}</p>
                </div>
              </div>
              <div className="text-right text-amber-300">
                <ReviewStars />
                <p className="mt-1 text-sm font-semibold">{review.rating}</p>
              </div>
            </div>
            <h3 className="mt-6 font-display text-2xl font-semibold text-white">{review.title}</h3>
            <p className="mt-4 flex-1 leading-7 text-slate-300">{review.quote}</p>
            <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
              <span>Helpful to 37 players</span>
              <Button className="px-3 py-1.5" variant="ghost">
                Mark helpful
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </StorySurface>
  ),
};

export const VotesAndRatings = {
  name: 'Game votes & ratings',
  render: () => (
    <StorySurface
      eyebrow="Ratings and votes"
      title="Game votes stay grounded in real player identity"
      description="Avatar chips make social proof feel immediate in weekly votes, while the rating summary keeps personal and aggregate sentiment connected."
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card as="section" className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Rating snapshot</p>
          <div className="mt-4 flex items-end gap-4">
            <span className="font-display text-6xl font-semibold text-white">4.8</span>
            <div className="pb-2 text-amber-300">
              <ReviewStars />
              <p className="mt-2 text-sm text-slate-400">1,284 recent ratings</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {leaderboardPlayers.slice(0, 4).map((player) => (
              <div
                className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2"
                key={player.name}
              >
                <Avatar
                  alt={`${player.name} voter avatar`}
                  name={player.name}
                  size="sm"
                  src={player.avatar}
                  status={player.status}
                />
                <span className="text-sm text-slate-300">{player.name}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {voteCards.map((card) => (
            <Card as="article" className="flex h-full flex-col p-5" key={card.title}>
              <div className="flex items-center gap-3">
                <Avatar
                  alt={`${card.owner} featured player avatar`}
                  name={card.owner}
                  ringTone="emerald"
                  size="md"
                  src={card.avatar}
                />
                <div>
                  <h2 className="font-semibold text-white">{card.title}</h2>
                  <p className="text-sm text-slate-400">{card.subtitle}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm text-slate-400">Average rating</p>
                  <p className="mt-1 font-display text-3xl font-semibold text-white">{card.rating}</p>
                </div>
                <Button className="px-3 py-1.5" variant="primary">
                  Vote
                </Button>
              </div>
              <div className="mt-5 flex items-center gap-2">
                {card.friends.map((friend) => (
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-xs font-semibold text-slate-200"
                    key={friend}
                  >
                    {friend}
                  </span>
                ))}
                <span className="text-sm text-slate-400">Friends already voted</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </StorySurface>
  ),
};
