import React, { useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronRight, Route } from 'lucide-react';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { pinHabitFocus, unpinHabitFocus } from '../../../api/cornerSequenceApi.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { FocusTag, SlippingTag } from '../../common/HabitTags.js';
import { CornerHabitLine, type CornerPinControl } from './CornerHabitLine.js';
import { CornerTrendsHeader } from './CornerTrendsHeader.js';
import { CornerTrendSparkline, SPARKLINE_BOX } from './CornerTrendSparkline.js';
import {
  LAP_ORDER, MIN_TREND_SESSIONS, RECENT_SESSIONS, cornerTrendRow, cornerTrendTone, formatCornerDelta, formatCornerSec, missingSessionsText,
  sharedGraphSpanSec, sortCornerRows, type CornerSort, type CornerTrendRow,
} from './cornerTrendRows.js';
import { useCornerTrends } from './useCornerTrends.js';

export interface CornerTrendsSectionProps {
  /** The page's layout; null when the picked class has no session here (the card then says so). */
  layoutKey: string | null;
  /** The page's class; null (All classes) asks for one, as trends compare within one class (driver, 2026-11-20). */
  carClass: string | null;
  /** The picked car model, 'All' for any. */
  carModel: string;
}

/** The corner label and name share the first column, with a leading space for the disclosure. */
const COLUMNS = 'grid grid-cols-[minmax(10rem,1.15fr)_minmax(7rem,1fr)_9rem_8.5rem_8rem] items-center gap-x-3 px-1.5';

/** A gap in seconds; only the recent trend wears a colour, the gap to the target stays in text ink. */
const Delta: React.FC<{ value: number | null; label: string; toneClass?: string }> = ({ value, label, toneClass = 'text-lmu-text-soft' }) => (
  <span className={`text-right font-mono text-xs tabular-nums ${value === null ? 'text-lmu-muted' : toneClass}`}
    aria-label={value === null ? undefined : `${label} ${formatCornerDelta(value)} s`}>
    {value === null ? '—' : formatCornerDelta(value)}
  </span>
);

interface RowProps {
  row: CornerTrendRow;
  /** The lap view at the corner showing its habit; null without one. */
  link: string | null;
  /** The graph height in seconds, shared by every row. */
  spanSec: number;
  pin: CornerPinControl | null;
}

