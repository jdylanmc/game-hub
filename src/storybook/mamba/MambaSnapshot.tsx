import type { MambaVariantEntry } from './types';

interface MambaSnapshotProps {
  entry: MambaVariantEntry;
}

export function MambaSnapshot({ entry }: MambaSnapshotProps) {
  return (
    <section className="px-6 py-8 md:px-10" aria-label={`${entry.storyName} Mamba UI snapshot`}>
      <div className="overflow-hidden rounded-[2rem] border border-slate-300/15 bg-white/[0.03] shadow-2xl shadow-black/20 backdrop-blur-sm">
        <div className="overflow-x-auto p-6 md:p-8">
          <div className={entry.centered ? 'flex justify-center' : undefined}>
            <div className="min-w-0" dangerouslySetInnerHTML={{ __html: entry.renderedHtml }} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Source snapshot: {entry.sourceHtmlPath.replace('src/storybook/mamba/source/', '')}
      </p>
    </section>
  );
}
