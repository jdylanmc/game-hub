import { Avatar } from '../../components/community/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { storybookGames } from '../../storybook/gameHubFixtures';
import { StorySurface } from '../../storybook/StorySurface';
import { createAvatarDataUri } from '../../storybook/game-hub/avatarArt';

type Presence = 'away' | 'busy' | 'offline' | 'online';

interface CommunityMember {
  avatar?: string;
  handle: string;
  name: string;
  role: string;
  status?: Presence;
}

interface Topic {
  author: CommunityMember;
  board: string;
  createdAt: string;
  excerpt: string;
  id: string;
  isLocked?: boolean;
  isPinned?: boolean;
  latestActivity: {
    action: string;
    member: CommunityMember;
    time: string;
  };
  replies: string;
  title: string;
  views: string;
}

interface ThreadEntry {
  author: CommunityMember;
  body: string[];
  createdAt: string;
  highlighted?: boolean;
  label?: string;
}

const [featuredGame, secondaryGame] = storybookGames;

const members: Record<string, CommunityMember> = {
  ari: {
    avatar: createAvatarDataUri('Ari Mercer', ['#60a5fa', '#8b5cf6']),
    handle: '@aim-high',
    name: 'Ari Mercer',
    role: 'Challenge curator',
    status: 'online',
  },
  june: {
    avatar: createAvatarDataUri('June Holloway', ['#f59e0b', '#ef4444']),
    handle: '@june-h',
    name: 'June Holloway',
    role: 'Moderator',
    status: 'online',
  },
  kai: {
    handle: '@kai-sol',
    name: 'Kai Sol',
    role: 'Arcade regular',
    status: 'busy',
  },
  mina: {
    avatar: createAvatarDataUri('Mina Hart', ['#34d399', '#0ea5e9']),
    handle: '@mina-h',
    name: 'Mina Hart',
    role: 'Guide writer',
    status: 'online',
  },
  noah: {
    avatar: createAvatarDataUri('Noah Vega', ['#8b5cf6', '#ec4899']),
    handle: '@noah-v',
    name: 'Noah Vega',
    role: 'Tournament host',
    status: 'away',
  },
  parker: {
    avatar: createAvatarDataUri('Parker Lin', ['#38bdf8', '#10b981']),
    handle: '@parker-l',
    name: 'Parker Lin',
    role: 'Systems analyst',
    status: 'online',
  },
  taylor: {
    handle: '@taylor-r',
    name: 'Taylor Ruiz',
    role: 'Community newcomer',
    status: 'offline',
  },
};

const forumTopics: Topic[] = [
  {
    author: members.ari,
    board: `${featuredGame.title} · Strategy Desk`,
    createdAt: 'Today · 8:10 AM',
    excerpt:
      'Route notes for the current weekly gauntlet, plus a clean checkpoint order for anyone chasing sub-100k runs.',
    id: 'weekly-gauntlet-route-notes',
    isPinned: true,
    latestActivity: {
      action: 'last reply from',
      member: members.parker,
      time: '12 minutes ago',
    },
    replies: '27',
    title: `Weekly gauntlet route notes for ${featuredGame.title}`,
    views: '1.9k',
  },
  {
    author: members.june,
    board: `${featuredGame.title} · Announcements`,
    createdAt: 'Yesterday · 6:30 PM',
    excerpt:
      'The boost gate desync repro is documented and locked while the fix is verified. Use this thread for reference only.',
    id: 'known-issue-boost-gate-desync',
    isLocked: true,
    isPinned: true,
    latestActivity: {
      action: 'updated by',
      member: members.june,
      time: 'Yesterday',
    },
    replies: '14',
    title: 'Known issue: boost gate desync after daily reset',
    views: '3.2k',
  },
  {
    author: members.mina,
    board: `${secondaryGame.title} · Loadout Advice`,
    createdAt: 'Today · 9:02 AM',
    excerpt:
      'Comparing stable opener builds for stack consistency. Which modifier pair keeps mid-round orbits readable for new players?',
    id: 'beginner-loadout-comparisons',
    latestActivity: {
      action: 'last reply from',
      member: members.kai,
      time: '38 minutes ago',
    },
    replies: '9',
    title: 'Beginner loadout comparisons for calmer orb stacks',
    views: '684',
  },
  {
    author: members.taylor,
    board: `${featuredGame.title} · Introductions`,
    createdAt: '2 days ago',
    excerpt:
      'First impressions from a new player and a request for controller-friendly recommendations before the weekend queue opens.',
    id: 'new-player-intro-thread',
    latestActivity: {
      action: 'last reply from',
      member: members.noah,
      time: '2 hours ago',
    },
    replies: '18',
    title: 'New here: what should I learn before my first challenge night?',
    views: '1.1k',
  },
];

