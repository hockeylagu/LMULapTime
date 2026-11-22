import { median } from '../pitStops.js';
import type { CornerPass } from '../../types/corners/cornerPasses.js';
import type {
  AnalysisCorner, AnalysisDriver, CornerAnalysis, CornerAnalysisInput, CornerHabit, CornerMistake, CornerReference, LapTurnComparison, LapTurnDifference, MistakeCause,
  TurnHalf, TurnMeasures,
} from '../../types/corners/cornerAnalysis.js';
import { habitActions, habitCauses, habitDetail, HABIT_RULES, lossKind, lossKindText, turnArc, turnMeasures } from './habitRules.js';
import { fromApexSec, isRepresentativeCornerPass, lapGapM, passSec, toApexSec, turnUsual, type TurnUsual } from './turnUsual.js';

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
/** A lap with ABS working this much longer (s) than the driver's usual locked up. */
export const LOCKUP_ABS_SEC = 0.3;
/** A lap braking this much earlier (m) than the driver's usual braked early. */
export const EARLY_BRAKE_MISTAKE_M = 10;
/** A lap this much slower (km/h) at the slowest point, or out of the turn, than the driver's usual. */
export const SLOW_MISTAKE_KMH = 5;
/** The target has a usual through at least this share of the corners the candidates measured. */
export const REFERENCE_COVERAGE = 0.8;
/** The same-car check needs a driver gaining at least this share of what the reference gains on the driver per lap. */
export const SAME_CAR_SHARE = 2 / 3;

const passesOf = (driver: AnalysisDriver, turnId: number): CornerPass[] =>
  driver.laps.flatMap(lap => lap.passes.filter(pass => pass.segment === turnId && isRepresentativeCornerPass(pass)));

interface CornerUsual { sec: number; lapOrdinal: number }

/**
 * A driver's usual time through a corner: the median over laps with a representative pass through every one of its
 * turns, and the lap closest to it (the earliest on a tie).
 */
function cornerUsual(driver: AnalysisDriver, corner: AnalysisCorner, minLaps: number): CornerUsual | null {
  const sums = driver.laps.flatMap(lap => {
    const passes = corner.turnIds.map(id => lap.passes.find(pass => pass.segment === id && isRepresentativeCornerPass(pass)));
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
    sessionId: driver.sessionId, driverOrdinal: driver.driverOrdinal, name: driver.name, car: driver.car,
    laps: driver.laps.length, usualSec: usual.sec, usualLapOrdinal: usual.lapOrdinal,
  },
});

/**
 * The target: one driver for every session at the layout, so the lines compare one way of driving the lap (validation,
 * 2026-11-19) and a corner's cost compares from session to session (driver, 2026-11-20). The best true pace among the
 * candidates with a usual through most of the corners any candidate measured; the lower session id on a tie. Nothing
 * of the driver's own session enters the choice.
 */
function targetOf(input: CornerAnalysisInput, candidates = input.others): AnalysisDriver | null {
  const hasUsual = (driver: AnalysisDriver, corner: AnalysisCorner) => cornerUsualSec(driver, corner, input.minReferenceLaps) !== null;
  const measured = input.corners.filter(corner => input.others.some(driver => hasUsual(driver, corner)));
  const covers = (driver: AnalysisDriver) => measured.filter(corner => hasUsual(driver, corner)).length >= REFERENCE_COVERAGE * measured.length;
  return candidates
    .flatMap(driver => (driver.paceSec === null ? [] : [{ driver, paceSec: driver.paceSec }]))
    .sort((a, b) => a.paceSec - b.paceSec || (a.driver.sessionId < b.driver.sessionId ? -1 : a.driver.sessionId > b.driver.sessionId ? 1 : a.driver.driverOrdinal - b.driver.driverOrdinal))
    .find(({ driver }) => measured.length > 0 && covers(driver))?.driver ?? null;
}

/**
 * The check for a target in another car: the best true pace in the driver's own car, when quicker than the driver
 * over the lap. A loss they do not share is the car, not the driving (driver, 2026-11-20).
 */
function sameCarReference(input: CornerAnalysisInput, ownSecs: Map<number, number | null>, target: AnalysisDriver | null): AnalysisDriver | null {
  const { car } = input.driver;
  if (car === null || !target || target.car === car) return null;
  const sameCar = targetOf(input, input.others.filter(driver => driver.car === car));
  if (!sameCar) return null;
  const gainOf = (other: AnalysisDriver) => input.corners.reduce((sum, corner) => {
    const own = ownSecs.get(corner.id), theirs = cornerUsualSec(other, corner, input.minReferenceLaps);
    return own == null || theirs === null ? sum : sum + own - theirs;
  }, 0);
  // Only a driver who shows what the car can do: most of the way from the driver to the target over the lap.
  // A weaker one is often slower than the driver at the very turn, which says nothing about the car (validation, 2026-11-20).
  const gainSec = gainOf(sameCar);
  return gainSec > 0 && gainSec >= SAME_CAR_SHARE * gainOf(target) ? sameCar : null;
}

