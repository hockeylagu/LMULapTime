import { median } from '../pitStops.js';
import type { CornerPass } from '../../types/corners/cornerPasses.js';
import type {
  AnalysisCorner, AnalysisDriver, CornerAnalysis, CornerAnalysisInput, CornerHabit, CornerMistake, CornerReference, MistakeCause, TurnHalf,
} from '../../types/corners/cornerAnalysis.js';
import { HABIT_RULES } from './habitRules.js';
import { fromApexSec, lapGapM, passSec, toApexSec, turnUsual, type TurnUsual } from './turnUsual.js';

/** The habits shown (the first of the ranked list): a few things to work on, never everything (driver, 2026-11-19). */
export const MAX_HABITS = 3;
/** A half of a turn losing less than this per lap (s) gives no line. */
export const HALF_LOSS_SEC = 0.02;
/** A turn losing at least this (s) with no rule explaining it is listed as unexplained. */
export const UNEXPLAINED_SEC = 0.05;
/** A rule explains a loss when it holds on at least this share of the counted laps. */
export const MIN_REPEATABILITY = 0.5;
/**
 * Slowest points further apart than this (m): the halves cover different road and are not compared; the whole turn is
 * (validation, 2026-11-19: a 20 m earlier apex showed as 0.5 s lost out of it).
 */
export const SPLIT_MAX_M = 5;
/** A lap loses to the driver's own usual by more than max(this, MISTAKE_SPREADS × the turn's spread) (s): a mistake. */
export const MISTAKE_MIN_SEC = 0.1;
export const MISTAKE_SPREADS = 3;
/** A car this close ahead (s) at the pass is traffic. */
export const TRAFFIC_SEC = 1;
/** A lap this much longer (s) on part throttle out of the slowest point than the driver's usual lifted. */
export const LIFT_MISTAKE_SEC = 0.5;
/** A reference from another session counts this much less: grip and patches move whole corners. */
export const OTHER_SESSION_CONFIDENCE = 0.8;
/** The session's reference has a usual through at least this share of the driver's corners. */
export const REFERENCE_COVERAGE = 0.8;
/** The same-car check needs a driver gaining at least this share of what the reference gains on the driver per lap. */
export const SAME_CAR_SHARE = 2 / 3;

const passesOf = (driver: AnalysisDriver, turnId: number): CornerPass[] =>
  driver.laps.flatMap(lap => lap.passes.filter(pass => pass.segment === turnId));

interface CornerUsual { sec: number; lapOrdinal: number }

/**
 * A driver's usual time through a corner: the median over laps with a pass through every one of its turns, and the lap
 * closest to it (the earliest on a tie).
 */
function cornerUsual(driver: AnalysisDriver, corner: AnalysisCorner, minLaps: number): CornerUsual | null {
  const sums = driver.laps.flatMap(lap => {
    const passes = corner.turnIds.map(id => lap.passes.find(pass => pass.segment === id));
    return passes.every(pass => pass !== undefined) ? [{ lapOrdinal: lap.lapOrdinal, sec: passes.reduce((sum, pass) => sum + passSec(pass), 0) }] : [];
  });
  const sec = sums.length >= minLaps ? median(sums.map(sum => sum.sec)) : null;
  if (sec === null) return null;
  const closest = sums.reduce((best, sum) => (Math.abs(sum.sec - sec) < Math.abs(best.sec - sec) ? sum : best));
  return { sec, lapOrdinal: closest.lapOrdinal };
}

const cornerUsualSec = (driver: AnalysisDriver, corner: AnalysisCorner, minLaps: number) => cornerUsual(driver, corner, minLaps)?.sec ?? null;

interface ChosenReference { driver: AnalysisDriver; usual: CornerReference }

const referenceOf = (driver: AnalysisDriver, usual: CornerUsual): ChosenReference => ({
  driver,
  usual: {
    sessionId: driver.sessionId, driverOrdinal: driver.driverOrdinal, name: driver.name, car: driver.car, sameSession: driver.sameSession,
    laps: driver.laps.length, usualSec: usual.sec, usualLapOrdinal: usual.lapOrdinal,
  },
});

/**
 * One reference for the whole session, so the lines compare one way of driving the lap (validation, 2026-11-19): the
 * analysed session's quickest over the driver's corners when quicker than the driver, else the layout's quickest.
 */
