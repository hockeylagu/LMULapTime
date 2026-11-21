import { classResult } from '../classResult.js';

// Priority order for sorts that group by session importance: Race, then Qualifying, then Practice.
export function getSessionTypeSortRank(sessionType: string = ''): number {
  if (sessionType === 'Race') return 0;
  if (sessionType === 'Qualifying') return 1;
  if (sessionType === 'Practice') return 2;
  return 3;
}

export function parseDateStringToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const time = new Date(dateStr.replace(/\//g, '-')).getTime();
  return isNaN(time) ? 0 : time;
}

/**
 * Returns chronological weight for session types and names.
 * Practice (100-199) < Qualifying (200-299) < Warmup (250) < Race (300-399).
 * Higher weight means later in the weekend / newer.
 */
export function getSessionTypeWeight(sessionType?: string, sessionName?: string): number {
  const ordinal = Math.min(Number(sessionName?.match(/\d+/)?.[0] ?? 1), 99);
  if (sessionType === 'Practice') return 100 + ordinal;
  if (sessionType === 'Qualifying') return 200 + ordinal;
  if (sessionType === 'Warmup') return 250;
  if (sessionType === 'Race') return 300 + ordinal;
  return 0;
}

interface SessionComparable {
  timeString?: string;
  timestamp?: number;
  sessionType?: string;
  sessionName?: string;
  id?: string;
}

/**
 * Compares two sessions chronologically.
 * When dates/timestamps are equal or in the same event, Race is after Qualifying (so newer).
 */
export function compareSessions(
  a: SessionComparable,
  b: SessionComparable,
  direction: 'desc' | 'asc' = 'desc'
): number {
  const timeA = a.timestamp || parseDateStringToTimestamp(a.timeString);
  const timeB = b.timestamp || parseDateStringToTimestamp(b.timeString);

  // If timestamps differ by more than 1 second, sort by timestamp
  if (Math.abs(timeA - timeB) >= 1000) {
    return direction === 'desc' ? timeB - timeA : timeA - timeB;
  }

  // Within the same second or identical dates, order by session type:
  // Race (300) > Quali (200) > Practice (100)
  const weightA = getSessionTypeWeight(a.sessionType, a.sessionName);
  const weightB = getSessionTypeWeight(b.sessionType, b.sessionName);

  if (weightA !== weightB) {
    return direction === 'desc' ? weightB - weightA : weightA - weightB;
  }

  if (timeA !== timeB) {
    return direction === 'desc' ? timeB - timeA : timeA - timeB;
  }

  const idA = a.id || '';
  const idB = b.id || '';
  return direction === 'desc' ? idB.localeCompare(idA) : idA.localeCompare(idB);
}

/** The player's finish within their class, as the session cards show it. */
function classFinish(session: unknown): number | undefined {
  const player = (session as { playerDriver?: Parameters<typeof classResult>[0] }).playerDriver;
  return player ? classResult(player).position : undefined;
}

export interface SessionSortSelectors<T> {
  getPosition?: (session: T) => number | null | undefined;
  getBestLapTime?: (session: T) => number | null | undefined;
  getPacePercentage?: (session: T) => number | null | undefined;
}

/**
 * Shared session comparator handling date sorting, session type & position ranking,
 * best-lap time ranking, pace percentage ranking, and date/timestamp tie-breaks.
 */
export function compareSessionsBySortOption<T extends SessionComparable>(
  a: T,
  b: T,
  sortBy: string,
  selectors?: SessionSortSelectors<T>
): number {
  if (sortBy === 'date-desc' || sortBy === 'date-asc') {
    return compareSessions(a, b, sortBy === 'date-desc' ? 'desc' : 'asc');
  }

  if (sortBy === 'pos-asc') {
    const typeRankA = getSessionTypeSortRank(a.sessionType);
    const typeRankB = getSessionTypeSortRank(b.sessionType);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const rawPosA = selectors?.getPosition
      ? selectors.getPosition(a)
      : classFinish(a);
    const rawPosB = selectors?.getPosition
      ? selectors.getPosition(b)
      : classFinish(b);

    const posA = rawPosA && rawPosA > 0 ? rawPosA : 9999;
    const posB = rawPosB && rawPosB > 0 ? rawPosB : 9999;
    if (posA !== posB) return posA - posB;
    return compareSessions(a, b, 'desc');
  }

  if (sortBy === 'lap-asc') {
    const rawLapA = selectors?.getBestLapTime
      ? selectors.getBestLapTime(a)
      : (a as { playerDriver?: { bestLapTime?: number | null } }).playerDriver?.bestLapTime;
    const rawLapB = selectors?.getBestLapTime
      ? selectors.getBestLapTime(b)
      : (b as { playerDriver?: { bestLapTime?: number | null } }).playerDriver?.bestLapTime;

    const lapA = rawLapA && rawLapA > 0 ? rawLapA : 999999;
    const lapB = rawLapB && rawLapB > 0 ? rawLapB : 999999;
    if (lapA !== lapB) return lapA - lapB;
    return compareSessions(a, b, 'desc');
  }

  if (sortBy === 'pace-asc' || sortBy === 'pace-desc') {
    const rawPctA = selectors?.getPacePercentage
      ? selectors.getPacePercentage(a)
      : (a as { playerDriver?: { bestLapPacePercentage?: number | null } }).playerDriver?.bestLapPacePercentage;
    const rawPctB = selectors?.getPacePercentage
      ? selectors.getPacePercentage(b)
      : (b as { playerDriver?: { bestLapPacePercentage?: number | null } }).playerDriver?.bestLapPacePercentage;

    const pctA = rawPctA ?? 999;
    const pctB = rawPctB ?? 999;
    if (pctA !== pctB) {
      return sortBy === 'pace-asc' ? pctA - pctB : pctB - pctA;
    }
    return compareSessions(a, b, 'desc');
  }

  return compareSessions(a, b, 'desc');
}
