import { median } from '../../../../shared/domain/pitStops.js';
import type { CornerTrend, CornerTrendsResponse } from '../../../../shared/types/corners/cornerTrends.js';

/** The sessions the recent trend is fitted over: the last ones, so an old slow start never reads as progress. */
export const RECENT_SESSIONS = 5;
/** Fewer sessions than this give no trend: two points are one difference, not a direction. */
export const MIN_TREND_SESSIONS = 3;

/** A corner's row: its latest usual time and its recent direction, in seconds (negative = quicker). */
export interface CornerTrendRow {
  corner: CornerTrend;
  latestSec: number | null;
  /** Index of the first point of the recent stretch (the last RECENT_SESSIONS); null without a trend. */
  recentFrom: number | null;
  /**
   * The change over the recent stretch, from the trend through its usual times (`fittedChange`, robust to one odd
   * session). Null below MIN_TREND_SESSIONS sessions.
   */
  recentChangeSec: number | null;
  /** Latest against the reference (the target's usual, else the class's fastest); null without one. */
  vsTargetSec: number | null;
}

/**
 * The trend through the values, one session apart, over their span: the median of the slopes between every pair of
 * sessions (Theil–Sen) times the span. One odd session moves only its own pairs, so it cannot make or hide a trend
 * the other sessions do not share.
 */
function fittedChange(values: readonly number[]): number {
  const slopes: number[] = [];
  values.forEach((a, i) => values.slice(i + 1).forEach((b, k) => slopes.push((b - a) / (k + 1))));
  return (median(slopes) ?? 0) * (values.length - 1);
}

export function cornerTrendRow(corner: CornerTrend): CornerTrendRow {
  const usuals = corner.points.map(point => point.usualSec);
  const latestSec = usuals.at(-1) ?? null;
  const recentFrom = usuals.length >= MIN_TREND_SESSIONS ? Math.max(0, usuals.length - RECENT_SESSIONS) : null;
  return {
    corner,
    latestSec,
    recentFrom,
    recentChangeSec: recentFrom === null ? null : fittedChange(usuals.slice(recentFrom)),
    vsTargetSec: latestSec !== null && corner.reference ? latestSec - corner.reference.usualSec : null,
  };
}

/** The shared graph height in seconds: never under this, so noise stays small... */
const MIN_GRAPH_SPAN_SEC = 0.3;
/** ...and never over this, so one wild corner cannot flatten the others; slower points sit on the bottom edge. */
const MAX_GRAPH_SPAN_SEC = 1.5;

/** The top of a corner's graph: the reference (the target's usual), or the driver's quickest usual when that is quicker or there is none. */
export function graphTopSec(corner: CornerTrend): number | null {
  const values = [...corner.points.map(point => point.usualSec), ...(corner.reference ? [corner.reference.usualSec] : [])];
  return values.length ? Math.min(...values) : null;
}

/**
 * One height in seconds for every corner's graph, so the same gap to the target is the same height on each row: the
 * largest gap between a corner's top and its slowest usual, within MIN_GRAPH_SPAN_SEC and MAX_GRAPH_SPAN_SEC.
 */
export function sharedGraphSpanSec(corners: readonly CornerTrend[]): number {
  const gaps = corners.flatMap(corner => {
    const top = graphTopSec(corner);
    return top === null ? [] : corner.points.map(point => point.usualSec - top);
  });
  return Math.min(MAX_GRAPH_SPAN_SEC, Math.max(MIN_GRAPH_SPAN_SEC, ...gaps));
}

/** Seconds as the corner card shows them. */
export const formatCornerSec = (value: number): string => value.toFixed(3);

/** A signed gap in seconds, as the corner card signs it: "−0.120" quicker, "+0.045" slower, "±0.000" level. */
export function formatCornerDelta(value: number): string {
  const shown = Math.abs(value).toFixed(3);
  return `${Number(shown) === 0 ? '±' : value > 0 ? '+' : '−'}${shown}`;
}

/** A recent change smaller than this is level: a few hundredths is noise between sessions. */
const LEVEL_SEC = 0.05;

/**
 * The colour of a row's recent stretch and its "last 5" change: quicker in the gain colour, slower in the loss
 * colour, level or no trend in grey. The older sessions stay grey.
 */
export function cornerTrendTone(recentChangeSec: number | null): string {
  if (recentChangeSec === null || Math.abs(recentChangeSec) < LEVEL_SEC) return 'text-lmu-muted';
  return recentChangeSec < 0 ? 'text-lmu-gain' : 'text-lmu-loss';
}

/** How a session's dot is drawn: race filled, qualifying a diamond, practice (and anything else) hollow. */
export type SessionMark = 'race' | 'qualifying' | 'practice';

export function sessionMark(sessionType: string, sessionName: string): SessionMark {
  if (sessionType === 'Race') return 'race';
  if (sessionType === 'Qualifying' || sessionName.toLowerCase().includes('quali')) return 'qualifying';
  return 'practice';
}

/** The columns the corner rows sort by: lap order, or one of the numbers. */
export type CornerSortKey = 'corner' | 'latest' | 'recent' | 'vsTarget';
export interface CornerSort { key: CornerSortKey; descending: boolean }
export const LAP_ORDER: CornerSort = { key: 'corner', descending: false };

const SORT_VALUE: Record<Exclude<CornerSortKey, 'corner'>, (row: CornerTrendRow) => number | null> = {
  latest: row => row.latestSec,
  recent: row => row.recentChangeSec,
  vsTarget: row => row.vsTargetSec,
};

/** The rows (in lap order) in the asked order. Rows without the number go last either way; ties keep lap order (a stable sort). */
export function sortCornerRows(rows: readonly CornerTrendRow[], sort: CornerSort): CornerTrendRow[] {
  if (sort.key === 'corner') return sort.descending ? rows.toReversed() : [...rows];
  const value = SORT_VALUE[sort.key];
  return rows.toSorted((a, b) => {
    const va = value(a), vb = value(b);
    if (va === null || vb === null) return (va === null ? 1 : 0) - (vb === null ? 1 : 0);
    return sort.descending ? vb - va : va - vb;
  });
}

/** Why some of the driver's sessions here have no point, in one line; null when every session has one. */
export function missingSessionsText(trends: CornerTrendsResponse): string | null {
  const { noReplay, waiting, tooFewPasses } = trends.sessions;
  const parts = [
    noReplay ? `${noReplay} without a replay` : null,
    waiting ? `${waiting} waiting for a rebuild` : null,
    tooFewPasses ? `${tooFewPasses} with too few clean laps` : null,
  ].filter((part): part is string => part !== null);
  if (!parts.length) return null;
  const left = noReplay + waiting + tooFewPasses;
  return `${left} of ${trends.sessions.total} sessions ${left === 1 ? 'has' : 'have'} no corner times: ${parts.join(', ')}.`;
}
