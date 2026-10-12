import { parseDateStringToTimestamp } from './formatters.js';
import { isOnlineSession } from './leaderboard.js';
import { CIRCUIT_SPECIFICATIONS } from './circuitDefinitions.js';
import { getCircuitSpecification } from './circuitSpecs.js';
export interface CandidateRelatedSession {
  id?: string;
  sessionId?: string;
  sessionType?: string;
  sessionName?: string;
  trackVenue?: string;
  trackCourse?: string;
  trackEvent?: string;
  timeString?: string;
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

interface TrackLayout {
  trackVenue?: string;
  trackCourse?: string;
  layoutKey: string;
}

function sameTrackLayout(a: TrackLayout, b: TrackLayout): boolean {
  if (!a.trackVenue || !b.trackVenue) return false;
  const knownA = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, a.layoutKey);
  const knownB = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, b.layoutKey);
  return knownA && knownB
    ? a.layoutKey === b.layoutKey
    : !knownA && !knownB && a.trackVenue === b.trackVenue && (a.trackCourse ?? '') === (b.trackCourse ?? '');
}

/** Both sessions run on the same layout (circuitSpecs), or on the same unknown track by name. */
export function areSameTrackLayout(venueA?: string, courseA?: string, venueB?: string, courseB?: string): boolean {
  if (!venueA || !venueB) return false;
  return sameTrackLayout(
    { trackVenue: venueA, trackCourse: courseA, layoutKey: getCircuitSpecification(venueA, courseA).layoutKey },
    { trackVenue: venueB, trackCourse: courseB, layoutKey: getCircuitSpecification(venueB, courseB).layoutKey },
  );
}

interface WeekendContext extends TrackLayout {
  id?: string;
  online: boolean;
  time: number;
  eventStart: string;
  carClass?: string;
  event?: string;
}

/** Derive the reusable event identity and timing once per session in a search. */
function weekendContext(session: CandidateRelatedSession): WeekendContext {
  return {
    trackVenue: session.trackVenue,
    trackCourse: session.trackCourse,
    layoutKey: getCircuitSpecification(session.trackVenue, session.trackCourse).layoutKey,
    id: session.id || session.sessionId,
    online: isOnlineSession(session),
    time: sessionTime(session),
    eventStart: (session.timeString || '').trim(),
    carClass: session.playerDriver?.carClass || session.carClass,
    event: session.trackEvent ? squash(session.trackEvent) : undefined,
  };
}

/** Start of the session; the parser's timestamp carries the type weight (practice < qualifying < race). */
function sessionTime(s: CandidateRelatedSession): number {
  return s.timestamp || parseDateStringToTimestamp(s.timeString);
}

/**
 * Whether the candidate belongs to the same weekend event as the current session:
 * the same layout, both online or both offline, then
 * - online: the same event start (the results files of one event share its TimeString);
 * - offline: the same class and event, starting within 3.5 hours.
 */
export function isSameWeekendSession(current: CandidateRelatedSession, candidate: CandidateRelatedSession): boolean {
  const currentContext = weekendContext(current);
  const candidateContext = weekendContext(candidate);
  return matchesWeekend(currentContext, candidateContext);
}

function matchesWeekend(current: WeekendContext, candidate: WeekendContext): boolean {
  if (current.id && candidate.id && current.id === candidate.id) return false;
  if (!sameTrackLayout(current, candidate) || current.online !== candidate.online) return false;
  const diffMs = Math.abs(current.time - candidate.time);
  if (current.online) {
    return Boolean(current.eventStart && current.eventStart === candidate.eventStart) || diffMs <= SAME_EVENT_START_MS;
  }
  if (current.carClass && candidate.carClass && current.carClass !== candidate.carClass) return false;
  if (current.event !== undefined && candidate.event !== undefined && current.event !== candidate.event) return false;
  return diffMs <= MAX_OFFLINE_WEEKEND_GAP_MS;
}

const WEEKEND_ORDER: Record<WeekendSessionType, number> = { practice: 0, qualifying: 1, race: 2 };

function weekendSessionType(s: CandidateRelatedSession): WeekendSessionType | null {
  if (s.sessionType === 'Practice') return 'practice';
  if (s.sessionType === 'Qualifying') return 'qualifying';
  if (s.sessionType === 'Race') return 'race';
  return null;
}

/**
 * The other sessions of the current session's weekend, one per type, in weekend order. A later
 * session type is only looked for after the current session and an earlier one only before it,
 * so a weekend left before its race never points at the previous weekend's race.
 */
export function findWeekendSessions<T extends CandidateRelatedSession>(
  current: CandidateRelatedSession | null,
  sessions: Iterable<T>
): WeekendSessionLink<T>[] {
  if (!current || !sessions) return [];
  const currentType = weekendSessionType(current);
  if (!currentType) return [];
  const currentContext = weekendContext(current);
  const bestByType = new Map<WeekendSessionType, { target: T; difference: number }>();
  for (const candidate of sessions) {
    const type = weekendSessionType(candidate);
    if (!type || type === currentType) continue;
    const candidateContext = weekendContext(candidate);
    if (!matchesWeekend(currentContext, candidateContext)) continue;
    const offset = candidateContext.time - currentContext.time;
    const isLater = WEEKEND_ORDER[type] > WEEKEND_ORDER[currentType];
    if (isLater ? offset < 0 : offset > 0) continue;
    const difference = Math.abs(offset);
    if (difference < (bestByType.get(type)?.difference ?? Infinity)) {
      bestByType.set(type, { target: candidate, difference });
    }
  }
  const links: WeekendSessionLink<T>[] = [];
  for (const type of ['practice', 'qualifying', 'race'] as const) {
    const best = bestByType.get(type);
    if (best) links.push({ type, target: best.target });
  }
  return links;
}

