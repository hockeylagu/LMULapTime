import { useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { ReplayFullscreenControlsContext } from '../../inspector/replayFullscreenControls.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

interface Props { primaryLapNumber?: number; baselineLapNumber?: number }

/** The column headers are the lap controls; selected times appear only in the timing rows. */
export function GpsMapLapSelectors({ primaryLapNumber, baselineLapNumber }: Props) {
  const selection = useContext(ReplayFullscreenControlsContext);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    (menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLButtonElement>('button'))?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    // Capture: map overlays stop pointerdown propagation, so a bubbling listener would miss them.
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const columns = 'grid grid-cols-[28px_1fr_1fr_68px] items-center gap-2 px-3 pb-2 text-[10px] text-lmu-muted';
  if (!selection) return baselineLapNumber !== undefined ? <div className={columns}>
    <span /><span>Primary · L{primaryLapNumber ?? '—'}</span><span>Baseline · L{baselineLapNumber}</span><span className="text-right">Delta</span>
  </div> : null;
  const { primary, baseline, onOpenBaselinePicker } = selection;
  const buttonClass = `flex h-7 w-full items-center justify-between gap-1 rounded px-1 text-[11px] text-lmu-text-soft hover:bg-lmu-raised hover:text-lmu-text disabled:text-lmu-faint ${FOCUS_RING}`;
  const errors = [primary, baseline].filter(choice => choice?.error);
  const loading = primary.isLoading ? 'primary' : baseline?.isLoading ? 'baseline' : null;
  return <div className={columns}>
    <span />
    <div ref={containerRef} className="relative min-w-0" onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }}>
      <button ref={triggerRef} type="button" aria-label="Change primary lap" aria-haspopup="menu" aria-expanded={open}
        aria-busy={primary.isLoading} disabled={primary.isLoading || primary.laps.length === 0}
        className={buttonClass} onClick={() => setOpen(value => !value)}>
        <span className="truncate">Primary L{primary.lapNumber ?? '—'}</span>
        {primary.isLoading ? <LoaderCircle size={12} className="shrink-0 animate-spin" /> : <ChevronDown size={12} className="shrink-0" />}
      </button>
      {open && <div ref={menuRef} role="menu" aria-label="Primary laps"
        className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-lmu-border bg-lmu-strip p-1 shadow-xl"
        onKeyDown={event => {
          const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
          const current = options.indexOf(document.activeElement as HTMLButtonElement);
          const target = event.key === 'ArrowDown' ? (current + 1) % options.length : event.key === 'ArrowUp' ? (current - 1 + options.length) % options.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
          if (target >= 0) { event.preventDefault(); event.stopPropagation(); options[target]?.focus(); }
          if (event.key === 'Tab') setOpen(false);
        }}>
        {primary.laps.map(lap => <button key={lap.lapNumber} type="button" role="menuitemradio" aria-checked={lap.lapNumber === primary.lapNumber}
          className={`flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-xs hover:bg-lmu-raised ${lap.lapNumber === primary.lapNumber ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-text-soft'} ${FOCUS_RING}`}
          onClick={() => { setOpen(false); triggerRef.current?.focus(); primary.onSelect(lap.lapNumber); }}>
          <span>Lap {lap.lapNumber}{lap.isOutLap ? ' · Out' : lap.isBest ? ' · Best' : ''}</span><span className="font-mono">{formatTime(lap.lapTimeSec)}</span>
        </button>)}
      </div>}
    </div>
    <button type="button" aria-label="Change baseline lap" aria-haspopup="dialog" aria-busy={baseline?.isLoading ?? false}
      disabled={primary.isLoading || baseline?.isLoading} className={buttonClass} onClick={onOpenBaselinePicker}>
      <span className="truncate">{baseline ? `Baseline L${baseline.lapNumber ?? '—'}` : 'Compare'}</span>
      {baseline?.isLoading ? <LoaderCircle size={12} className="shrink-0 animate-spin" /> : <ChevronDown size={12} className="shrink-0" />}
    </button>
    <span className="text-right">{baseline ? 'Delta' : ''}</span>
    {/* Always mounted: a live region inserted together with its text is often not announced. */}
    <p role="status" className={loading ? 'col-span-4' : 'sr-only'}>{loading && `Loading ${loading} lap…`}</p>
    {errors.map((choice, index) => choice && <div key={index} role="alert" className="col-span-4 text-lmu-loss-soft">
      {choice.error}<button type="button" className={`ml-1 underline ${FOCUS_RING}`} onClick={choice.onRetry}>Try again</button>
    </div>)}
  </div>;
}
