import { useId } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReplayLapSummary } from '../../../../../shared/types/index.js';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { useStoredToggle } from '../useStoredToggle.js';
import { GpsMapLapSelectors, lapTimingColumns } from './GpsMapLapSelectors.js';
import type { LiveSectorSplit } from './liveSectorSplit.js';

export interface GpsMapLapTimingPanelProps {
  primaryLapSummary?: ReplayLapSummary;
  baselineLapSummary?: ReplayLapSummary;
  liveSplit?: LiveSectorSplit | null;
  className?: string;
}

const deltaColor = (delta: number | null) => delta === null ? 'text-lmu-muted'
  : delta < 0 ? 'text-lmu-gain' : delta > 0 ? 'text-lmu-loss' : 'text-lmu-text-soft';
const signed = (delta: number) => `${delta > 0 ? '+' : ''}${delta.toFixed(3)}s`;

/** Recorded whole-lap and individual sector times, plus the live change within the cursor's sector. */
export function GpsMapLapTimingPanel({ primaryLapSummary: primary, baselineLapSummary: baseline, liveSplit, className }: GpsMapLapTimingPanelProps) {
  const [collapsed, toggleCollapsed] = useStoredToggle('lmu-map-timing-collapsed-v1', false);
  const id = useId();
  const rows = [
    { label: 'Lap', value: primary?.lapTimeSec, baseline: baseline?.lapTimeSec },
    { label: 'S1', value: primary?.s1Sec, baseline: baseline?.s1Sec },
    { label: 'S2', value: primary?.s2Sec, baseline: baseline?.s2Sec },
    { label: 'S3', value: primary?.s3Sec, baseline: baseline?.s3Sec },
  ];
  const currentLabel = liveSplit ? `S${liveSplit.sector}` : null;
  return <aside aria-label="Lap and sector timing" data-map-control
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    className={`pointer-events-auto w-[340px] max-w-full rounded-xl bg-lmu-strip/95 border border-lmu-border ${className ?? '2xl:absolute 2xl:right-0 2xl:top-13'}`}>
    {/* One header line: the collapse toggle fills the row-label column, the lap selectors sit over their times. */}
    <GpsMapLapSelectors primaryLapNumber={primary?.lapNumber} baselineLapNumber={baseline?.lapNumber}
      toggle={<button type="button" aria-label="Timing" title={collapsed ? 'Show timing' : 'Hide timing'}
        aria-expanded={!collapsed} aria-controls={id} onClick={toggleCollapsed}
        className={`-ml-1 flex h-7 w-7 items-center justify-center rounded text-lmu-muted hover:bg-lmu-raised hover:text-lmu-text ${FOCUS_RING}`}>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>} />
    {/* Stays mounted so the toggle's aria-controls always resolves; the lap selectors above stay usable. */}
    <div id={id} hidden={collapsed} className="px-3 pb-2">
      {rows.map(row => {
        const hasValue = typeof row.value === 'number' && Number.isFinite(row.value) && row.value > 0;
        const hasBaseline = typeof row.baseline === 'number' && Number.isFinite(row.baseline) && row.baseline > 0;
        const delta = hasValue && hasBaseline ? row.value! - row.baseline! : null;
        const isCurrent = row.label === currentLabel;
        return <div key={row.label} data-current-sector={isCurrent ? '' : undefined}
          className={`-mx-1.5 grid items-baseline gap-2 rounded border-t border-lmu-border px-1.5 py-2 ${isCurrent ? 'bg-lmu-raised/60' : ''} ${lapTimingColumns(Boolean(baseline))}`}>
          <span className={`text-[11px] ${isCurrent ? 'font-semibold text-lmu-text' : 'text-lmu-muted'}`} title={isCurrent ? 'The sector the cursor is in' : undefined}>{row.label}</span>
            <span className="font-mono text-xs font-semibold text-lmu-text" title="Primary replay GPS timing">
              {hasValue ? row.label === 'Lap' ? formatTime(row.value) : `${row.value!.toFixed(3)}s` : '--'}
            </span>
            {baseline && <span className="font-mono text-xs font-semibold text-lmu-text-soft" title="Baseline replay GPS timing">
              {hasBaseline ? row.label === 'Lap' ? formatTime(row.baseline) : `${row.baseline!.toFixed(3)}s` : '--'}
            </span>}
            {baseline && <span title="Primary minus baseline; negative is faster." className={`text-right font-mono text-[11px] ${deltaColor(delta)}`}>
              {delta === null ? '--' : signed(delta)}
            </span>}
        </div>;
      })}
      {liveSplit && baseline && <p className="flex items-baseline justify-between border-t border-lmu-border pt-2 text-[11px] text-lmu-muted"
        title="Live delta now minus the live delta at this sector's start line; negative is time gained.">
        <span>{currentLabel} so far</span>
        <span className={`font-mono ${deltaColor(liveSplit.deltaSec)}`}>{liveSplit.deltaSec === null ? '--' : signed(liveSplit.deltaSec)}</span>
      </p>}
      {!primary && <p className="text-[11px] text-lmu-muted">Lap timing unavailable.</p>}
      {primary?.isOutLap && <span className="text-[10px] text-lmu-warn">Out-lap</span>}
    </div>
  </aside>;
}
