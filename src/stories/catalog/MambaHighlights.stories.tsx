import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { StorySurface } from '../../storybook/StorySurface';
import { breadcrumbCategory } from '../../storybook/mamba/generated/breadcrumb.generated';
import { headerCategory } from '../../storybook/mamba/generated/header.generated';
import { paginationCategory } from '../../storybook/mamba/generated/pagination.generated';
import { reviewCategory } from '../../storybook/mamba/generated/review.generated';
import { sidebarCategory } from '../../storybook/mamba/generated/sidebar.generated';
import { tabsCategory } from '../../storybook/mamba/generated/tabs.generated';
import type { MambaVariantEntry } from '../../storybook/mamba/types';

interface HighlightCardProps {
  canonicalPath: string;
  className?: string;
  entry: MambaVariantEntry;
  notes: string;
  title: string;
}

function HighlightCard({
  canonicalPath,
  className = '',
  entry,
  notes,
  title,
}: HighlightCardProps) {
  return (
    <Card as="article" className={`overflow-hidden p-0 ${className}`}>
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-blue-400/10 text-blue-200">{title}</Badge>
          <span className="text-xs text-slate-500">{canonicalPath}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">{notes}</p>
      </div>
      <div className="overflow-x-auto p-5">
        <div className={entry.centered ? 'flex justify-center' : undefined}>
          <div
            className="min-w-0"
            dangerouslySetInnerHTML={{ __html: entry.renderedHtml }}
          />
        </div>
      </div>
    </Card>
  );
}

const meta = {
  title: 'Catalog/Mamba Highlights',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

export const ReviewsAndSocialProof = {
  name: 'Reviews & social proof',
  render: () => (
    <StorySurface
      eyebrow="Priority Mamba surfaces"
      title="Review components are called out first because trust and sentiment are core to Game Hub"
      description="These highlight cards surface the upstream Mamba review variants before the full catalog, while preserving the canonical stories under Catalog/Mamba/Review."
      maxWidthClassName="max-w-6xl"
    >
      <Card as="section" className="mb-6 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Canonical path
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {reviewCategory.variants.map((entry) => (
            <Badge className="bg-white/10 text-slate-100" key={entry.id}>
              Catalog/Mamba/Review → {entry.storyName}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <HighlightCard
          canonicalPath="Catalog/Mamba/Review → review1"
          className="lg:col-span-2"
          entry={reviewCategory.variants[0]}
          notes="A classic author-plus-rating composition that maps naturally to community reviews, creator spotlights, and editorial endorsements."
          title="Narrative review card"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Review → review2"
          entry={reviewCategory.variants[1]}
          notes="Useful for direct post-session feedback prompts, lightweight satisfaction surveys, and quick rate-your-run touch points."
          title="Inline feedback prompt"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Review → review3"
          entry={reviewCategory.variants[2]}
          notes="A strong ratings summary treatment for aggregate sentiment, featured quotes, and score-distribution modules on game pages."
          title="Ratings summary"
        />
      </div>
    </StorySurface>
  ),
};

export const NavigationAndMenus = {
  name: 'Navigation & menus',
  render: () => (
    <StorySurface
      eyebrow="Priority Mamba surfaces"
      title="Menu and navigation building blocks stay near the top of Storybook on purpose"
      description="Headers, tabs, breadcrumbs, sidebars, and pagination are surfaced here first so the discovery paths for browsing games, collections, and creator spaces stay easy to find."
      maxWidthClassName="max-w-7xl"
    >
      <Card as="section" className="mb-6 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Quick-find lanes
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {[
            'Catalog/Mamba/Header',
            'Catalog/Mamba/Sidebar',
            'Catalog/Mamba/Tabs',
            'Catalog/Mamba/Breadcrumb',
            'Catalog/Mamba/Pagination',
          ].map((path) => (
            <Badge className="bg-white/10 text-slate-100" key={path}>
              {path}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <HighlightCard
          canonicalPath="Catalog/Mamba/Header → header1"
          className="xl:col-span-3"
          entry={headerCategory.variants[0]}
          notes="Primary top-level navigation for the eventual browsing homepage, spotlighting category tabs, account actions, and responsive collapse behavior."
          title="Homepage header"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Sidebar → sidebar2"
          entry={sidebarCategory.variants[1]}
          notes="A denser menu rail for profile hubs, creator dashboards, library filters, or any authenticated home where persistent navigation matters."
          title="Dashboard sidebar"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Tabs → tabs2"
          entry={tabsCategory.variants[1]}
          notes="Great for switching between featured, trending, friends, and recent game lanes without leaving the current browsing surface."
          title="Category tabs"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Breadcrumb → breadcrumb2"
          entry={breadcrumbCategory.variants[1]}
          notes="Useful for nested discovery paths such as Home → Collections → Co-op Night or Browse → Genre → Puzzle."
          title="Breadcrumb trail"
        />
        <HighlightCard
          canonicalPath="Catalog/Mamba/Pagination → pagination3"
          className="xl:col-span-3"
          entry={paginationCategory.variants[2]}
          notes="Longer results sets still benefit from an explicit page model when users are scanning large catalogs, review archives, or creator lists."
          title="Paginated browse state"
        />
      </div>
    </StorySurface>
  ),
};
