import type { ComparableLap } from '../../../../shared/types/index.js';
import { matchesSessionType } from '../../../../shared/domain/formatters.js';
import { selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';

export type SessionKind = 'practice' | 'quali' | 'race';
export type LapCondition = NonNullable<ComparableLap['weatherCondition']>;

export interface LapPickerFilters {
  kind: SessionKind | 'all';
  /** 'same' keeps the anchor lap's condition; without an anchor it keeps every condition. */
  condition: 'same' | 'all';
  cleanOnly: boolean;
}

export const DEFAULT_PICKER_FILTERS: LapPickerFilters = { kind: 'all', condition: 'same', cleanOnly: true };

export interface LapPickerSession {
  sessionId: string;
  sessionName?: string;
  sessionType?: string;
  kind: SessionKind | null;
  dateString?: string;
  timestamp: number;
  condition: LapCondition;
  /** The session's laps in lap order, after the filters. */
  laps: ComparableLap[];
  /** The fastest clean lap of the session, when it has one. */
  bestLapId: string | null;
  /** The ids of the session's clean laps (the parser's flags, read by `selectCleanLapCandidates`). */
  cleanLapIds: ReadonlySet<string>;
}

export interface LapQuickPick {
  key: string;
  label: string;
  lap: ComparableLap;
}

/** Practice, qualifying or race, from the session's type or name. */
export function lapSessionKind(lap: Pick<ComparableLap, 'sessionType' | 'sessionName'>): SessionKind | null {
  if (matchesSessionType(lap.sessionType, lap.sessionName, 'Qualifying')) return 'quali';
  if (matchesSessionType(lap.sessionType, lap.sessionName, 'Race')) return 'race';
  if (matchesSessionType(lap.sessionType, lap.sessionName, 'Practice')) return 'practice';
  return null;
}

export function lapCondition(lap: Pick<ComparableLap, 'weatherCondition' | 'hasRain'>): LapCondition {
  return lap.weatherCondition ?? (lap.hasRain ? 'Wet' : 'Dry');
}

/** The calendar day of the lap's session: the sessions of one day on a layout are one event. */
export function lapEventDay(lap: Pick<ComparableLap, 'dateString' | 'timestamp'>): string | null {
  const fromString = lap.dateString?.split(' ')[0];
  if (fromString) return fromString.replace(/-/g, '/');
  if (!lap.timestamp) return null;
  const date = new Date(lap.timestamp);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

const sessionKey = (lap: ComparableLap) => `${lap.sessionId ?? ''}\u0000${lap.driverName}`;
const byTime = (a: ComparableLap, b: ComparableLap) => (a.lapTime ?? Infinity) - (b.lapTime ?? Infinity);

/** Every recorded lap, grouped by session (and driver), newest session first; no filter applied. */
function sessionsOf(laps: ComparableLap[]): Array<{ laps: ComparableLap[]; clean: ComparableLap[] }> {
  const groups = new Map<string, ComparableLap[]>();
  for (const lap of laps) {
    if (!lap.sessionId || lap.isTheoreticalBest || !lap.lapTime || lap.lapTime <= 0) continue;
    const key = sessionKey(lap);
    const list = groups.get(key);
    if (list) list.push(lap); else groups.set(key, [lap]);
  }
  return [...groups.values()]
    .map(list => {
      const sorted = [...list].sort((a, b) => (a.lapNum ?? 0) - (b.lapNum ?? 0));
      return { laps: sorted, clean: selectCleanLapCandidates(sorted) };
    })
    .sort((a, b) => (b.laps[0].timestamp ?? 0) - (a.laps[0].timestamp ?? 0));
}

function matchesFilters(lap: ComparableLap, filters: LapPickerFilters, anchor: ComparableLap | null): boolean {
  if (filters.kind !== 'all' && lapSessionKind(lap) !== filters.kind) return false;
  if (filters.condition === 'same' && anchor && lapCondition(lap) !== lapCondition(anchor)) return false;
  return true;
}

/** The sessions the picker lists, with the laps the filters keep. */
export function groupPickerSessions(laps: ComparableLap[], filters: LapPickerFilters, anchor: ComparableLap | null): LapPickerSession[] {
  return sessionsOf(laps).flatMap(({ laps: sessionLaps, clean }) => {
    const first = sessionLaps[0];
    if (!matchesFilters(first, filters, anchor)) return [];
    const cleanIds = new Set(clean.map(l => l.id));
    const kept = filters.cleanOnly ? sessionLaps.filter(l => cleanIds.has(l.id)) : sessionLaps;
    if (kept.length === 0) return [];
    return [{
      sessionId: first.sessionId!,
      sessionName: first.sessionName,
      sessionType: first.sessionType,
      kind: lapSessionKind(first),
      dateString: first.dateString,
      timestamp: first.timestamp ?? 0,
      condition: lapCondition(first),
      laps: kept,
      bestLapId: [...clean].sort(byTime)[0]?.id ?? null,
      cleanLapIds: cleanIds,
    }];
  });
}

/**
 * One-click picks around the anchor lap (the lap staying in the comparison): the best clean lap
 * of the event's qualifying and race, of the anchor's own session, and of the session before it.
 * They follow the same filters as the list; a lap already compared is never offered.
 */
export function pickerQuickPicks(
  laps: ComparableLap[],
  anchor: ComparableLap | null,
  filters: LapPickerFilters,
  comparedIds: readonly string[],
): LapQuickPick[] {
  if (!anchor?.sessionId) return [];
  const sessions = sessionsOf(laps).filter(s => matchesFilters(s.laps[0], { ...filters, kind: 'all' }, anchor));
  const day = lapEventDay(anchor);
  const anchorTime = anchor.timestamp ?? sessions.find(s => s.laps[0].sessionId === anchor.sessionId)?.laps[0].timestamp ?? 0;
  const bestOf = (list: typeof sessions) => list.flatMap(s => s.clean).filter(l => !comparedIds.includes(l.id)).sort(byTime)[0];
  const sameEvent = (kind: SessionKind) => sessions.filter(s =>
    s.laps[0].sessionId !== anchor.sessionId && lapEventDay(s.laps[0]) === day && lapSessionKind(s.laps[0]) === kind);
  const previous = sessions.find(s => s.laps[0].sessionId !== anchor.sessionId && (s.laps[0].timestamp ?? 0) < anchorTime);

  const candidates: Array<[string, string, ComparableLap | undefined]> = [
    ['event-quali', 'Best in qualifying (same event)', bestOf(sameEvent('quali'))],
    ['event-race', 'Best in race (same event)', bestOf(sameEvent('race'))],
    ['this-session', 'Best in this session', bestOf(sessions.filter(s => s.laps[0].sessionId === anchor.sessionId))],
    ['previous-session', 'Previous session’s best', previous ? bestOf([previous]) : undefined],
  ];
  const seen = new Set<string>();
  return candidates.flatMap(([key, label, lap]) => {
    if (!lap || seen.has(lap.id)) return [];
    seen.add(lap.id);
    return [{ key, label, lap }];
  });
}
