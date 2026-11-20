import type {
  AnalysisSessionRef, CornerAnalysis, CornerHabit, CornerHabitTrend, HabitChange, HabitRule,
} from '../../types/corners/cornerAnalysis.js';
import { lapGapM, type TurnUsual } from './turnUsual.js';

/** "Seen in N of the last few": the sessions a habit's history reads (driver, 2026-11-20: "how often it shows"). */
export const HISTORY_SESSIONS = 5;

/** One analysed session of the driver at the layout, with their usual through each turn. */
export interface AnalysedSession extends AnalysisSessionRef {
  analysis: CornerAnalysis;
  turns: ReadonlyMap<number, TurnUsual>;
}

/** The same habit across sessions: the same rule at the same turn (the half can move with the slowest point). */
const sameHabit = (a: Pick<CornerHabit, 'turnId' | 'rule'>) => (b: Pick<CornerHabit, 'turnId' | 'rule'>) => a.turnId === b.turnId && a.rule === b.rule;
const habitsOf = (analysis: CornerAnalysis): CornerHabit[] => [...analysis.habits, ...analysis.unexplained];

/** A corner's main habit: the highest priority one, else its biggest loss no rule explains. */
export const mainHabit = (analysis: CornerAnalysis, cornerId: number): CornerHabit | null =>
  analysis.habits.find(habit => habit.cornerId === cornerId) ?? analysis.unexplained.find(habit => habit.cornerId === cornerId) ?? null;

/** A signed change in words: `zero` when it rounds to nothing. */
function say(delta: number | null, digits: number, zero: string, more: (n: string) => string, less: (n: string) => string): string | null {
  if (delta === null) return null;
  const amount = Math.abs(delta).toFixed(digits);
  if (Number(amount) === 0) return zero;
  return delta > 0 ? more(amount) : less(amount);
}

const diff = (now: number | null, then: number | null) => (now === null || then === null ? null : now - then);

/** The cue a rule names, the driver now against the driver then (own usual against own usual). */
export function habitCue(rule: HabitRule | null, now: TurnUsual | undefined, then: TurnUsual | undefined, lengthM: number): string | null {
  if (!rule || !now || !then) return null;
  switch (rule) {
    case 'brakeEarly':
      return say(now.brakeM === null || then.brakeM === null ? null : lapGapM(then.brakeM, now.brakeM, lengthM), 0,
        'same brake point', n => `brake ${n} m later`, n => `brake ${n} m earlier`);
    case 'apexEarly':
      return say(now.minSpeedM === null || then.minSpeedM === null ? null : lapGapM(then.minSpeedM, now.minSpeedM, lengthM), 0,
        'same slowest point', n => `slowest point ${n} m later`, n => `slowest point ${n} m earlier`);
    case 'overSlowing':
    case 'inFastOutSlow':
      return say(diff(now.minKmh, then.minKmh), 0, 'same speed in the middle', n => `${n} km/h more in the middle`, n => `${n} km/h less in the middle`);
    case 'partThrottle':
      return say(diff(now.partThrottleSec, then.partThrottleSec), 1, 'same part throttle', n => `${n} s more part throttle`, n => `${n} s less part throttle`);
    case 'dragBrake':
      return say(diff(now.brakeSec, then.brakeSec), 1, 'same time braking', n => `braking ${n} s longer`, n => `braking ${n} s shorter`);
    case 'brakesWhereLift': {
      const points = diff(now.peakBrake, then.peakBrake);
      return say(points === null ? null : points * 100, 0, 'same peak brake', n => `peak brake ${n} points harder`, n => `peak brake ${n} points lighter`);
    }
    case 'coast':
      return say(diff(now.coastSec, then.coastSec), 1, 'same coasting', n => `${n} s more coasting`, n => `${n} s less coasting`);
    case 'gear':
      if (now.gear === null || then.gear === null) return null;
      return now.gear === then.gear ? 'same gear' : `gear ${now.gear} (was ${then.gear})`;
  }
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
 * that session's main habit gone). Habit losses are never compared across sessions: each is against its session's
 * reference, which changes; the driver against themself is.
 */
export function cornerHabitTrend(cornerId: number, sessions: readonly AnalysedSession[], lengthM: number): CornerHabitTrend | null {
  const [now, then] = sessions;
  const usualOf = (session: AnalysedSession | undefined) => session?.analysis.corners.find(corner => corner.id === cornerId)?.usualSec ?? null;
  const nowSec = usualOf(now);
  if (!now || nowSec === null) return null;
  const habit = mainHabit(now.analysis, cornerId);
  // A session without a usual through the corner could not show the habit: it is not counted either way.
  const recent = sessions.slice(0, HISTORY_SESSIONS).filter(session => usualOf(session) !== null);
  const thenSec = usualOf(then);
  const before = then && mainHabit(then.analysis, cornerId);
  return {
    session: refOf(now),
    habit: habit && { line: habit.line, lossSec: habit.lossSec, rule: habit.rule },
    seen: habit ? recent.filter(session => habitsOf(session.analysis).some(sameHabit(habit))).length : 0,
    of: recent.length,
    since: then ? refOf(then) : null,
    gainSec: thenSec === null ? null : thenSec - nowSec,
    change: habit && then ? habitChange(habit, now, then, lengthM) : null,
    fixed: before && !habitsOf(now.analysis).some(sameHabit(before)) ? before.line : null,
  };
}
