import {
  ReplayContactEvent,
  ReplayFlagEvent,
  ReplayLapSummary,
  ReplayPenaltyEvent,
  ReplayPitEvent,
  ReplayStandingsSnapshot,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
  ReplayWeatherEvent,
} from '../core/types.js';

// Turns a decoded trajectory into the rows of the normalized replay tables (dbSchema.ts): each
// fact once, at its own level. Every lap blob of a replay holds the same replay-wide arrays (the
// events of all drivers, the weather, the flags and the running order), so any one of them gives
// the replay's facts; the lap list belongs to the driver and the lap times to each lap's own row.

export interface ReplayLapFact {
  lapNumber: number;
  startSec: number | null;
  endSec: number | null;
  lapTimeSec: number | null;
  s1Sec: number | null;
  s2Sec: number | null;
  s3Sec: number | null;
  lapDistM: number | null;
  isOutlap: boolean | null;
  isValid: boolean | null;
  isBest: boolean | null;
  startFrame: number | null;
  endFrame: number | null;
}

export interface ReplayConditionFact {
  startSec: number;
  endSec: number;
  rain: number | null;
  ambientC: number | null;
  flagState: number | null;
  sectorMask: number | null;
  driverFlag: number | null;
}

export type ReplayDriverEventKind = 'pit' | 'contact' | 'penalty_given' | 'penalty_served';

export interface ReplayDriverEventFact {
  kind: ReplayDriverEventKind;
  /** The event's place in its decoded array (pitEvents, contacts or penalties). */
  seq: number;
  driverSlot: number;
  timeSec: number;
  code: number | null;
  value: number | null;
  otherSlot: number | null;
  /** The event's other fields, as decoded. */
  detail: Record<string, unknown> | null;
}

export interface ReplayRunningOrderFact {
  timeSec: number;
  order: number[];
}

export interface ReplayWideFacts {
  endSec: number;
  sessionRunningOrder: number[] | null;
  conditions: ReplayConditionFact[];
  driverEvents: ReplayDriverEventFact[];
  runningOrder: ReplayRunningOrderFact[];
}

export interface LapSpan {
  startSec: number;
  endSec: number;
}

/** The replay times of a lap's first and last sample that has one. */
export function lapSpanFrom(points: ReadonlyArray<Pick<ReplayTrajectoryPoint, 'timeSec'>>): LapSpan | null {
  const first = points.find(p => typeof p.timeSec === 'number');
  const last = [...points].reverse().find(p => typeof p.timeSec === 'number');
  if (first?.timeSec === undefined || last?.timeSec === undefined) return null;
  return { startSec: first.timeSec, endSec: last.timeSec };
}

const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** A stored lap known only by its number (and its span, when it has timed samples). */
export function emptyLapFact(lapNumber: number, span: LapSpan | null = null): ReplayLapFact {
  return {
    lapNumber, startSec: span?.startSec ?? null, endSec: span?.endSec ?? null, lapTimeSec: null, s1Sec: null, s2Sec: null, s3Sec: null,
    lapDistM: null, isOutlap: null, isValid: null, isBest: null, startFrame: null, endFrame: null,
  };
}

/**
 * One driver's lap facts: every lap of their lap list, with the time span of the laps whose rows
 * are stored. A stored lap missing from the list still gets a row, without timing.
 */
export function lapFactsFrom(laps: ReadonlyArray<ReplayLapSummary>, spans: ReadonlyMap<number, LapSpan>): ReplayLapFact[] {
  const facts = new Map<number, ReplayLapFact>();
  for (const lap of laps) {
    const span = spans.get(lap.lapNumber);
    facts.set(lap.lapNumber, {
      lapNumber: lap.lapNumber,
      startSec: span?.startSec ?? null,
      endSec: span?.endSec ?? null,
      lapTimeSec: orNull(lap.lapTimeSec),
      s1Sec: orNull(lap.s1Sec),
      s2Sec: orNull(lap.s2Sec),
      s3Sec: orNull(lap.s3Sec),
      lapDistM: orNull(lap.lapDistMeters),
      isOutlap: orNull(lap.isOutlap),
      isValid: orNull(lap.isValid),
      isBest: orNull(lap.isBest),
      startFrame: orNull(lap.startFrame),
      endFrame: orNull(lap.endFrame),
    });
  }
  for (const [lapNumber, span] of spans) {
    if (facts.has(lapNumber)) continue;
    facts.set(lapNumber, emptyLapFact(lapNumber, span));
  }
  return [...facts.values()].sort((a, b) => a.lapNumber - b.lapNumber);
}