function sessionReference(input: CornerAnalysisInput, ownSecs: Map<number, number | null>, candidates = input.others): AnalysisDriver | null {
  const corners = input.corners.filter(corner => ownSecs.get(corner.id) != null);
  const ranked = candidates.flatMap(driver => {
    // The time gained on the driver over the corners both have: a candidate missing one corner still compares fairly.
    let shared = 0, gainSec = 0;
    for (const corner of corners) {
      const sec = cornerUsualSec(driver, corner, input.minReferenceLaps);
      if (sec === null) continue;
      shared++;
      gainSec += (ownSecs.get(corner.id) ?? 0) - sec;
    }
    return corners.length && shared / corners.length >= REFERENCE_COVERAGE ? [{ driver, gainSec }] : [];
  }).sort((a, b) => b.gainSec - a.gainSec);
  const sameSession = ranked.find(({ driver, gainSec }) => driver.sameSession && gainSec > 0);
  return (sameSession ?? ranked[0])?.driver ?? null;
}

/**
 * The check for a reference in another car: the quickest driver in the driver's own car, when quicker than the driver
 * over the lap (same session first). A loss they do not share is the car, not the driving (driver, 2026-11-20).
 */
function sameCarReference(input: CornerAnalysisInput, ownSecs: Map<number, number | null>, session: AnalysisDriver | null): AnalysisDriver | null {
  const { car } = input.driver;
  if (car === null || !session || session.car === car) return null;
  const sameCar = sessionReference(input, ownSecs, input.others.filter(driver => driver.car === car));
  if (!sameCar) return null;
  const gainOf = (other: AnalysisDriver) => input.corners.reduce((sum, corner) => {
    const own = ownSecs.get(corner.id), theirs = cornerUsualSec(other, corner, input.minReferenceLaps);
    return own == null || theirs === null ? sum : sum + own - theirs;
  }, 0);
  // Only a driver who shows what the car can do: most of the way from the driver to the reference over the lap.
  // A weaker one is often slower than the driver at the very turn, which says nothing about the car (validation, 2026-11-20).
  const gainSec = gainOf(sameCar);
  return gainSec > 0 && gainSec >= SAME_CAR_SHARE * gainOf(session) ? sameCar : null;
}

/** The usual time a half of the driver's turn loses to another driver's usual (s), null when it cannot be measured. */
const medianHalfLoss = (own: readonly CornerPass[], other: TurnUsual, half: TurnHalf): number | null =>
  median(own.flatMap(pass => {
    const loss = halfLossOf(pass, other, half);
    return loss === null ? [] : [loss];
  }));

/** A corner the session's reference lacks: the class's fastest usual there, the analysed session's when quicker. */
function cornerReference(input: CornerAnalysisInput, corner: AnalysisCorner, ownSec: number | null): ChosenReference | null {
  const ranked = input.others.flatMap(driver => {
    const usual = cornerUsual(driver, corner, input.minReferenceLaps);
    return usual === null ? [] : [{ driver, usual }];
  }).sort((a, b) => a.usual.sec - b.usual.sec);
  const chosen = ranked.find(({ driver, usual }) => driver.sameSession && (ownSec === null || usual.sec < ownSec)) ?? ranked[0];
  return chosen ? referenceOf(chosen.driver, chosen.usual) : null;
}

const halfLossOf = (own: CornerPass, reference: TurnUsual, half: TurnHalf): number | null => {
  if (half === 'whole') return passSec(own) - reference.sec;
  const ownHalf = half === 'in' ? toApexSec(own) : fromApexSec(own);
  const referenceHalf = half === 'in' ? reference.toApexSec : reference.fromApexSec;
  return ownHalf === null || referenceHalf === null ? null : ownHalf - referenceHalf;
};

/** Whether the turn splits at the slowest point: both drivers slowest at about the same place. */
function splits(own: TurnUsual, reference: TurnUsual, lengthM: number): boolean {
  return own.minSpeedM !== null && reference.minSpeedM !== null && own.toApexSec !== null && reference.toApexSec !== null
    && Math.abs(lapGapM(own.minSpeedM, reference.minSpeedM, lengthM)) <= SPLIT_MAX_M;
}

interface TurnContext {
  corner: AnalysisCorner;
  turnId: number;
  turnLabel: string;
  own: CornerPass[];
  ownUsual: TurnUsual;
  reference: TurnUsual;
  referenceName: string;
  /** The reference drives the driver's car: only then do gear numbers compare. */
  sameCar: boolean;
  confidence: number;
  lengthM: number;
}

