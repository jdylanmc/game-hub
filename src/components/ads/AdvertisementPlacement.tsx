import { useId } from 'react';

export type AdvertisementPlacementState = 'loading' | 'populated' | 'unavailable';
export type AdvertisementPlacementVariant = 'detail-banner';

interface AdvertisementPlacementProps {
  className?: string;
  placement?: AdvertisementPlacementVariant;
  state?: AdvertisementPlacementState;
}

const placements: Record<AdvertisementPlacementVariant, { slotClassName: string; sizeLabel: string }> = {
  'detail-banner': {
    slotClassName: 'h-[144px] sm:h-[136px] lg:h-[144px]',
    sizeLabel: 'Mobile 320×50 · Desktop 728×90',
  },
};

export function AdvertisementPlacement({
  className = '',
  placement = 'detail-banner',
  state = 'populated',
}: AdvertisementPlacementProps) {
  const titleId = useId();
  const descriptionId = useId();
  const placementConfig = placements[placement];

  return (
    <aside
      aria-busy={state === 'loading'}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={`mx-auto flex w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-slate-950/55 shadow-sm ${placementConfig.slotClassName} ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400" id={titleId}>
          Advertisement
        </p>
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{placementConfig.sizeLabel}</span>
      </div>

      <div className="flex-1 p-4 sm:p-5">
        {state === 'populated' ? (
          <div className="grid h-full grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-dashed border-white/10 bg-slate-900/80 px-4 py-3">
            <div className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-xl border border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Ad
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">Neutral sponsor placeholder</p>
              <p className="mt-1 text-xs leading-5 text-slate-400" id={descriptionId}>
                Reserved slot · no SDK yet · gameplay stays primary
              </p>
            </div>
          </div>
        ) : null}

        {state === 'loading' ? (
          <div
            aria-live="polite"
            className="grid h-full grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-4 rounded-xl border border-dashed border-white/10 bg-slate-900/80 px-4 py-3"
            role="status"
          >
            <div aria-hidden="true" className="h-[3.25rem] w-[3.25rem] animate-pulse rounded-xl bg-white/10" />
            <div className="space-y-3" id={descriptionId}>
              <div aria-hidden="true" className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
              <div aria-hidden="true" className="h-3 w-48 max-w-full animate-pulse rounded-full bg-white/10" />
              <span className="sr-only">Advertisement is loading inside reserved layout space.</span>
            </div>
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-900/80 px-4 py-3 text-center sm:px-6">
            <div className="max-w-xl">
              <p className="text-sm font-medium text-slate-200">Advertisement unavailable</p>
              <p className="mt-1 text-xs leading-5 text-slate-400" id={descriptionId}>
                Reserved slot stays in place until campaign creative is ready.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
