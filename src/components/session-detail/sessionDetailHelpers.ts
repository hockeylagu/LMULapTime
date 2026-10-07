import { DetailedSession, DriverData } from '../../../shared/types/index.js';
import { parseDateStringToTimestamp, matchesSessionType, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { normalizeCarClass } from '../../../shared/domain/paceCategory.js';
import { isOnlineSession } from '../../../shared/domain/leaderboard.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { buildTelemetryComparePath } from '../../utils/telemetryCompareLink.js';

/**
 * The /telemetry path of one lap of the session's replay, for the driver selected on the session page:
 * without the driver name the telemetry view opens the player's lap.
 */
export function sessionTelemetryPath(current: URLSearchParams, replayName: string, driverName: string | undefined, lapNum: number): string {
  return buildTelemetryComparePath(current, { replayName, driverName, lapNum }, null);
}

/**
 * The leaderboard's compare card opened on one lap of the session. The class is the leaderboard's
 * (LMGT3, not the results file's GT3), so the lap is found on its board.
 */
export function sessionLapComparePath(
  session: Pick<DetailedSession, 'id' | 'trackVenue' | 'trackCourse'>,
  driver: Pick<DriverData, 'carClass' | 'carType'> | undefined,
  lapNum: number | null | undefined,
): string {
  const params = new URLSearchParams({
    track: getDisplayTrackName(session.trackVenue, session.trackCourse),
    carClass: normalizeCarClass(driver?.carClass, driver?.carType) || 'LMGT3',
    sessionId: session.id,
  });
  if (lapNum) params.set('lapNum', String(lapNum));
  return `/leaderboard?${params.toString()}`;
}

export interface CandidateRelatedSession {
  id?: string;
  sessionId?: string;
  sessionType?: string;
  sessionName?: string;
  trackVenue?: string;
  trackCourse?: string;
  trackEvent?: string;
  timeString?: string;
  dateString?: string;
  timestamp?: number;
  settings?: { serverName?: string; modeSetting?: string };
  playerDriver?: { carClass?: string };
  carClass?: string;
}

export type WeekendSessionType = 'practice' | 'qualifying' | 'race';

export interface WeekendSessionLink<T = CandidateRelatedSession> {
  type: WeekendSessionType;
  target: T;
}

/** The furthest an offline session of the same weekend starts from the current one. */
const MAX_OFFLINE_WEEKEND_GAP_MS = 3.5 * 60 * 60 * 1000;
/** Sessions of one multiplayer event share the event start; only the session type weight sets them apart. */
const SAME_EVENT_START_MS = 500;

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Both sessions run on the same layout (circuitSpecs), or on the same unknown track by name. */
export function areSameTrackLayout(venueA?: string, courseA?: string, venueB?: string, courseB?: string): boolean {
  if (!venueA || !venueB) return false;
  const specA = getCircuitSpecification(venueA, courseA);
  const specB = getCircuitSpecification(venueB, courseB);
  if (specA.layoutKey !== 'unknown' && specB.layoutKey !== 'unknown') {
    return specA.layoutKey === specB.layoutKey;
  }
  return squash(`${venueA} ${courseA || ''}`) === squash(`${venueB} ${courseB || ''}`);
}

/** Start of the session; the parser's timestamp carries the type weight (practice < qualifying < race). */
function sessionTime(s: CandidateRelatedSession): number {
  return s.timestamp || parseDateStringToTimestamp(s.timeString || s.dateString);
}

/**
 * Whether the candidate belongs to the same weekend event as the current session:
 * the same layout, both online or both offline, then
 * - online: the same event start (the results files of one event share its TimeString);
 * - offline: the same class and event, starting within 3.5 hours.
 */
export function isSameWeekendSession(current: CandidateRelatedSession, candidate: CandidateRelatedSession): boolean {
  const currentId = current.id || current.sessionId;
  const candId = candidate.id || candidate.sessionId;
  if (currentId && candId && currentId === candId) return false;

  if (!areSameTrackLayout(current.trackVenue, current.trackCourse, candidate.trackVenue, candidate.trackCourse)) {
    return false;
  }

  const isCurrentOnline = isOnlineSession(current);
  if (isCurrentOnline !== isOnlineSession(candidate)) return false;

  const diffMs = Math.abs(sessionTime(current) - sessionTime(candidate));

  if (isCurrentOnline) {
    const timeA = (current.timeString || current.dateString || '').trim();
    const timeB = (candidate.timeString || candidate.dateString || '').trim();
    return Boolean(timeA && timeA === timeB) || diffMs <= SAME_EVENT_START_MS;
  }

  const classA = current.playerDriver?.carClass || current.carClass;
  const classB = candidate.playerDriver?.carClass || candidate.carClass;
  if (classA && classB && normalizeCarClass(classA) !== normalizeCarClass(classB)) return false;

  if (current.trackEvent && candidate.trackEvent && squash(current.trackEvent) !== squash(candidate.trackEvent)) {
    return false;
  }

  return diffMs <= MAX_OFFLINE_WEEKEND_GAP_MS;
}

const WEEKEND_ORDER: Record<WeekendSessionType, number> = { practice: 0, qualifying: 1, race: 2 };

function weekendSessionType(s: CandidateRelatedSession): WeekendSessionType | null {
  if (matchesSessionType(s.sessionType, s.sessionName, 'Practice')) return 'practice';
  if (matchesSessionType(s.sessionType, s.sessionName, 'Qualifying')) return 'qualifying';
  if (matchesSessionType(s.sessionType, s.sessionName, 'Race')) return 'race';
  return null;
}

/**
 * The other sessions of the current session's weekend, one per type, in weekend order. A later
 * session type is only looked for after the current session and an earlier one only before it,
 * so a weekend left before its race never points at the previous weekend's race.
 */
export function findWeekendSessions<T extends CandidateRelatedSession>(
  current: DetailedSession | null,
  sessions: T[]
): WeekendSessionLink<T>[] {
  if (!current || !sessions || sessions.length === 0) return [];
  const currentType = weekendSessionType(current);
  if (!currentType) return [];
  const currentTime = sessionTime(current);

  const links: WeekendSessionLink<T>[] = [];
  for (const type of ['practice', 'qualifying', 'race'] as const) {
    if (type === currentType) continue;
    const isLater = WEEKEND_ORDER[type] > WEEKEND_ORDER[currentType];
    let best: T | null = null;
    let bestDiff = Infinity;
    for (const cand of sessions) {
      if (weekendSessionType(cand) !== type || !isSameWeekendSession(current, cand)) continue;
      const offset = sessionTime(cand) - currentTime;
      if (isLater ? offset < 0 : offset > 0) continue;
      if (Math.abs(offset) < bestDiff) {
        bestDiff = Math.abs(offset);
        best = cand;
      }
    }
    if (best) links.push({ type, target: best });
  }
  return links;
}