/** The habit lines of one turn against the reference: each half that loses time, explained by a rule or not. */
function turnHabits(context: TurnContext): CornerHabit[] {
  const { own, ownUsual, reference, lengthM } = context;
  const halves: TurnHalf[] = splits(ownUsual, reference, lengthM) ? ['in', 'out'] : ['whole'];
  return halves.flatMap((half): CornerHabit[] => {
    const losses = own.flatMap(pass => {
      const loss = halfLossOf(pass, reference, half);
      return loss === null ? [] : [loss];
    });
    const lossSec = median(losses);
    if (lossSec === null || lossSec < HALF_LOSS_SEC) return [];
    const base = { cornerId: context.corner.id, turnId: context.turnId, turnLabel: context.turnLabel, half, lossSec, sameCarLossSec: null, confidence: context.confidence };
    for (const spec of HABIT_RULES.filter(rule => (half === 'whole' || rule.half === half) && (rule.rule !== 'gear' || context.sameCar))) {
      const checks = own.map(pass => spec.check(pass, reference, lengthM));
      const held = checks.filter(check => check.holds);
      const repeatability = held.length / own.length;
      if (repeatability < MIN_REPEATABILITY) continue;
      const gap = median(held.flatMap(check => (check.gap === null ? [] : [check.gap])));
      return [{
        ...base, rule: spec.rule, gap, repeatability, priority: lossSec * repeatability * context.confidence,
        line: spec.line(gap ?? 0, context.turnLabel, reference),
        detail: spec.detail(gap ?? 0, ownUsual, reference, context.referenceName),
      }];
    }
    const repeatability = losses.filter(loss => loss >= HALF_LOSS_SEC).length / own.length;
    const where = half === 'in' ? 'into the slowest point' : half === 'out' ? 'out of the slowest point' : 'through the turn';
    return [{
      ...base, rule: null, gap: null, repeatability, priority: lossSec * repeatability * context.confidence,
      line: `${context.turnLabel}: ${lossSec.toFixed(2)} s ${where} that no measured point explains`,
      detail: 'Open the laps side by side',
    }];
  });
}

const MISTAKE_LINES: Record<Exclude<MistakeCause, null>, string> = {
  traffic: 'a car close ahead', brakeEarly: 'braked early', lockup: 'a lockup (ABS)', slowMiddle: 'slow in the middle',
  lift: 'a lift', slowExit: 'a slow exit',
};

/** Why a lap lost time in a turn against the driver's own usual there; null when nothing measured stands out. */
function mistakeCause(pass: CornerPass, usual: TurnUsual, lengthM: number): MistakeCause {
  if (pass.aheadGapSec !== null && pass.aheadGapSec <= TRAFFIC_SEC) return 'traffic';
  if (pass.absSec - usual.absSec >= 0.3) return 'lockup';
  if (pass.brakeM !== null && usual.brakeM !== null && lapGapM(pass.brakeM, usual.brakeM, lengthM) >= 10) return 'brakeEarly';
  if (pass.partThrottleSec !== null && usual.partThrottleSec !== null && pass.partThrottleSec - usual.partThrottleSec >= LIFT_MISTAKE_SEC) return 'lift';
  if (pass.minSpeedKmh !== null && usual.minKmh !== null && usual.minKmh - pass.minSpeedKmh >= 5) return 'slowMiddle';
  if (pass.exitSpeedKmh !== null && usual.exitKmh !== null && usual.exitKmh - pass.exitSpeedKmh >= 5) return 'slowExit';
  return null;
}

function turnMistakes(driver: AnalysisDriver, corner: AnalysisCorner, turnId: number, turnLabel: string, usual: TurnUsual, lengthM: number): CornerMistake[] {
  const limit = Math.max(MISTAKE_MIN_SEC, MISTAKE_SPREADS * usual.spreadSec);
  return driver.laps.flatMap(lap => {
    const pass = lap.passes.find(item => item.segment === turnId);
    if (!pass) return [];
    const lossSec = passSec(pass) - usual.sec;
    if (lossSec <= limit) return [];
    const cause = mistakeCause(pass, usual, lengthM);
    const why = cause ? MISTAKE_LINES[cause] : 'nothing measured stands out';
    return [{ lapOrdinal: lap.lapOrdinal, cornerId: corner.id, turnId, turnLabel, lossSec, cause, line: `${turnLabel} +${lossSec.toFixed(2)} s: ${why}` }];
  });
}