/** The lap list rebuilt from the lap facts, as the decoder wrote it. */
export function lapSummariesFrom(facts: ReadonlyArray<ReplayLapFact>): ReplayLapSummary[] {
  return facts.filter(f => f.lapTimeSec !== null).map((f) => {
    const lap: ReplayLapSummary = { lapNumber: f.lapNumber, lapTimeSec: f.lapTimeSec ?? 0, s1Sec: f.s1Sec ?? 0, s2Sec: f.s2Sec ?? 0, s3Sec: f.s3Sec ?? 0 };
    if (f.lapDistM !== null) lap.lapDistMeters = f.lapDistM;
    if (f.isOutlap !== null) lap.isOutlap = f.isOutlap;
    if (f.isBest !== null) lap.isBest = f.isBest;
    if (f.isValid !== null) lap.isValid = f.isValid;
    if (f.startFrame !== null) lap.startFrame = f.startFrame;
    if (f.endFrame !== null) lap.endFrame = f.endFrame;
    return lap;
  });
}

type ConditionState = Omit<ReplayConditionFact, 'startSec' | 'endSec'>;

const sameCondition = (a: ConditionState, b: ConditionState): boolean =>
  a.rain === b.rain && a.ambientC === b.ambientC && a.flagState === b.flagState && a.sectorMask === b.sectorMask && a.driverFlag === b.driverFlag;

/**
 * The replay's conditions as one row per change of the weather or the flag packet, both of which
 * are broadcast every few seconds whether they changed or not. Of two packets at the same time,
 * the later one in the recording holds. The last row runs to `endSec`.
 */
export function conditionsFrom(weather: ReadonlyArray<ReplayWeatherEvent>, flags: ReadonlyArray<ReplayFlagEvent>, endSec: number): ReplayConditionFact[] {
  type Change = { timeSec: number; order: number; apply: (state: ConditionState) => void };
  const changes: Change[] = [
    ...weather.map((e, i): Change => ({ timeSec: e.timeSec, order: i, apply: (s) => { s.rain = e.rainIntensity; s.ambientC = orNull(e.ambientTemp); } })),
    ...flags.map((e, i): Change => ({ timeSec: e.timeSec, order: weather.length + i, apply: (s) => {
      s.flagState = e.flagState; s.sectorMask = orNull(e.sectorMask); s.driverFlag = orNull(e.driverFlag);
    } })),
  ].sort((a, b) => a.timeSec - b.timeSec || a.order - b.order);

  const state: ConditionState = { rain: null, ambientC: null, flagState: null, sectorMask: null, driverFlag: null };
  const rows: ReplayConditionFact[] = [];
  for (const change of changes) {
    change.apply(state);
    const last = rows[rows.length - 1];
    if (last && last.startSec === change.timeSec) {
      Object.assign(last, state);
      const before = rows[rows.length - 2];
      if (before && sameCondition(before, last)) rows.pop();
    } else if (!last || !sameCondition(last, state)) {
      rows.push({ startSec: change.timeSec, endSec: change.timeSec, ...state });
    }
  }
  rows.forEach((row, i) => { row.endSec = i + 1 < rows.length ? rows[i + 1].startSec : Math.max(endSec, row.startSec); });
  return rows;
}

function withoutKeys(event: object, keys: readonly string[]): Record<string, unknown> | null {
  const rest = Object.fromEntries(Object.entries(event).filter(([key, value]) => !keys.includes(key) && value !== undefined));
  return Object.keys(rest).length > 0 ? rest : null;
}

const PIT_COLUMNS = ['driverSlot', 'timeSec', 'code', 'durationSec'] as const;
const CONTACT_COLUMNS = ['driverSlot', 'timeSec', 'impactMagnitude', 'otherParty'] as const;
const PENALTY_COLUMNS = ['driverSlot', 'timeSec', 'penaltySeconds', 'action'] as const;