/** The usual time a half of the driver's turn loses to another driver's usual (s), null when it cannot be measured. */
const medianHalfLoss = (own: readonly CornerPass[], other: TurnUsual, half: TurnHalf): number | null =>
  median(own.flatMap(pass => {
    const loss = halfLossOf(pass, other, half);
    return loss === null ? [] : [loss];
  }));

/** A corner the target lacks: the candidates' fastest usual there. */
function cornerReference(input: CornerAnalysisInput, corner: AnalysisCorner): ChosenReference | null {
  const [chosen] = input.others.flatMap(driver => {
    const usual = cornerUsual(driver, corner, input.minReferenceLaps);
    return usual === null ? [] : [{ driver, usual }];
  }).sort((a, b) => a.usual.sec - b.usual.sec);
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
  /** The target drives the driver's car: only then do gear numbers compare. */
  sameCar: boolean;
  confidence: number;
  lengthM: number;
}

/** The habit lines of one turn against the reference: each half that loses time, explained by a rule or not. */
function turnHabits(context: TurnContext): CornerHabit[] {
  const { own, ownUsual, reference, lengthM } = context;
  const halves: TurnHalf[] = splits(ownUsual, reference, lengthM) ? ['in', 'out'] : ['whole'];
  // Each pass as a usual of one, so a rule measures a lap the way it measures the usual.
  const each = own.flatMap(pass => turnUsual([pass], lengthM) ?? []);
  const kind = lossKind(ownUsual, reference);
  const arc = turnArc(ownUsual, reference);
  const speeds = { minKmh: ownUsual.minKmh, targetMinKmh: reference.minKmh, exitKmh: ownUsual.exitKmh, targetExitKmh: reference.exitKmh };
  const habits = halves.flatMap((half): CornerHabit[] => {
    const losses = own.flatMap(pass => {
      const loss = halfLossOf(pass, reference, half);
      return loss === null ? [] : [loss];
    });
    const lossSec = median(losses);
    if (lossSec === null || lossSec < HALF_LOSS_SEC) return [];
    const base = {
      cornerId: context.corner.id, turnId: context.turnId, turnLabel: context.turnLabel, half, lossSec, sameCarLossSec: null,
      confidence: context.confidence, speeds, kind, arc,
    };
    // A slower exit is a result, not something to do: when the apex is slower too, the time lost on the way out
    // comes from there, so the out half checks the minimum speed first (driver, 2026-11-21).
    for (const spec of HABIT_RULES.filter(rule => half === 'whole' || rule.half === half || (half === 'out' && rule.rule === 'overSlowing'))) {
      // The number said is the usual against the usual, the one the detail line and the series over sessions show.
      // A rule that holds on half the laps while the usual lap is level with the target (short sessions) names
      // nothing: a habit is what the driver usually does (driver, 2026-11-21).
      const gap = spec.gap(ownUsual, reference, lengthM);
      if (gap === null || !spec.holds(gap, ownUsual, reference)) continue;
      const held = each.filter(usual => {
        const passGap = spec.gap(usual, reference, lengthM);
        return passGap !== null && (spec.holdsPass ? spec.holdsPass(passGap, usual, reference) : spec.holds(passGap, usual, reference));
      });
      const repeatability = held.length / own.length;
      if (repeatability < MIN_REPEATABILITY) continue;
      const [action = null, ...otherActions] = habitActions(spec.rule, kind, gap, ownUsual, reference, lengthM);
      return [{
        ...base, rule: spec.rule, gap, repeatability, priority: lossSec * repeatability * context.confidence,
        line: spec.line(gap, context.turnLabel),
        detail: habitDetail(spec.rule, ownUsual, reference, kind, arc),
        action, otherActions, causes: habitCauses(half, action, ownUsual, reference, lengthM, context.sameCar),
      }];
    }
    const repeatability = losses.filter(loss => loss >= HALF_LOSS_SEC).length / own.length;
    // The time lost is drawn beside the line, so the line names only where (driver, 2026-11-20).
    const where = half === 'in' ? 'into' : half === 'out' ? 'out of' : 'through';
    return [{
      ...base, rule: null, gap: null, repeatability, priority: lossSec * repeatability * context.confidence,
      line: `Losing time ${where} ${context.turnLabel}: no clear cause`,
      detail: 'Open the laps side by side', action: null, otherActions: [], causes: [],
    }];
  });
  // A slower apex named on both halves is one habit: the whole turn, its two losses added up.
  const [into, out] = habits;
  if (habits.length === 2 && into.rule === 'overSlowing' && out.rule === 'overSlowing') {
    const lossSec = into.lossSec + out.lossSec;
    return [{
      ...into, half: 'whole', lossSec, priority: lossSec * into.repeatability * context.confidence,
      causes: habitCauses('whole', into.action, ownUsual, reference, lengthM, context.sameCar),
    }];
  }
  return habits;
}

