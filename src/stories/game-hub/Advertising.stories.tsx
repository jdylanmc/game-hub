import { AdvertisementPlacement, type AdvertisementPlacementState } from '../../components/ads/AdvertisementPlacement';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StorySurface } from '../../storybook/StorySurface';
import { featuredStorybookGame } from '../../storybook/gameHubFixtures';

const integrationRules = [
  'Always keep the outer slot dimensions stable so the game canvas and score callouts never shift.',
  'Render future ad network or direct-sales creative inside the reserved inner boundary only.',
  'Keep the visible “Advertisement” label and neutral treatment so no sponsored slot can be mistaken for gameplay UI.',
];

const meta = {
  title: 'Game Hub/Advertising',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

function StateShowcase({
  description,
  eyebrow,
  state,
  title,
}: {
  description: string;
  eyebrow: string;
  state: AdvertisementPlacementState;
  title: string;
}) {
  return (
    <StorySurface description={description} eyebrow={eyebrow} maxWidthClassName="max-w-5xl" title={title}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <AdvertisementPlacement state={state} />
        <Card as="section" className="h-fit p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Future integration boundary</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Plug a future advertising provider into the reserved inner shell only. Keep the label, slot height, and
            subdued container chrome unchanged.
          </p>
        </Card>
      </div>
    </StorySurface>
  );
}

export const GameDetailsPlacement = {
  name: 'Game details placement',
  render: () => (
    <StorySurface
      description="A reserved sponsor slot sits below gameplay and above community content so monetization never competes with the active game canvas."
      eyebrow="Monetization study"
      maxWidthClassName="max-w-7xl"
      title="Advertising stays clearly labeled and visually secondary"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card as="section" className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <Badge className="bg-blue-400/10 text-blue-200">Game details page excerpt</Badge>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {featuredStorybookGame.title}
            </h2>
            <p className="mt-4 max-w-3xl leading-7 text-slate-400">{featuredStorybookGame.description}</p>
          </div>

          <div className="px-6 py-6 sm:px-8">
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-blue-500/5">
              <div
                className="grid min-h-[20rem] place-items-center rounded-[1.4rem] border border-dashed border-white/10 px-6 text-center"
                style={{
                  background: `radial-gradient(circle at top, ${featuredStorybookGame.accent}22, transparent 45%), linear-gradient(180deg, rgba(15,23,42,0.94), rgba(2,6,23,0.98))`,
                }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Gameplay canvas</p>
                  <p className="mt-4 font-display text-3xl font-semibold text-white">
                    Primary play surface stays dominant
                  </p>
                  <p className="mt-4 max-w-2xl leading-7 text-slate-300">
                    The ad placement sits outside the active canvas and uses muted framing so the sponsored area never
                    imitates gameplay controls or score feedback.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              Example game details canvas wrapper with stable sponsor placement below.
            </p>

            <AdvertisementPlacement className="mt-6" state="populated" />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Card as="section" className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Community handoff</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Community threads, ratings, and friend activity remain directly below the reserved sponsor slot.
                </p>
              </Card>
              <Card as="section" className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Placeholder behavior</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Until an SDK arrives, a neutral placeholder communicates the integration boundary without creating
                  deceptive calls to action.
                </p>
              </Card>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card as="section" className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Future integration boundary
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              {integrationRules.map((rule) => (
                <li className="flex gap-3" key={rule}>
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-300" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card as="section" className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Visual constraints</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Use muted borders, neutral copy, and obvious labeling. The sponsor slot should feel present but
              subordinate next to the game art, canvas, and social proof.
            </p>
            <Button className="mt-5" variant="secondary">
              Review monetization guidelines
            </Button>
          </Card>
        </div>
      </div>
    </StorySurface>
  ),
};

export const Populated = {
  render: () => (
    <StateShowcase
      description="Representative neutral placeholder content shows the reserved sponsor slot after a future integration supplies creative."
      eyebrow="Advertising states"
      state="populated"
      title="Populated advertisement placeholder"
    />
  ),
};

export const Loading = {
  render: () => (
    <StateShowcase
      description="A skeleton preserves the exact banner footprint while a future ad request resolves, preventing cumulative layout shift."
      eyebrow="Advertising states"
      state="loading"
      title="Loading advertisement slot"
    />
  ),
};

export const Unavailable = {
  name: 'Empty or unavailable',
  render: () => (
    <StateShowcase
      description="If no campaign is available, the slot stays reserved and clearly labeled instead of collapsing the surrounding layout."
      eyebrow="Advertising states"
      state="unavailable"
      title="Unavailable advertisement slot"
    />
  ),
};
