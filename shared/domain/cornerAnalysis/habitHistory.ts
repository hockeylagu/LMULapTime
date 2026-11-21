import type {
  AnalysisSessionRef, CornerAnalysis, CornerHabit, CornerHabitTrend, HabitChange, HabitRule, SessionHabitProgress,
} from '../../types/corners/cornerAnalysis.js';
import { lapGapM, type TurnUsual } from './turnUsual.js';

/** "Seen in N of the last few": the sessions a habit's history reads (driver, 2026-11-20: "how often it shows"). */
export const HISTORY_SESSIONS = 5;

/** One analysed session of the driver at the layout, with their usual through each turn. */
export interface AnalysedSession extends AnalysisSessionRef {
  /** The driver's ordinal in the session. */
  driverOrdinal: number;
  analysis: CornerAnalysis;
  turns: ReadonlyMap<number, TurnUsual>;
}

/** The same habit across sessions: the same rule at the same turn (the half can move with the slowest point). */
const sameHabit = (a: Pick<CornerHabit, 'turnId' | 'rule'>) => (b: Pick<CornerHabit, 'turnId' | 'rule'>) => a.turnId === b.turnId && a.rule === b.rule;
const habitsOf = (analysis: CornerAnalysis): CornerHabit[] => [...analysis.habits, ...analysis.unexplained];

/** A corner's main habit: the highest priority one, else its biggest loss no rule explains. */
const mainHabit = (analysis: CornerAnalysis, cornerId: number): CornerHabit | null =>
  analysis.habits.find(habit => habit.cornerId === cornerId) ?? analysis.unexplained.find(habit => habit.cornerId === cornerId) ?? null;

/** A signed change in words: `zero` when it rounds to nothing. */
function say(delta: number | null, digits: number, zero: string, more: (n: string) => string, less: (n: string) => string): string | null {
  if (delta === null) return null;
  const amount = Math.abs(delta).toFixed(digits);
  if (Number(amount) === 0) return zero;
  return delta > 0 ? more(amount) : less(amount);
}

const diff = (now: number | null, then: number | null) => (now === null || then === null ? null : now - then);

/** A rule's cue, the driver now minus then, as it is said (`digits`), and the sign that means the habit is being fixed. */
interface CueMeasure {
  delta: number | null;
  digits: number;
  better: 1 | -1;
  zero: string;
  more: (n: string) => string;
  less: (n: string) => string;
}

function cueMeasure(rule: Exclude<HabitRule, 'gear'>, now: TurnUsual, then: TurnUsual, lengthM: number): CueMeasure {
  switch (rule) {
    case 'brakeEarly':
      return { delta: now.brakeM === null || then.brakeM === null ? null : lapGapM(then.brakeM, now.brakeM, lengthM), digits: 0, better: 1,
        zero: 'same brake point', more: n => `brake ${n} m later`, less: n => `brake ${n} m earlier` };
    case 'apexEarly':
      return { delta: now.minSpeedM === null || then.minSpeedM === null ? null : lapGapM(then.minSpeedM, now.minSpeedM, lengthM), digits: 0, better: 1,
        zero: 'same slowest point', more: n => `slowest point ${n} m later`, less: n => `slowest point ${n} m earlier` };
    case 'overSlowing':
    case 'inFastOutSlow':
      return { delta: diff(now.minKmh, then.minKmh), digits: 0, better: rule === 'overSlowing' ? 1 : -1,
        zero: 'same speed in the middle', more: n => `${n} km/h more in the middle`, less: n => `${n} km/h less in the middle` };
    case 'partThrottle':
      return { delta: diff(now.partThrottleSec, then.partThrottleSec), digits: 1, better: -1,
        zero: 'same part throttle', more: n => `${n} s more part throttle`, less: n => `${n} s less part throttle` };
    case 'dragBrake':
      return { delta: diff(now.brakeSec, then.brakeSec), digits: 1, better: -1,
        zero: 'same time braking', more: n => `braking ${n} s longer`, less: n => `braking ${n} s shorter` };
    case 'brakesWhereLift': {
      const points = diff(now.peakBrake, then.peakBrake);
      return { delta: points === null ? null : points * 100, digits: 0, better: -1,
        zero: 'same peak brake', more: n => `peak brake ${n} points harder`, less: n => `peak brake ${n} points lighter` };
    }
    case 'coast':
      return { delta: diff(now.coastSec, then.coastSec), digits: 1, better: -1,
        zero: 'same coasting', more: n => `${n} s more coasting`, less: n => `${n} s less coasting` };
  }
}

/** The cue a rule names, the driver now against the driver then (own usual against own usual). */
export function habitCue(rule: HabitRule | null, now: TurnUsual | undefined, then: TurnUsual | undefined, lengthM: number): string | null {
  if (!rule || !now || !then) return null;
  if (rule === 'gear') {
    if (now.gear === null || then.gear === null) return null;
    return now.gear === then.gear ? 'same gear' : `gear ${now.gear} (was ${then.gear})`;
  }
  const { delta, digits, zero, more, less } = cueMeasure(rule, now, then, lengthM);
  return say(delta, digits, zero, more, less);
}

/** Whether the driver's own cue moved the fixing way by at least what the cue says (a gear habit: another gear). */
function habitCueImproved(rule: HabitRule, now: TurnUsual | undefined, then: TurnUsual | undefined, lengthM: number): boolean {
  if (!now || !then) return false;
  if (rule === 'gear') return now.gear !== null && then.gear !== null && now.gear !== then.gear;
  const { delta, digits, better } = cueMeasure(rule, now, then, lengthM);
  return delta !== null && Number((delta * better).toFixed(digits)) > 0;
}