/**
 * One lap against another through a turn (the lap view's two laps): each half where `lap` loses time to `other`, with
 * the first headline measure that differs the losing way, the kind of loss and what else differs. The same measures
 * and limits as the habits, read on one pass each as a usual of one. Two single laps are noisier than two usuals, so
 * only a half losing UNEXPLAINED_SEC or more is told, and nothing here is a habit or advice: no action is offered.
 * Null when either pass cannot be measured (a stop).
 */
export function compareLapTurn(lap: CornerPass, other: CornerPass, lengthM: number, sameCar: boolean): LapTurnComparison | null {
  const own = isRepresentativeCornerPass(lap) ? turnUsual([lap], lengthM) : null;
  const reference = isRepresentativeCornerPass(other) ? turnUsual([other], lengthM) : null;
  if (!own || !reference) return null;
  const halves: TurnHalf[] = splits(own, reference, lengthM) ? ['in', 'out'] : ['whole'];
  const kind = lossKind(own, reference);
  const differences = halves.flatMap((half): LapTurnDifference[] => {
      const lossSec = halfLossOf(lap, reference, half);
      if (lossSec === null || lossSec < UNEXPLAINED_SEC) return [];
      const [found = null] = HABIT_RULES.flatMap((spec) => {
        const gap = half === 'whole' || spec.half === half ? spec.gap(own, reference, lengthM) : null;
        return gap !== null && (spec.holdsPass ? spec.holdsPass(gap, own, reference) : spec.holds(gap, own, reference)) ? [{ rule: spec.rule, gap }] : [];
      });
      return [{
        half, lossSec, rule: found?.rule ?? null, gap: found?.gap ?? null,
        kindLine: kind && kind !== 'exitOnly' && half !== 'out' ? lossKindText(kind, turnArc(own, reference)) : null,
        // The brake point is not said twice under its own headline.
        causes: habitCauses(half, null, own, reference, lengthM, sameCar).filter(cause => !(found?.rule === 'brakeEarly' && cause.type === 'brakePoint')),
      }];
  });
  const absMoreSec = lap.absSec - other.absSec;
  return {
    differences,
    // Only where the lap loses time: a quicker lap's traffic or longer ABS explains nothing.
    traffic: differences.length > 0 && lap.aheadGapSec !== null && lap.aheadGapSec <= TRAFFIC_SEC,
    absMoreSec: differences.some(difference => difference.half !== 'out') && absMoreSec >= LOCKUP_ABS_SEC ? absMoreSec : null,
  };
}

/** Why a lap lost time, in words: the end of a mistake's line, and the debrief's cause column. */
export const MISTAKE_LINES: Record<Exclude<MistakeCause, null>, string> = {
  traffic: 'a car close ahead', brakeEarly: 'braked early', lockup: 'a lockup (ABS)', slowMiddle: 'slow in the middle',
  lift: 'a lift', slowExit: 'a slow exit',
};

/** Why a lap lost time in a turn against the driver's own usual there; null when nothing measured stands out. */
function mistakeCause(pass: CornerPass, usual: TurnUsual, lengthM: number): MistakeCause {
  if (pass.aheadGapSec !== null && pass.aheadGapSec <= TRAFFIC_SEC) return 'traffic';
  if (pass.absSec - usual.absSec >= LOCKUP_ABS_SEC) return 'lockup';
  if (pass.brakeM !== null && usual.brakeM !== null && lapGapM(pass.brakeM, usual.brakeM, lengthM) >= EARLY_BRAKE_MISTAKE_M) return 'brakeEarly';
  if (pass.partThrottleSec !== null && usual.partThrottleSec !== null && pass.partThrottleSec - usual.partThrottleSec >= LIFT_MISTAKE_SEC) return 'lift';
  if (pass.minSpeedKmh !== null && usual.minKmh !== null && usual.minKmh - pass.minSpeedKmh >= SLOW_MISTAKE_KMH) return 'slowMiddle';
  if (pass.exitSpeedKmh !== null && usual.exitKmh !== null && usual.exitKmh - pass.exitSpeedKmh >= SLOW_MISTAKE_KMH) return 'slowExit';
  return null;
}