/**
 * The driver's corners at a layout in one session: habits against the class's fastest usual through each corner
 * (the analysed session's quickest when someone was quicker there), and mistakes against the driver's own usual.
 * Deterministic: fixed rules on the measured passes (habitRules.ts, mistakeCause).
 *
 * Validated against blind hand analyses (subagents, the engine run apart, compared by turn and reason): tuned on 16
 * sessions, then a frozen held-out set of 8 in classes the tuning never saw (10 of the hand's 24 top-3 habits in the
 * engine's top 3, 19 of its 24 top lines at a turn the hand named, 2026-11-20). The usual disagreement is one loss
 * named two ways (the hand's early brake, the engine's slower slowest point). A new rule or cue goes in only after a
 * held-out set no round has used, and only when its lap-to-lap noise sits below the gap worth telling. Tried and
 * dropped against such a set (2026-11-20, the corner-map branch's technique cues): brake build and trail braking
 * (checked before the speed and points they took the hand's early brakes; after them they never fired), throttle
 * hesitation (matched nothing), ABS while turning and brake re-applies (never fired), steering reversals as a caught
 * slide (3 of 8 right), and lift and coast as a fuel-saving filter on mistakes (it hid real ones, a spin among them).
 */
export function analyzeCorners(input: CornerAnalysisInput): CornerAnalysis {
  const { driver, lengthM } = input;
  const labels = new Map(input.turns.map(turn => [turn.id, turn.label]));
  const habits: CornerHabit[] = [];
  const mistakes: CornerMistake[] = [];
  const ownUsuals = new Map(input.corners.map(corner => [corner.id, cornerUsual(driver, corner, 1)]));
  const ownSecs = new Map(input.corners.map(corner => [corner.id, ownUsuals.get(corner.id)?.sec ?? null]));
  const session = sessionReference(input, ownSecs);
  const sameCar = sameCarReference(input, ownSecs, session);
  const corners = input.corners.map(corner => {
    const usualSec = ownSecs.get(corner.id) ?? null;
    const sessionUsual = session && cornerUsual(session, corner, input.minReferenceLaps);
    const chosen = session && sessionUsual ? referenceOf(session, sessionUsual) : cornerReference(input, corner, usualSec);
    for (const turnId of corner.turnIds) {
      const turnLabel = labels.get(turnId) || `turn ${turnId + 1}`;
      const own = passesOf(driver, turnId);
      const ownUsual = turnUsual(own, lengthM);
      if (!ownUsual) continue;
      mistakes.push(...turnMistakes(driver, corner, turnId, turnLabel, ownUsual, lengthM));
      const reference = chosen && turnUsual(passesOf(chosen.driver, turnId), lengthM);
      if (!chosen || !reference) continue;
      const confidence = Math.min(1, own.length / 5) * Math.min(1, reference.laps / 3) * (chosen.driver.sameSession ? 1 : OTHER_SESSION_CONFIDENCE);
      const sameCarUsual = sameCar && chosen.driver !== sameCar ? turnUsual(passesOf(sameCar, turnId), lengthM) : null;
      habits.push(...turnHabits({ corner, turnId, turnLabel, own, ownUsual, reference, referenceName: chosen.driver.name,
        sameCar: driver.car !== null && driver.car === chosen.driver.car, confidence, lengthM })
        .map(habit => ({ ...habit, sameCarLossSec: sameCarUsual && medianHalfLoss(own, sameCarUsual, habit.half) })));
    }
    return {
      id: corner.id, label: corner.label, name: corner.name, turnIds: corner.turnIds, usualSec,
      usualLapOrdinal: ownUsuals.get(corner.id)?.lapOrdinal ?? null,
      lossSec: usualSec !== null && chosen ? usualSec - chosen.usual.usualSec : null, reference: chosen?.usual ?? null,
    };
  });
  const byPriority = (a: CornerHabit, b: CornerHabit) => b.priority - a.priority;
  // A loss the quickest driver in the same car does not share is the car: told apart, never coached.
  const isCar = (habit: CornerHabit) => habit.sameCarLossSec !== null && habit.sameCarLossSec < HALF_LOSS_SEC;
  const driving = habits.filter(habit => !isCar(habit));
  return {
    laps: driver.laps.length,
    corners,
    sameCarReference: sameCar && {
      sessionId: sameCar.sessionId, driverOrdinal: sameCar.driverOrdinal, name: sameCar.name, car: sameCar.car, sameSession: sameCar.sameSession, laps: sameCar.laps.length,
    },
    habits: driving.filter(habit => habit.rule !== null).sort(byPriority),
    unexplained: driving.filter(habit => habit.rule === null && habit.lossSec >= UNEXPLAINED_SEC).sort(byPriority),
    carDifferences: habits.filter(habit => isCar(habit) && habit.lossSec >= UNEXPLAINED_SEC).sort(byPriority),
    mistakes: mistakes.sort((a, b) => a.lapOrdinal - b.lapOrdinal || a.turnId - b.turnId),
  };
}