/** The cue must move in the corrective direction and the corner must hold its pace. */
function progressOnHabit(before: CornerHabit, now: AnalysedSession, then: AnalysedSession, gainSec: number | null, lengthM: number): SessionHabitProgress | null {
  const { turnId, turnLabel, half, rule } = before;
  if (!rule || gainSec === null || gainSec < 0) return null;
  const current = now.turns.get(turnId);
  const previous = then.turns.get(turnId);
  // For a gear habit, moving toward the prior reference gear is evidence; arbitrary gear changes are not.
  if (rule === 'gear' && (current?.gear == null || previous?.gear == null || before.gap === null ||
    Math.abs(current.gear - (previous.gear - before.gap)) >= Math.abs(before.gap))) return null;
  if (!habitCueImproved(rule, current, previous, lengthM)) return null;
  const cue = habitCue(rule, current, previous, lengthM);
  if (!cue) return null;
  if (now.analysis.carDifferences.some(sameHabit(before))) return null;
  const stillPresent = now.analysis.habits.some(sameHabit(before));
  return { turnId, turnLabel, half, rule, status: stillPresent ? 'improving' : 'resolved', cue, gainSec };
}

/**
 * Compare previously ranked habits using the driver's usual times. A current reference confirms the corner
 * could be assessed for recurrence. A ranking drop by itself never resolves a habit.
 */
export function sessionHabitProgress(now: AnalysedSession, then: AnalysedSession, lengthM: number): SessionHabitProgress[] {
  const current = new Map(now.analysis.corners.map(corner => [corner.id, corner]));
  const previous = new Map(then.analysis.corners.map(corner => [corner.id, corner]));
  const seen = new Set<string>();
  return then.analysis.habits.flatMap(habit => {
    const key = [habit.turnId, habit.rule].join('|');
    if (seen.has(key)) return [];
    seen.add(key);
    const corner = current.get(habit.cornerId);
    const prior = previous.get(habit.cornerId)?.usualSec ?? null;
    if (corner?.usualSec == null || !corner.reference || prior === null) return [];
    const progress = progressOnHabit(habit, now, then, prior - corner.usualSec, lengthM);
    return progress ? [progress] : [];
  });
}

/** A habit now against the driver's session before: new, or what its cue did since. */
export function habitChange(habit: CornerHabit, now: AnalysedSession, then: AnalysedSession, lengthM: number): HabitChange {
  return {
    turnId: habit.turnId, half: habit.half, rule: habit.rule,
    isNew: !habitsOf(then.analysis).some(sameHabit(habit)),
    cue: habitCue(habit.rule, now.turns.get(habit.turnId), then.turns.get(habit.turnId), lengthM),
  };
}

const refOf = ({ sessionId, timestamp, sessionType }: AnalysisSessionRef): AnalysisSessionRef => ({ sessionId, timestamp, sessionType });

/**
 * A corner's habit over the driver's analysed sessions at the layout in one car, newest first: the latest main habit,
 * how many of the last HISTORY_SESSIONS show it, and the corner against the session before (time, the habit's cue, or
 * that session's main habit fixed). Habit losses are never compared across sessions: each is against its session's
 * reference, which changes; the driver against themself is.
 */
export function cornerHabitTrend(cornerId: number, sessions: readonly AnalysedSession[], lengthM: number): CornerHabitTrend | null {
  const [now, then] = sessions;
  const cornerOf = (session: AnalysedSession | undefined) => session?.analysis.corners.find(corner => corner.id === cornerId);
  const usualOf = (session: AnalysedSession | undefined) => cornerOf(session)?.usualSec ?? null;
  const nowSec = usualOf(now);
  if (!now || nowSec === null) return null;
  const { usualLapOrdinal, reference } = cornerOf(now) ?? {};
  const habit = mainHabit(now.analysis, cornerId);
  // A session without a usual through the corner could not show the habit: it is not counted either way.
  const recent = sessions.slice(0, HISTORY_SESSIONS).filter(session => usualOf(session) !== null);
  const thenSec = usualOf(then);
  const before = then && mainHabit(then.analysis, cornerId);
  const gainSec = thenSec === null ? null : thenSec - nowSec;
  return {
    session: refOf(now),
    habit: habit && { line: habit.line, detail: habit.detail, lossSec: habit.lossSec, rule: habit.rule },
    seen: habit ? recent.filter(session => habitsOf(session.analysis).some(sameHabit(habit))).length : 0,
    of: recent.length,
    since: then ? refOf(then) : null,
    change: habit && then ? habitChange(habit, now, then, lengthM) : null,
    // Without a reference now, no habit is measured at the corner: a habit gone from the list is not fixed.
    fixed: then && before && reference && progressOnHabit(before, now, then, gainSec, lengthM)?.status === 'resolved' ? before.line : null,
    view: usualLapOrdinal !== null && usualLapOrdinal !== undefined && reference
      ? {
        lap: { sessionId: now.sessionId, driverOrdinal: now.driverOrdinal, lapOrdinal: usualLapOrdinal },
        reference: { sessionId: reference.sessionId, driverOrdinal: reference.driverOrdinal, lapOrdinal: reference.usualLapOrdinal, name: reference.name },
      }
      : null,
  };
}