const threadEntries: ThreadEntry[] = [
  {
    author: members.ari,
    body: [
      `I finally cleaned up the opener path for ${featuredGame.title}. If you hug the left rail through checkpoint two, you can bank enough space to keep the final drift gate readable.`,
      'I attached the split notes below in message-board form so people can add safer variations without rewriting the entire guide. If you have a controller-specific adjustment, reply with your timestamp and score band.',
    ],
    createdAt: 'Today · 8:10 AM',
    highlighted: true,
    label: 'Original post',
  },
  {
    author: members.parker,
    body: [
      'Tried this on keyboard and on pad. The route still works if you slow for half a beat before the second corner; it costs about 200 points but removes the accidental wall scrape for newer players.',
    ],
    createdAt: 'Today · 8:44 AM',
    label: 'Most helpful reply',
  },
  {
    author: members.kai,
    body: [
      'Seconding Parker’s safer version. I also found that muting the screen shake for the final gate makes the route much easier to learn when you are not already chasing leaderboard pace.',
    ],
    createdAt: 'Today · 9:16 AM',
  },
];

function StateBadge({ kind }: { kind: 'locked' | 'pinned' }) {
  if (kind === 'pinned') {
    return <Badge className="bg-blue-400/10 text-blue-200">Pinned</Badge>;
  }

  return <Badge className="bg-amber-400/10 text-amber-200">Locked</Badge>;
}

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <li>
      <article
        aria-labelledby={`${topic.id}-title`}
        className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_10rem_14rem]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {topic.isPinned ? <StateBadge kind="pinned" /> : null}
            {topic.isLocked ? <StateBadge kind="locked" /> : null}
            <Badge className="bg-white/5 text-slate-300">{topic.board}</Badge>
          </div>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-white" id={`${topic.id}-title`}>
            {topic.title}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{topic.excerpt}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2">
              <Avatar
                alt={`${topic.author.name} topic author avatar`}
                name={topic.author.name}
                size="sm"
                src={topic.author.avatar}
                status={topic.author.status}
              />
              <span>
                <span className="font-medium text-slate-200">{topic.author.name}</span>
                <span className="mx-2 text-slate-500">•</span>
                {topic.author.role}
              </span>
            </div>
            <span>{topic.createdAt}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 lg:grid-cols-1">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Replies</dt>
            <dd className="mt-2 font-display text-3xl font-semibold text-white">{topic.replies}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Views</dt>
            <dd className="mt-2 font-display text-3xl font-semibold text-white">{topic.views}</dd>
          </div>
        </dl>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
          <div className="mt-4 flex items-center gap-3">
            <Avatar
              alt={`${topic.latestActivity.member.name} recent activity avatar`}
              name={topic.latestActivity.member.name}
              size="sm"
              src={topic.latestActivity.member.avatar}
              status={topic.latestActivity.member.status}
            />
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">
                {topic.latestActivity.action} <span className="font-medium">{topic.latestActivity.member.name}</span>
              </p>
              <p className="mt-1 text-sm text-slate-400">{topic.latestActivity.time}</p>
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