function turnMistakes(driver: AnalysisDriver, corner: AnalysisCorner, turnId: number, turnLabel: string, usual: TurnUsual, lengthM: number): CornerMistake[] {
  const limit = Math.max(MISTAKE_MIN_SEC, MISTAKE_SPREADS * usual.spreadSec);
  return driver.laps.flatMap(lap => {
    const pass = lap.passes.find(item => item.segment === turnId);
    if (!pass || !isRepresentativeCornerPass(pass)) return [];
    const lossSec = passSec(pass) - usual.sec;
    if (lossSec <= limit) return [];
    const cause = mistakeCause(pass, usual, lengthM);
    const why = cause ? MISTAKE_LINES[cause] : 'nothing measured stands out';
    return [{ lapOrdinal: lap.lapOrdinal, cornerId: corner.id, turnId, turnLabel, lossSec, cause, line: `${turnLabel} +${lossSec.toFixed(2)} s: ${why}` }];
  });
}

/**
 * The driver's corners at a layout in one session: habits against the layout's target (the best true pace in the
 * class, the same driver for every session), and mistakes against the driver's own usual.
 * Deterministic: fixed rules on the measured passes (habitRules.ts, mistakeCause).
 *
 * The validation below predates the fixed target and the reworked rules (2026-11-21): it compared against each
 * session's own quickest driver, with the pedal timings as headlines. The rules now stand on the outcome check
 * (habitRules.ts). A blind round on them (2026-11-21, 8 other sessions): 9 of the hand's 24 top-3 habits in the
 * engine's top 3 by turn and reason, 14 by turn, the engine's top line at a turn of the hand's top 3 in 7 sessions
 * of 8. The round found the passes holding a touch of the brake in place of the main stop, or no brake point after
 * a long roll: fixed in the pass builder (pass version 21), after which "brake later" passes the outcome check too.
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
  const measures: TurnMeasures[] = [];
  const ownUsuals = new Map(input.corners.map(corner => [corner.id, cornerUsual(driver, corner, 1)]));
  const ownSecs = new Map(input.corners.map(corner => [corner.id, ownUsuals.get(corner.id)?.sec ?? null]));
  const target = targetOf(input);
  const sameCar = sameCarReference(input, ownSecs, target);
  const corners = input.corners.map(corner => {
    const usualSec = ownSecs.get(corner.id) ?? null;
    const targetUsual = target && cornerUsual(target, corner, input.minReferenceLaps);
    const chosen = target && targetUsual ? referenceOf(target, targetUsual) : cornerReference(input, corner);
    for (const turnId of corner.turnIds) {
      const turnLabel = labels.get(turnId) || `turn ${turnId + 1}`;
      const own = passesOf(driver, turnId);
      const ownUsual = turnUsual(own, lengthM);
      if (!ownUsual) continue;
      mistakes.push(...turnMistakes(driver, corner, turnId, turnLabel, ownUsual, lengthM));
      const reference = chosen && turnUsual(passesOf(chosen.driver, turnId), lengthM);
      if (!chosen || !reference) continue;
      measures.push(turnMeasures(turnId, ownUsual, reference, lengthM));
      const confidence = Math.min(1, own.length / 5) * Math.min(1, reference.laps / 3);
      const sameCarUsual = sameCar && chosen.driver !== sameCar ? turnUsual(passesOf(sameCar, turnId), lengthM) : null;
      habits.push(...turnHabits({ corner, turnId, turnLabel, own, ownUsual, reference,
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
    target: target && target.paceSec !== null
      ? { sessionId: target.sessionId, driverOrdinal: target.driverOrdinal, name: target.name, car: target.car, laps: target.laps.length, paceSec: target.paceSec }
      : null,
    sameCarReference: sameCar && {
      sessionId: sameCar.sessionId, driverOrdinal: sameCar.driverOrdinal, name: sameCar.name, car: sameCar.car, laps: sameCar.laps.length,
    },
    habits: driving.filter(habit => habit.rule !== null).sort(byPriority),
    unexplained: driving.filter(habit => habit.rule === null && habit.lossSec >= UNEXPLAINED_SEC).sort(byPriority),
    carDifferences: habits.filter(habit => isCar(habit) && habit.lossSec >= UNEXPLAINED_SEC).sort(byPriority),
    mistakes: mistakes.sort((a, b) => a.lapOrdinal - b.lapOrdinal || a.turnId - b.turnId),
    measures: measures.sort((a, b) => a.turnId - b.turnId),
  };
}
