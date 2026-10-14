import { useContext, useRef, type ReactNode } from 'react';
import { ChevronDown, LoaderCircle, Plus, X } from 'lucide-react';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { ReplayFullscreenControlsContext } from '../../inspector/replayFullscreenControls.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../../common/buttonStyles.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { Select } from '../../../common/dropdown/Select.js';
import { DROPDOWN_CHEVRON, DROPDOWN_TRIGGER } from '../../../common/dropdown/dropdownStyles.js';

interface Props { primaryLapNumber?: number; baselineLapNumber?: number; /** Fills the label column, so the header row has no empty corner. */ toggle?: ReactNode }

/** Shared with the timing rows, so each selector sits over its own data column. */
export const lapTimingColumns = (hasBaseline: boolean) => hasBaseline
  ? 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_68px]' : 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)]';

/**
 * Role and lap number on one line: the role truncates first, the lap number stays. While comparing, the columns are too
 * narrow for both roles, so a dot in the lap's map colour stands in for the role (still read out to screen readers).
 */
const lapTriggerText = (role: string, lapNumber: number | null | undefined, color?: string) => <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
  {color ? <><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="sr-only">{role} </span></>
    : <><span className="truncate">{role}</span>{' '}</>}<span className="shrink-0 font-mono">L{lapNumber ?? '—'}</span>
</span>;

/** The column headers are the lap controls; selected times appear only in the timing rows. */
export function GpsMapLapSelectors({ primaryLapNumber, baselineLapNumber, toggle }: Props) {
  const selection = useContext(ReplayFullscreenControlsContext);
  const baselineTriggerRef = useRef<HTMLButtonElement>(null);
  const columns = `grid ${lapTimingColumns(Boolean(selection?.baseline) || baselineLapNumber !== undefined)} items-center gap-2 px-3 py-2 text-[10px] text-lmu-muted`;
  if (!selection) return <div className={columns}>
    {toggle ?? <span />}<span>Primary · L{primaryLapNumber ?? '—'}</span>
    {baselineLapNumber !== undefined && <><span>Baseline · L{baselineLapNumber}</span><span className="text-right">Delta</span></>}
  </div>;
  const { primary, baseline, onOpenBaselinePicker, onRemoveBaseline } = selection;
  const errors = [primary, baseline].filter(choice => choice?.error);
  const loading = primary.isLoading ? 'primary' : baseline?.isLoading ? 'baseline' : null;
  return <div className={columns}>
    {toggle ?? <span />}
    <Select<number> aria-label="Change primary lap" value={primary.lapNumber ?? null} onChange={primary.onSelect}
      busy={primary.isLoading} disabled={primary.isLoading || primary.laps.length === 0}
      className="w-full" panelClassName="w-64" title="Change primary lap"
      renderValue={() => lapTriggerText('Primary', primary.lapNumber, baseline ? TELEMETRY_COLORS.primary : undefined)}
      options={primary.laps.map(lap => ({
        value: lap.lapNumber,
        label: `Lap ${lap.lapNumber}${lap.isOutLap ? ' · Out' : lap.isBest ? ' · Best' : ''}`,
        detail: formatTime(lap.lapTimeSec),
      }))} />
    {/* The remove action sits beside the baseline it removes, keeping the Delta header over its values. */}
    <div className="flex min-w-0 items-center gap-0.5">
    <button ref={baselineTriggerRef} type="button" aria-label="Change baseline lap" aria-haspopup="dialog" aria-busy={baseline?.isLoading ?? false}
      disabled={primary.isLoading || baseline?.isLoading} className={baseline ? `${DROPDOWN_TRIGGER} min-w-0 flex-1 justify-between` : `${SECONDARY_BUTTON} justify-self-start`} onClick={onOpenBaselinePicker}>
      {/* No comparison yet: an action button, not a dropdown; once chosen it becomes the baseline lap selector. */}
      {baseline ? lapTriggerText('Baseline', baseline.lapNumber, TELEMETRY_COLORS.baseline) : <><Plus aria-hidden="true" size={12} />Compare</>}
      {baseline?.isLoading ? <LoaderCircle aria-hidden="true" className={`${DROPDOWN_CHEVRON} animate-spin`} /> : baseline && <ChevronDown aria-hidden="true" className={DROPDOWN_CHEVRON} />}
    </button>
    {baseline && onRemoveBaseline && <button type="button" aria-label="Remove comparison lap" title="Remove comparison lap"
      className={`flex h-8 w-6 shrink-0 items-center justify-center rounded text-lmu-muted hover:bg-lmu-raised hover:text-lmu-text ${FOCUS_RING}`}
      onClick={() => { onRemoveBaseline(); baselineTriggerRef.current?.focus(); }}><X size={12} /></button>}
    </div>
    {baseline && <span className="text-right">Delta</span>}
    {/* Always mounted: a live region inserted together with its text is often not announced. */}
    <p role="status" className={loading ? 'col-span-full' : 'sr-only'}>{loading && `Loading ${loading} lap…`}</p>
    {errors.map((choice, index) => choice && <div key={index} role="alert" className="col-span-full text-lmu-loss-soft">
      {choice.error}<button type="button" className={`ml-1 underline ${FOCUS_RING}`} onClick={choice.onRetry}>Try again</button>
    </div>)}
  </div>;
}
