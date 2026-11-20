import React, { useState } from 'react';
import { Route } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { CornerHabitLine } from './CornerHabitLine.js';
import { CornerTrendsHeader } from './CornerTrendsHeader.js';
import { CornerTrendSparkline, SPARKLINE_BOX } from './CornerTrendSparkline.js';
import {
  LAP_ORDER, RECENT_SESSIONS, cornerTrendRow, cornerTrendTone, focusCornerIds, formatCornerDelta, formatCornerSec, missingSessionsText,
  sharedGraphSpanSec, sortCornerRows, type CornerSort, type CornerTrendRow,
} from './cornerTrendRows.js';
import { useCornerTrends } from './useCornerTrends.js';

export interface CornerTrendsSectionProps {
  layoutKey: string | null;
  /** The page's class; 'All' falls back to the class of the latest session. */
  carClass: string | null;
  /** The picked car model, 'All' for any. */
  carModel: string;
}

/** Columns and cell inset as the session table on this page draws them (14 px in from the card's content edge). */
const COLUMNS = 'grid grid-cols-[3rem_16rem_minmax(0,1fr)_5.5rem_6.5rem_5.5rem] items-center gap-x-6 px-3.5';

/** A gap in seconds; only the recent trend wears a colour, the class gap stays in text ink. */
const Delta: React.FC<{ value: number | null; label: string; toneClass?: string }> = ({ value, label, toneClass = 'text-lmu-text-soft' }) => (
  <span className={`text-right font-mono text-xs tabular-nums ${value === null ? 'text-lmu-muted' : toneClass}`}
    aria-label={value === null ? undefined : `${label} ${formatCornerDelta(value)} s`}>
    {value === null ? '—' : formatCornerDelta(value)}
  </span>
);

interface RowProps {
  row: CornerTrendRow;
  /** The graph height in seconds, shared by every row. */
  spanSec: number;
  focus: boolean;
}

const Row: React.FC<RowProps> = ({ row, spanSec, focus }) => {
  const tone = cornerTrendTone(row.recentChangeSec);
  const hasPoints = row.corner.points.length > 0;
  return (
    <li className={`${COLUMNS} py-2 border-b border-lmu-border/50`} data-testid="corner-trend-row">
        <span className="font-mono text-xs font-semibold text-lmu-text">{row.corner.label}</span>
        <span className="text-xs text-lmu-text-soft truncate" title={row.corner.title}>{row.corner.name}</span>
        {hasPoints
          ? <CornerTrendSparkline corner={row.corner} toneClass={tone} spanSec={spanSec} />
          : <span className={`block ${SPARKLINE_BOX} text-[11px] text-lmu-muted`}>No session with enough clean laps</span>}
        <span className="text-right font-mono text-xs font-bold tabular-nums text-lmu-text"
          aria-label={row.latestSec === null ? undefined : `Latest usual ${formatCornerSec(row.latestSec)} s`}>
          {row.latestSec === null ? '—' : formatCornerSec(row.latestSec)}
        </span>
        <Delta value={row.recentChangeSec} label={`Over your last ${RECENT_SESSIONS} sessions`} toneClass={tone === 'text-lmu-muted' ? 'text-lmu-text-soft' : tone} />
        {focus
          ? <span className="text-right" title="One of your biggest gaps to the class here: the corner to work on">
            <Delta value={row.vsClassSec} label="Biggest gap to the class's fastest usual" toneClass="text-lmu-loss font-bold" />
          </span>
          : <Delta value={row.vsClassSec} label="Against the class's fastest usual" />}
        {row.corner.habit && <CornerHabitLine trend={row.corner.habit} className="col-start-2 col-span-5 -mt-1" />}
    </li>
  );
};

/**
 * Corner trends on the track page: the driver's usual time through each corner of the class's map (else the official
 * turns), one mark per session, with the direction of the last sessions (`cornerTrendRow`), the gap to the class's
 * fastest, and the corner's habit over the latest sessions (`CornerHabitLine`).
 */
export const CornerTrendsSection: React.FC<CornerTrendsSectionProps> = ({ layoutKey, carClass, carModel }) => {
  const { trends, loading, error, retry } = useCornerTrends(layoutKey, carClass, carModel === 'All' ? '' : carModel);

  const [sort, setSort] = useState<CornerSort>(LAP_ORDER);
  if (!layoutKey || !carClass) return null;
  const rows = trends?.corners.map(cornerTrendRow) ?? [];
  const missing = trends ? missingSessionsText(trends) : null;
  const anyPoint = rows.some(row => row.corner.points.length > 0);
  const focus = focusCornerIds(rows);
  const spanSec = sharedGraphSpanSec(trends?.corners ?? []);

  return (
    <section className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4" aria-labelledby="corner-trends-title" data-testid="corner-trends">
      <h2 id="corner-trends-title" className="text-base font-semibold text-lmu-text flex items-center gap-2">
        <Route className="w-4 h-4 text-lmu-muted" aria-hidden="true" />
        Corner Trends{carModel !== 'All' ? ` · ${carModel}` : ''}
      </h2>

      {error && !trends && (
        <div role="alert" className="flex items-center justify-between gap-3 text-xs">
          <p className="text-lmu-warn-soft">Corner trends could not be loaded: {error}</p>
          <button type="button" onClick={retry} className={`font-bold text-lmu-info hover:text-lmu-info-soft ${FOCUS_RING}`}>Try again</button>
        </div>
      )}
      {loading && !trends && <p role="status" className="text-xs text-lmu-muted py-4">Loading corner trends…</p>}
      {trends && !anyPoint && (
        <p role="status" className="text-xs text-lmu-muted py-4">No session here has corner times yet: they come from sessions with a replay.</p>
      )}
      {trends && anyPoint && (
        <div>
          <CornerTrendsHeader columns={COLUMNS} sort={sort} onSort={setSort} />
          <ul aria-label="Corners">{sortCornerRows(rows, sort).map(row => (
            <Row key={row.corner.id} row={row} spanSec={spanSec} focus={focus.has(row.corner.id)} />
          ))}</ul>
        </div>
      )}
      {missing && <p className="px-3.5 text-[11px] text-lmu-muted">{missing}</p>}
    </section>
  );
};