/** Every driver's pit, contact and penalty events, one row each, in their decoded order. */
export function driverEventsFrom(trajectory: Pick<ReplayTrajectoryData, 'pitEvents' | 'contacts' | 'penalties'>): ReplayDriverEventFact[] {
  const pits = (trajectory.pitEvents ?? []).map((e, seq): ReplayDriverEventFact => ({
    kind: 'pit', seq, driverSlot: e.driverSlot, timeSec: e.timeSec, code: e.code, value: orNull(e.durationSec), otherSlot: null,
    detail: withoutKeys(e, PIT_COLUMNS),
  }));
  const contacts = (trajectory.contacts ?? []).map((e, seq): ReplayDriverEventFact => ({
    kind: 'contact', seq, driverSlot: e.driverSlot, timeSec: e.timeSec, code: null, value: e.impactMagnitude, otherSlot: orNull(e.otherParty),
    detail: withoutKeys(e, CONTACT_COLUMNS),
  }));
  const penalties = (trajectory.penalties ?? []).map((e, seq): ReplayDriverEventFact => ({
    kind: e.action === 'served' ? 'penalty_served' : 'penalty_given', seq, driverSlot: e.driverSlot, timeSec: e.timeSec, code: null,
    value: orNull(e.penaltySeconds), otherSlot: null, detail: withoutKeys(e, PENALTY_COLUMNS),
  }));
  return [...pits, ...contacts, ...penalties];
}

/** The pit, contact and penalty arrays rebuilt from the event rows, as the decoder wrote them. */
export function driverEventArraysFrom(facts: ReadonlyArray<ReplayDriverEventFact>): { pitEvents: ReplayPitEvent[]; contacts: ReplayContactEvent[]; penalties: ReplayPenaltyEvent[] } {
  const ordered = [...facts].sort((a, b) => a.seq - b.seq);
  const pitEvents = ordered.filter(f => f.kind === 'pit').map((f): ReplayPitEvent => ({
    ...(f.detail as Omit<ReplayPitEvent, 'driverSlot' | 'timeSec' | 'code'>), driverSlot: f.driverSlot, timeSec: f.timeSec, code: f.code ?? 0,
    ...(f.value !== null ? { durationSec: f.value } : {}),
  }));
  const contacts = ordered.filter(f => f.kind === 'contact').map((f): ReplayContactEvent => ({
    ...(f.detail ?? {}), driverSlot: f.driverSlot, timeSec: f.timeSec, impactMagnitude: f.value ?? 0,
    ...(f.otherSlot !== null ? { otherParty: f.otherSlot } : {}),
  }));
  const penalties = ordered.filter(f => f.kind === 'penalty_given' || f.kind === 'penalty_served').map((f): ReplayPenaltyEvent => ({
    ...(f.detail as Pick<ReplayPenaltyEvent, 'penaltyText'>), driverSlot: f.driverSlot, timeSec: f.timeSec,
    action: f.kind === 'penalty_served' ? 'served' : 'given', ...(f.value !== null ? { penaltySeconds: f.value } : {}),
  }));
  return { pitEvents, contacts, penalties };
}

/** The running order snapshots where the order changes; of two at the same time, the later holds. */
export function runningOrderFrom(history: ReadonlyArray<ReplayStandingsSnapshot>): ReplayRunningOrderFact[] {
  const rows: ReplayRunningOrderFact[] = [];
  const same = (a: number[], b: number[]): boolean => a.length === b.length && a.every((slot, i) => slot === b[i]);
  for (const snapshot of history) {
    const last = rows[rows.length - 1];
    if (last && last.timeSec === snapshot.timeSec) {
      last.order = [...snapshot.order];
      const before = rows[rows.length - 2];
      if (before && same(before.order, last.order)) rows.pop();
    } else if (!last || !same(last.order, snapshot.order)) {
      rows.push({ timeSec: snapshot.timeSec, order: [...snapshot.order] });
    }
  }
  return rows;
}

/**
 * The replay-wide facts of a decoded (or stored and upgraded) lap. They run to the latest of
 * `endSec`, the last event and the lap's last sample.
 */
export function replayWideFactsFrom(trajectory: ReplayTrajectoryData, endSec = 0): ReplayWideFacts {
  const times = [
    endSec,
    lapSpanFrom(trajectory.points ?? [])?.endSec ?? 0,
    ...[trajectory.weatherEvents, trajectory.flagEvents, trajectory.standingsHistory, trajectory.pitEvents, trajectory.contacts, trajectory.penalties]
      .map(events => (events && events.length > 0 ? Math.max(...events.map(e => e.timeSec)) : 0)),
  ];
  const end = Math.max(...times);
  return {
    endSec: end,
    sessionRunningOrder: trajectory.sessionRunningOrder ?? null,
    conditions: conditionsFrom(trajectory.weatherEvents ?? [], trajectory.flagEvents ?? [], end),
    driverEvents: driverEventsFrom(trajectory),
    runningOrder: runningOrderFrom(trajectory.standingsHistory ?? []),
  };
}