/** One corner cell, with the disclosure before both the code and name. */
const CornerCell: React.FC<{ row: CornerTrendRow; open: boolean | null; adviceId: string }> = ({ row, open, adviceId }) => {
  const { label, name, title } = row.corner;
  const focus = row.corner.habit?.focus;
  const slipping = row.corner.habit?.slipping === true;
  const content = (
    <>
      <span className="shrink-0 font-mono text-xs text-lmu-muted">{label}</span>
      <span className="truncate text-xs font-semibold">{name}</span>
      {focus && <FocusTag focus={focus} label={focus === 'pinned' ? 'Pinned' : 'Focus'}
        title={focus === 'pinned' ? 'Your pick: a focus corner until you unpin it' : 'Focus corner: one of the 2 to work on next'} />}
      {slipping && !focus && <SlippingTag />}
    </>
  );
  if (open === null) return <div className="flex min-w-0 items-center gap-1.5 pl-5" title={title}>{content}</div>;
  return (
    <button type="button" aria-expanded={open} aria-controls={adviceId} title={title} aria-label={`${label} ${name}`}
      className={`flex min-w-0 min-h-8 items-center gap-1.5 rounded text-left text-lmu-text-soft group-hover:text-lmu-text cursor-pointer ${FOCUS_RING}`}>
      <ChevronRight aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 text-lmu-muted motion-safe:transition-transform ${open ? 'rotate-90' : ''}`} />
      {content}
    </button>
  );
};

const Row: React.FC<RowProps> = ({ row, link, spanSec, pin }) => {
  const tone = cornerTrendTone(row.recentChangeSec);
  const hasPoints = row.corner.points.length > 0;
  const trendCount = row.recentFrom === null ? 0 : row.corner.points.length - row.recentFrom;
  const [open, setOpen] = useState(false);
  const adviceId = useId();
  const habit = row.corner.habit;
  const hasAdvice = habit !== null;
  return (
    <li className={`${COLUMNS} py-2 border-b border-lmu-border/50 ${hasAdvice ? 'group cursor-pointer' : ''} ${hasAdvice && !open ? 'hover:bg-lmu-raised/35' : ''}`}
      // A drag that selects the advice to copy it leaves the row as it is.
      onClick={hasAdvice ? () => { if (!window.getSelection()?.toString()) setOpen(previous => !previous); } : undefined} data-testid="corner-trend-row">
        <CornerCell row={row} open={hasAdvice ? open : null} adviceId={adviceId} />
        {hasPoints
          ? <CornerTrendSparkline corner={row.corner} toneClass={tone} spanSec={spanSec} />
          : <span className={`block ${SPARKLINE_BOX} text-[11px] text-lmu-muted`}>No session with enough clean laps</span>}
        <span className="text-right font-mono text-xs font-bold tabular-nums text-lmu-text"
          aria-label={row.latestSec === null ? undefined : `Latest median ${formatCornerSec(row.latestSec)} s`}>
          {row.latestSec === null ? '—' : formatCornerSec(row.latestSec)}
        </span>
        <div className="text-right" title={row.recentChangeSec !== null && trendCount < RECENT_SESSIONS
          ? `Based on ${trendCount} eligible sessions` : undefined}>
          {/* A corner without any session says so once, in the graph's place; the dash stands here. */}
          {row.recentChangeSec === null
            ? <span className="text-[11px] text-lmu-muted">{hasPoints ? `Need ${MIN_TREND_SESSIONS} sessions` : '—'}</span>
            : <Delta value={row.recentChangeSec} label="Recent trend" toneClass={tone === 'text-lmu-muted' ? 'text-lmu-text-soft' : tone} />}
        </div>
        {row.corner.reference === null
          ? <span className="text-right text-[11px] text-lmu-muted">No reference</span>
          : <Delta value={row.vsTargetSec} label="Gap to target" />}
        {habit && open && (
          <CornerHabitLine trend={habit} id={adviceId} to={link} pin={pin}
            className="col-span-full -mx-1.5 -mb-2 mt-2 cursor-auto border-t border-lmu-border/50 bg-lmu-bg/60 py-3 pr-3 pl-[1.625rem]" />
        )}
    </li>
  );
};

/**
 * Corner trends on the track page: the driver's usual time through each corner of the class's map (else the official
 * turns), one mark per session, with the direction of the last sessions (`cornerTrendRow`), the gap to the
 * target, and the corner's habit over the latest sessions (`CornerHabitLine`), closed until the row is opened. The 2
 * focus corners carry a mark (the same walk as the debrief), and an opened row makes its corner a focus or unpins it.
 */
export const CornerTrendsSection: React.FC<CornerTrendsSectionProps> = ({ layoutKey, carClass, carModel }) => {
  const { trends, loading, error, retry } = useCornerTrends(layoutKey, carClass, carModel === 'All' ? '' : carModel);

  const [sort, setSort] = useState<CornerSort>(LAP_ORDER);
  const rows = trends?.corners.map(cornerTrendRow) ?? [];
  const missing = trends ? missingSessionsText(trends) : null;
  const anyPoint = rows.some(row => row.corner.points.length > 0);
  const spanSec = sharedGraphSpanSec(trends?.corners ?? []);
  const [pinError, setPinError] = useState<{ cornerId: number; message: string } | null>(null);
  /** A pin names the layout, the class and the corner's first turn; the rows are read again once it is stored. */
  const pinOf = (row: CornerTrendRow): CornerPinControl | null => {
    const turnId = row.corner.habit?.pinTurnId;
    if (!layoutKey || !carClass || turnId === undefined) return null;
    return {
      error: pinError?.cornerId === row.corner.id ? pinError.message : null,
      onChange: (pinned) => {
        setPinError(null);
        void (pinned ? pinHabitFocus : unpinHabitFocus)({ layoutKey, carClass, turnId })
          .then(retry, (error: unknown) => setPinError({ cornerId: row.corner.id, message: apiErrorMessage(error, 'The focus could not be changed') }));
      },
    };
  };
  const [searchParams] = useSearchParams();
  // The lap view numbers the corners in lap order, the order the trends come in.
  const linkOf = (row: CornerTrendRow): string | null => {
    const view = row.corner.habit?.view;
    const number = (trends?.corners.findIndex(corner => corner.id === row.corner.id) ?? -1) + 1;
    return view && number > 0 ? buildTelemetryComparePath(searchParams, view.lap, { ...view.reference, driverName: view.reference.name }, number) : null;
  };

  return (
    <section className="bg-lmu-card border border-lmu-border p-4 rounded-2xl space-y-3" aria-labelledby="corner-trends-title" data-testid="corner-trends">
      <h2 id="corner-trends-title" className="text-base font-semibold text-lmu-text flex items-center gap-2">
        <Route className="w-4 h-4 text-lmu-muted" aria-hidden="true" />
        Corner Trends{carModel !== 'All' ? ` · ${carModel}` : ''}
      </h2>

      {!carClass && (
        <p role="status" className="text-xs text-lmu-muted py-4">Pick a class at the top of the page to see your corner trends: each class is compared on its own.</p>
      )}
      {error && !trends && (
        <div role="alert" className="flex items-center justify-between gap-3 text-xs">
          <p className="text-lmu-loss">Corner trends could not be loaded: {error}</p>
          <button type="button" onClick={retry} className={SECONDARY_BUTTON}>Try again</button>
        </div>
      )}
      {loading && !trends && <p role="status" className="text-xs text-lmu-muted py-4">Loading corner trends…</p>}
      {/* A class with no session here gives the page no layout to load: the same empty state as an empty answer. */}
      {carClass && (!layoutKey || trends?.sessions.total === 0) && (
        <p role="status" className="text-xs text-lmu-muted py-4">
          No {carModel !== 'All' ? carModel : carClass} session at this track yet: your corner trends start with your first one.
        </p>
      )}
      {trends && trends.sessions.total > 0 && !anyPoint && (
        <p role="status" className="text-xs text-lmu-muted py-4">No session here has corner times yet: they come from sessions with a replay.</p>
      )}
      {trends && anyPoint && (
        <div>
          <CornerTrendsHeader columns={COLUMNS} sort={sort} onSort={setSort} />
          <ul aria-label="Corners">{sortCornerRows(rows, sort).map(row => (
            <Row key={row.corner.id} row={row} link={linkOf(row)} spanSec={spanSec} pin={pinOf(row)} />
          ))}</ul>
        </div>
      )}
      {missing && <p className="px-1.5 text-[11px] text-lmu-muted">{missing}</p>}
    </section>
  );
};
