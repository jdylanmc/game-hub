import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { StorySurface } from '../../storybook/StorySurface';
import { mambaCategorySummaries, mambaSourceMeta } from '../../storybook/mamba/generated/index.generated';

const meta = {
  title: 'Catalog/Mamba/Overview',
  parameters: {
    backgrounds: {
      default: 'game-hub-dark',
    },
  },
};

export default meta;

export const Overview = {
  name: 'Overview',
  render: () => (
    <StorySurface
      eyebrow="Generated snapshot catalog"
      title="Complete Mamba UI component coverage for Game Hub Storybook"
      description="This catalog checks in both the upstream variant source snapshots and the generated React-friendly renderings so reviewers do not need the original Angular checkout to inspect visual changes."
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card as="section" className="p-6">
          <div className="flex flex-wrap gap-3">
            <Badge>{mambaSourceMeta.componentVariantCount} variants</Badge>
            <Badge>{mambaSourceMeta.componentCategoryCount} categories</Badge>
            <Badge>Mamba UI {mambaSourceMeta.version}</Badge>
          </div>
          <dl className="mt-6 space-y-4 text-sm text-slate-300">
            <div>
              <dt className="text-slate-500">Source commit</dt>
              <dd className="mt-1 font-mono text-xs text-slate-200">{mambaSourceMeta.commit}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source date</dt>
              <dd className="mt-1">{mambaSourceMeta.commitDate}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generation</dt>
              <dd className="mt-1">{mambaSourceMeta.generatedAt}</dd>
            </div>
          </dl>
          <p className="mt-6 text-sm leading-7 text-slate-400">
            Angular bindings, loops, and theme tokens are resolved ahead of time into static React-renderable HTML
            snapshots. Interactive upstream behaviors remain visual-only.
          </p>
        </Card>

        <Card as="section" className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Component categories</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {mambaCategorySummaries.map((category) => (
              <Badge className="bg-white/10 text-slate-100" key={category.slug}>
                {category.title} · {category.variantCount}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card as="section" className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Start here</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              'Catalog/Mamba Highlights → Reviews & social proof',
              'Catalog/Mamba Highlights → Navigation & menus',
              'Catalog/Mamba/Review',
              'Catalog/Mamba/Header',
              'Catalog/Mamba/Sidebar',
              'Catalog/Mamba/Tabs',
              'Catalog/Mamba/Breadcrumb',
              'Catalog/Mamba/Pagination',
            ].map((path) => (
              <Badge className="bg-blue-400/10 text-blue-200" key={path}>
                {path}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Review and navigation primitives are intentionally surfaced first because they map most directly to Game Hub
            trust, browsing, and menu flows.
          </p>
        </Card>

        <Card as="section" className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Marketing overlays</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {[
              'Game Hub/Marketing → Homepage composition',
              'Catalog/Mamba/Hero',
              'Catalog/Mamba/Call to Action',
              'Catalog/Mamba/Feature',
              'Catalog/Mamba/Gallery',
              'Catalog/Mamba/Stats',
              'Catalog/Mamba/Testimonial',
              'Catalog/Mamba/Pricing',
            ].map((path) => (
              <Badge className="bg-white/10 text-slate-100" key={path}>
                {path}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            The curated Game Hub marketing story demonstrates how the most relevant Mamba homepage building blocks can
            compose a browse-first landing page without removing any of the canonical snapshot stories.
          </p>
        </Card>
      </div>
    </StorySurface>
  ),
};