function ThreadPost({ entry }: { entry: ThreadEntry }) {
  return (
    <Card as="article" className={`p-6 ${entry.highlighted ? 'border-blue-400/30 bg-blue-400/5' : ''}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar
            alt={`${entry.author.name} discussion avatar`}
            name={entry.author.name}
            ringTone={entry.highlighted ? 'blue' : 'violet'}
            size="md"
            src={entry.author.avatar}
            status={entry.author.status}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{entry.author.name}</h3>
              <Badge className="bg-white/5 text-slate-300">{entry.author.role}</Badge>
              {entry.label ? <Badge className="bg-blue-400/10 text-blue-200">{entry.label}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {entry.author.handle} · {entry.createdAt}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
        {entry.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </Card>
  );
}

const meta = {
  title: 'Game Hub/Community Forums',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

export const BoardOverview = {
  name: 'Board overview',
  render: () => (
    <StorySurface
      eyebrow="Per-game community boards"
      title="Message boards can feel alive, structured, and avatar-driven without any backend hookup"
      description="This UI-only forum overview highlights topic lists, pinned and locked states, author identity, reply counts, and recent activity for a per-game community surface."
      maxWidthClassName="max-w-7xl"
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card as="section" className="overflow-hidden p-0">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.16),_transparent_35%)] px-6 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-blue-400/10 text-blue-200">Board spotlight</Badge>
              <Badge className="bg-white/5 text-slate-200">{featuredGame.title}</Badge>
            </div>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white">
              {featuredGame.title} community forum
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Strategy guides, challenge-night coordination, and pinned moderation notes all need strong information
              scent before a player clicks into a thread.
            </p>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_10rem_14rem] gap-5 border-b border-white/10 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid">
            <span>Topic</span>
            <span>Engagement</span>
            <span>Recent activity</span>
          </div>

          <ul className="divide-y divide-white/10">
            {forumTopics.map((topic) => (
              <TopicRow key={topic.id} topic={topic} />
            ))}
          </ul>
        </Card>

        <div className="grid gap-6">
          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Board health</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              {[
                ['128', 'Open topics this week'],
                ['19', 'Pinned resources'],
                ['4m', 'Median first reply time'],
              ].map(([value, label]) => (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={label}>
                  <p className="font-display text-3xl font-semibold text-white">{value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Posting guidance</p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
              <li>Use pinned threads for route docs, patch notes, and official moderation updates.</li>
              <li>Keep locked topics readable and visually distinct so resolved issues are easy to scan.</li>
              <li>Always pair thread metadata with an author avatar to maintain trust and social continuity.</li>
            </ul>
          </Card>

          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recently active members</p>
            <div className="mt-5 space-y-4">
              {[members.ari, members.june, members.parker, members.mina].map((member) => (
                <div className="flex items-center gap-4" key={member.handle}>
                  <Avatar
                    alt={`${member.name} recent member avatar`}
                    name={member.name}
                    size="md"
                    src={member.avatar}
                    status={member.status}
                  />
                  <div>
                    <p className="font-medium text-white">{member.name}</p>
                    <p className="text-sm text-slate-400">{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </StorySurface>
  ),
};

export const DiscussionThread = {
  name: 'Discussion thread',
  render: () => (
    <StorySurface
      eyebrow="Per-game community boards"
      title="Discussion threads need clear authorship, readable reply history, and an accessible composer"
      description="This representative thread shows a pinned strategy topic with recent replies and a UI-only composer for adding another response."
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.36fr]">
        <div className="space-y-6">
          <Card as="section" className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StateBadge kind="pinned" />
              <Badge className="bg-white/5 text-slate-200">{featuredGame.title} · Strategy Desk</Badge>
              <Badge className="bg-emerald-400/10 text-emerald-200">Open for replies</Badge>
            </div>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white">
              Weekly gauntlet route notes for {featuredGame.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Players can review the original route, inspect the reply timeline, and add their own refinement in one
              continuous forum surface.
            </p>
          </Card>

          {threadEntries.map((entry) => (
            <ThreadPost entry={entry} key={`${entry.author.handle}-${entry.createdAt}`} />
          ))}

          <Card as="section" className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl font-semibold text-white">Reply composer</h3>
                <p className="mt-2 text-sm text-slate-400" id="reply-composer-help">
                  UI-only example. Labels, helper text, and keyboard focus are included, but no forum API behavior is
                  wired up.
                </p>
              </div>
              <Badge className="bg-white/5 text-slate-200">Reuses avatar grounding</Badge>
            </div>

            <form className="mt-6 space-y-5" onSubmit={(event) => event.preventDefault()}>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-4">
                  <Avatar
                    alt={`${members.kai.name} reply composer avatar`}
                    name={members.kai.name}
                    size="md"
                    src={members.kai.avatar}
                    status={members.kai.status}
                  />
                  <div>
                    <p className="font-medium text-white">Posting as {members.kai.name}</p>
                    <p className="text-sm text-slate-400">
                      {members.kai.handle} · {members.kai.role}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white" htmlFor="reply-title">
                  Short reply title
                </label>
                <input
                  aria-describedby="reply-composer-help"
                  className="mt-2 block w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  defaultValue="Safer controller-friendly version"
                  id="reply-title"
                  type="text"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white" htmlFor="reply-body">
                  Reply body
                </label>
                <textarea
                  aria-describedby="reply-composer-help"
                  className="mt-2 block min-h-40 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm leading-7 text-slate-100 placeholder:text-slate-500"
                  defaultValue="I tested the slower checkpoint-two turn on controller and it felt much easier to recover from. Posting my split notes here so newer players can learn the route without needing leaderboard pace right away."
                  id="reply-body"
                />
              </div>

              <div className="flex flex-wrap items-start gap-4">
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <input
                    className="mt-1 rounded border-white/15 bg-slate-950 text-blue-400"
                    defaultChecked
                    type="checkbox"
                  />
                  <span>Notify me when someone replies to this thread.</span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <input className="mt-1 rounded border-white/15 bg-slate-950 text-blue-400" type="checkbox" />
                  <span>Mark this as a route refinement for quick moderator review.</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-slate-400">
                  Formatting tools, drafts, and attachments would layer on later.
                </p>
                <div className="flex gap-3">
                  <Button type="button" variant="ghost">
                    Save draft
                  </Button>
                  <Button type="submit" variant="primary">
                    Post reply
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thread metadata</p>
            <dl className="mt-5 space-y-4 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">Replies</dt>
                <dd className="mt-1 font-display text-3xl font-semibold text-white">27</dd>
              </div>
              <div>
                <dt className="text-slate-500">Watching</dt>
                <dd className="mt-1 font-display text-3xl font-semibold text-white">84</dd>
              </div>
              <div>
                <dt className="text-slate-500">Latest update</dt>
                <dd className="mt-1">12 minutes ago by {members.parker.name}</dd>
              </div>
            </dl>
          </Card>

          <Card as="section" className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
            <div className="mt-5 space-y-4">
              {[members.parker, members.kai, members.noah].map((member, index) => (
                <div className="flex items-center gap-4" key={member.handle}>
                  <Avatar
                    alt={`${member.name} recent thread activity avatar`}
                    name={member.name}
                    size="sm"
                    src={member.avatar}
                    status={member.status}
                  />
                  <div>
                    <p className="text-sm text-slate-200">{member.name}</p>
                    <p className="text-sm text-slate-400">
                      {index === 0
                        ? 'Shared a safer route variant'
                        : index === 1
                          ? 'Asked for controller timings'
                          : 'Linked tonight’s bracket thread'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </StorySurface>
  ),
};
