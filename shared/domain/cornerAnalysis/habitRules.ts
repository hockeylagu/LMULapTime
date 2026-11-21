import type {
  CornerHabit, HabitAction, HabitActionType, HabitCause, HabitCauseType, HabitRule, LossKind, TurnArc, TurnHalf, TurnMeasures,
} from '../../types/corners/cornerAnalysis.js';
import { lapGapM, type TurnUsual } from './turnUsual.js';

/**
 * The rules, reworked on the outcome check of 2026-11-20 (tools/analysis/habitOutcomeCheck.ts): a measure may headline
 * a habit only when closing its gap from one session to the next made the turn quicker (cost down in at least 65% of
 * the closed cases and at most 40% of the widened ones). The speeds and the brake point pass; the pedal timings do not,
 * so they are said under a headline as causes. Dropped as headlines: the drag brake, coasting, the early apex and
 * "in fast, out slow" (backwards on the check).
 */

/** A point gap from this (m) is worth a line... */
export const POINT_GAP_M = 3;
/** ...up to this: further apart, the drivers use a different technique there, and a point says nothing. */
export const POINT_GAP_MAX_M = 40;
/**
 * A brake point is read further apart, since it is the main stop's (pass version 21): on the outcome check closing a
 * brake gap of 40 to 60 m made the turn quicker as often as a smaller one (76% of 42), with too few cases beyond; a
 * turn-in point at that reach got worse (55% quicker when the gap widened), so it keeps POINT_GAP_MAX_M (2026-11-21).
 */
export const BRAKE_GAP_MAX_M = 60;
/** A speed gap from this (km/h) is worth a line. */
export const SPEED_GAP_KMH = 1.5;
/** A time gap from this (s) is worth a line: braking, coasting, part throttle. */
export const TIME_GAP_SEC = 0.15;
/** A peak brake this much softer than the target's (0-1) is worth a line. */
export const BRAKE_SOFTER = 0.1;
/** A place on the road this far from the target's (m) is worth a line: it moves 0.3 m from lap to lap. */
export const ROAD_GAP_M = 0.4;
/**
 * A place on the road is said in words, the metres on hover: a number means little at the wheel (driver, 2026-11-21).
 * Under half a car's width is "a little", a car's width or more is "much".
 */
export const ROAD_LITTLE_M = 1;
export const ROAD_MUCH_M = 2;
/** Braking at least this hard (0-1) where the target brakes under LIFT_REFERENCE_BRAKE is braking for a lift. */
export const LIFT_CORNER_BRAKE = 0.4;
export const LIFT_REFERENCE_BRAKE = 0.25;
/** The arc holds at least this share of a minimum speed gap: a tighter arc; the sideways g holds it: less grip used. */
export const ARC_SHARE = 2 / 3;

export interface HabitRuleSpec {
  rule: HabitRule;
  /** The half of the turn whose loss the rule explains. */
  half: Exclude<TurnHalf, 'whole'>;
  /** What the gap is counted in. */
  unit: 'km/h' | 'm' | 'points';
  /**
   * The gap of a driver's usual (or of one pass, as a usual of one) to the target's usual, positive the habit's way;
   * null when it cannot be measured. It is measured whether or not the rule holds, so a series has no holes.
   */
  gap(own: TurnUsual, reference: TurnUsual, lengthM: number): number | null;
  holds(gap: number, own: TurnUsual, reference: TurnUsual): boolean;
  /** Per-lap check for repeatability when it differs from `holds` (e.g. a lap braking past the usual's upper cap still braked early). */
  holdsPass?(gap: number, own: TurnUsual, reference: TurnUsual): boolean;
  line(gap: number, turn: string): string;
}

const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
/** Metres `to` is further along the lap than `from`; null when either is unknown. */
const pointGap = (from: number | null, to: number | null, lengthM: number): number | null =>
  (from === null || to === null ? null : lapGapM(from, to, lengthM));
const inReach = (gap: number, maxM = POINT_GAP_MAX_M) => gap >= POINT_GAP_M && gap <= maxM;

/**
 * In checking order: the first rule that holds on most laps explains the half.
 * The exit speed is read at the segment's end, far down the next straight; it passed the outcome check there.
 */
export const HABIT_RULES: readonly HabitRuleSpec[] = [
  {
    rule: 'brakesWhereLift', half: 'in', unit: 'points',
    gap: (own, reference) => (own.brakeM === null || own.peakBrake === null ? null : Math.round((own.peakBrake - (reference.peakBrake ?? 0)) * 100)),
    holds: (_gap, own, reference) => (reference.peakBrake ?? 0) < LIFT_REFERENCE_BRAKE && (own.peakBrake ?? 0) >= LIFT_CORNER_BRAKE,
    line: (_gap, turn) => `Lift, don't brake, into ${turn}`,
  },
  {
    rule: 'overSlowing', half: 'in', unit: 'km/h',
    gap: (own, reference) => diff(reference.minKmh, own.minKmh),
    holds: gap => gap >= SPEED_GAP_KMH,
    line: (gap, turn) => `Carry ${Math.round(gap)} km/h more through ${turn}`,
  },
  {
    rule: 'brakeEarly', half: 'in', unit: 'm',
    gap: (own, reference, lengthM) => pointGap(own.brakeM, reference.brakeM, lengthM),
    holds: gap => inReach(gap, BRAKE_GAP_MAX_M),
    holdsPass: gap => gap >= POINT_GAP_M,
    line: (gap, turn) => `Brake ${Math.round(gap)} m later into ${turn}`,
  },
  {
    rule: 'exitSpeed', half: 'out', unit: 'km/h',
    gap: (own, reference) => diff(reference.exitKmh, own.exitKmh),
    holds: gap => gap >= SPEED_GAP_KMH,
    line: (gap, turn) => `Exit ${turn} ${Math.round(gap)} km/h faster`,
  },
];

export const habitRule = (rule: HabitRule): HabitRuleSpec => HABIT_RULES.find(spec => spec.rule === rule) as HabitRuleSpec;

/** The usual arcs and sideways g of the two drivers, when both turn the same way there. */
export function turnArc(own: TurnUsual, reference: TurnUsual): TurnArc | null {
  if (own.arcRadiusM === null || reference.arcRadiusM === null || own.latG === null || reference.latG === null || own.arcSide !== reference.arcSide) return null;
  return { radiusM: own.arcRadiusM, targetRadiusM: reference.arcRadiusM, latG: own.latG, targetLatG: reference.latG };
}

/**
 * How the turn loses its speed. A minimum speed gap splits exactly between the arc and the sideways g (speed² = g ×
 * radius): the kind is where most of it sits. On the driver's history (2026-11-20) 47% of the over-slowing turns were
 * mostly a tighter arc, 38% mostly less grip, 15% both.
 */
export function lossKind(own: TurnUsual, reference: TurnUsual): LossKind | null {
  const minGap = diff(reference.minKmh, own.minKmh);
  if (minGap !== null && minGap >= SPEED_GAP_KMH) {
    const arc = turnArc(own, reference);
    if (!arc) return null;
    const radius = Math.log(arc.targetRadiusM / arc.radiusM), grip = Math.log(arc.targetLatG / arc.latG);
    if (radius + grip <= 0) return null;
    const share = radius / (radius + grip);
    return share >= ARC_SHARE ? 'tighterArc' : share <= 1 - ARC_SHARE ? 'lessGrip' : 'arcAndGrip';
  }
  const exitGap = diff(reference.exitKmh, own.exitKmh);
  return exitGap !== null && exitGap >= SPEED_GAP_KMH ? 'exitOnly' : null;
}

interface ActionSpec {
  type: HabitActionType;
  /** The kinds of loss the action is offered for; null stands for a lower minimum speed whose arc is not measured. */
  kinds: ReadonlyArray<LossKind | null>;
  /** The smallest gap worth trying, and the scale that compares one action's gap with another's. */
  step: number;
  /** A point's gap beyond this (m) says nothing: the drivers use a different technique there. */
  maxM?: number;
  /** The driver's usual against the target's, positive when the action would close it. */
  gap(own: TurnUsual, reference: TurnUsual, lengthM: number): number | null;
  line(gap: number): string;
  /** What the driver did when the gap closed by `moved`: "braked 8 m later". */
  did(moved: number): string;
}

const sameSide = (own: TurnUsual, reference: TurnUsual) => own.arcSide !== null && own.arcSide === reference.arcSide;
/** "a little closer", "closer", "much closer": how far along the road, in words. */
const roadWords = (gap: number, word: string) => (gap < ROAD_LITTLE_M ? `a little ${word}` : gap >= ROAD_MUCH_M ? `much ${word}` : word);

/**
 * What the driver can try, by kind of loss. No hand or foot action is a dependable lever by itself (the best beat the
 * base rate by about 20 points on the history, a speed by 40 to 60), so an action is offered as a try beside the speed
 * to hit, and the next session says whether it worked. Never offered: more or less steering, the peak brake pedal,
 * coasting, part throttle, the turn-in's place on the road (no link inside any kind) and more road at the exit (no
 * link either; the driver had it removed, 2026-11-21).
 */
const ACTIONS: readonly ActionSpec[] = [
  {
    // Its own headline (brakesWhereLift): never offered under a speed.
    type: 'lift', kinds: [], step: BRAKE_SOFTER * 100,
    gap: (own, reference, lengthM) => HABIT_RULES[0].gap(own, reference, lengthM),
    line: () => 'Lift instead of braking',
    did: moved => `braked ${Math.round(moved)} points lighter`,
  },
  {
    // Also offered under tighterArc: braking early often forces a tighter line, and closing it passes the outcome check there too.
    type: 'brakeLater', kinds: ['lessGrip', 'arcAndGrip', 'tighterArc', null], step: POINT_GAP_M, maxM: BRAKE_GAP_MAX_M,
    gap: (own, reference, lengthM) => pointGap(own.brakeM, reference.brakeM, lengthM),
    line: gap => `Brake ${Math.round(gap)} m later`,
    did: moved => `braked ${Math.round(moved)} m later`,
  },
  {
    type: 'brakeShorter', kinds: ['lessGrip', 'arcAndGrip', null], step: TIME_GAP_SEC,
    gap: (own, reference) => diff(own.brakeSec, reference.brakeSec),
    line: gap => `Come off the brake ${gap.toFixed(1)} s sooner`,
    did: moved => `came off the brake ${moved.toFixed(1)} s sooner`,
  },
  {
    type: 'turnInEarlier', kinds: ['tighterArc', 'arcAndGrip'], step: POINT_GAP_M, maxM: POINT_GAP_MAX_M,
    gap: (own, reference, lengthM) => pointGap(reference.turnInM, own.turnInM, lengthM),
    line: gap => `Turn in ${Math.round(gap)} m earlier`,
    did: moved => `turned in ${Math.round(moved)} m earlier`,
  },
  {
    type: 'reachInside', kinds: ['tighterArc', 'arcAndGrip'], step: ROAD_GAP_M,
    gap: (own, reference) => (sameSide(own, reference) ? diff(reference.apexInsideM, own.apexInsideM) : null),
    line: gap => `Get ${roadWords(gap, 'closer')} to the inside at the apex`,
    did: moved => `got ${roadWords(moved, 'closer')} to the inside at the apex`,
  },
];

const actionSpec = (type: HabitActionType): ActionSpec => ACTIONS.find(action => action.type === type) as ActionSpec;

/**
 * What a try did, from an action's gap in the session that advised it and in the next: the words, and how far the
 * driver's usual moved the action's way, when that is at least its step; null when it did not move.
 */
export function actionDone(type: HabitActionType, before: number, after: number): { did: string; moved: number } | null {
  const spec = actionSpec(type);
  const moved = before - after;
  return moved >= spec.step ? { did: spec.did(moved), moved } : null;
}

/** Every rule's and action's gap at a turn, the driver's usual against the target's, whether or not it holds. */
export function turnMeasures(turnId: number, own: TurnUsual, reference: TurnUsual, lengthM: number): TurnMeasures {
  return {
    turnId,
    rules: Object.fromEntries(HABIT_RULES.map(spec => [spec.rule, spec.gap(own, reference, lengthM)])) as TurnMeasures['rules'],
    actions: Object.fromEntries(ACTIONS.map(action => [action.type, action.gap(own, reference, lengthM)])) as TurnMeasures['actions'],
  };
}

/**
 * What to try under a headline, the first being the one offered. A brake point or a lift is its own action; a speed
 * takes the actions of the turn's kind whose gap is worth a step, the largest gap in steps first (the later in ACTIONS
 * on a tie). A turn slower at the exit only has none: nothing measured holds there.
 */
export function habitActions(rule: HabitRule, kind: LossKind | null, gap: number, own: TurnUsual, reference: TurnUsual, lengthM: number): HabitAction[] {
  if (rule === 'brakesWhereLift') return [{ type: 'lift', gap, line: actionSpec('lift').line(gap) }];
  if (rule === 'brakeEarly') return [{ type: 'brakeLater', gap, line: actionSpec('brakeLater').line(gap) }];
  // Without a kind the pedal actions still stand, when the minimum speed is lower and only its arc is not measured.
  if (kind === 'exitOnly' || (kind === null && (diff(reference.minKmh, own.minKmh) ?? 0) < SPEED_GAP_KMH)) return [];
  return ACTIONS.flatMap((action, order) => {
    if (!action.kinds.includes(kind)) return [];
    const actionGap = action.gap(own, reference, lengthM);
    if (actionGap === null || actionGap < action.step || actionGap > (action.maxM ?? Infinity)) return [];
    return [{ size: actionGap / action.step, order, action: { type: action.type, gap: actionGap, line: action.line(actionGap) } }];
  }).sort((a, b) => b.size - a.size || b.order - a.order).map(item => item.action);
}

/**
 * The habit with another of its actions as the one to try, for a try that gave no gain: the cause that says the same
 * as the new action leaves the causes, and the cause the replaced action hid comes back in canonical order.
 */
export function withAction(habit: CornerHabit, action: HabitAction): CornerHabit {
  const actions = [...(habit.action ? [habit.action] : []), ...habit.otherActions];
  const oldCauseType = habit.action ? ACTION_CAUSE[habit.action.type] : undefined;
  const newCauseType = ACTION_CAUSE[action.type];
  let causes = habit.causes.filter(cause => cause.type !== newCauseType);
  if (habit.action && oldCauseType && oldCauseType !== newCauseType && habit.half !== 'out' && !causes.some(cause => cause.type === oldCauseType)) {
    const line = oldCauseType === 'brakePoint'
      ? `braking ${Math.round(habit.action.gap)} m earlier`
      : `braking ${habit.action.gap.toFixed(1)} s longer`;
    causes = [...causes, { type: oldCauseType, gap: habit.action.gap, line }]
      .toSorted((a, b) => CAUSES.findIndex(c => c.type === a.type) - CAUSES.findIndex(c => c.type === b.type));
  }
  return { ...habit, action, otherActions: actions.filter(item => item.type !== action.type), causes };
}

const kmh = (value: number | null): string => (value === null ? '–' : `${Math.round(value)} km/h`);
const percent = (share: number | null): string => `${Math.round((share ?? 0) * 100)} %`;

const KIND_TEXT: Record<LossKind, (arc: TurnArc | null) => string> = {
  tighterArc: arc => (arc ? `tighter arc (${Math.round(arc.radiusM)} m radius against ${Math.round(arc.targetRadiusM)} m)` : 'tighter arc'),
  lessGrip: arc => (arc ? `same arc, less grip used (${arc.latG.toFixed(2)} g against ${arc.targetLatG.toFixed(2)} g)` : 'same arc, less grip used'),
  arcAndGrip: arc => (arc
    ? `tighter arc and less grip used (${Math.round(arc.radiusM)} m and ${arc.latG.toFixed(2)} g against ${Math.round(arc.targetRadiusM)} m and ${arc.targetLatG.toFixed(2)} g)`
    : 'tighter arc and less grip used'),
  exitOnly: () => 'no action is measured for a slower exit alone',
};

/** A kind of loss in words, the slower side's arc and grip against the other's. */
export const lossKindText = (kind: Exclude<LossKind, 'exitOnly'>, arc: TurnArc | null): string => KIND_TEXT[kind](arc);

/**
 * The line under a headline: the minimum speed, the driver's and the target's, on every row (the speed to hit), then
 * the kind of loss in words. The arc and the grip identify the loss; they are never the advice (driver, 2026-11-20).
 * The target is not named: who it is does not change what to do (driver, 2026-11-21). A headline that is its own
 * action (the brake point, the lift) never reads "no action is measured" under it, whatever the turn's kind.
 */
export function habitDetail(rule: HabitRule, own: TurnUsual, reference: TurnUsual, kind: LossKind | null, arc: TurnArc | null): string {
  const apex = `apex ${kmh(own.minKmh)}, target ${kmh(reference.minKmh)}`;
  const head = rule === 'exitSpeed' ? `Exit ${kmh(own.exitKmh)}, target ${kmh(reference.exitKmh)} · ${apex}`
    : rule === 'brakesWhereLift' ? `You brake up to ${percent(own.peakBrake)}, target ${percent(reference.peakBrake)} · ${apex}`
      : `A${apex.slice(1)}`;
  return kind && rule !== 'brakesWhereLift' && !(kind === 'exitOnly' && rule === 'brakeEarly') ? `${head} · ${KIND_TEXT[kind](arc)}` : head;
}

/** A habit slower at the exit with the same minimum speed: no action holds there, so it is never picked as a focus. */
export const isExitOnly = (habit: { rule: HabitRule | null; speeds: { minKmh: number | null; targetMinKmh: number | null } }): boolean =>
  habit.rule === 'exitSpeed' && (diff(habit.speeds.targetMinKmh, habit.speeds.minKmh) ?? 0) < SPEED_GAP_KMH;

interface CauseSpec {
  type: HabitCauseType;
  half: Exclude<TurnHalf, 'whole'>;
  /** The gap, when it is worth a line. */
  gap(own: TurnUsual, reference: TurnUsual, lengthM: number): number | null;
  line(gap: number, own: TurnUsual, reference: TurnUsual): string;
}

const from = (gap: number | null, min: number) => (gap !== null && gap >= min ? gap : null);
const reach = (gap: number | null, maxM = POINT_GAP_MAX_M) => (gap !== null && inReach(gap, maxM) ? gap : null);

const CAUSES: readonly CauseSpec[] = [
  {
    // The speed at the corner's start comes from the corner or the straight before, unless the driver is already
    // braking for this one: braking earlier than the target lowers it too, and is said as the brake point.
    type: 'entrySpeed', half: 'in',
    gap: (own, reference, lengthM) => ((pointGap(own.brakeM, reference.brakeM, lengthM) ?? 0) >= POINT_GAP_M
      ? null : from(diff(reference.entryKmh, own.entryKmh), SPEED_GAP_KMH)),
    line: gap => `arriving ${Math.round(gap)} km/h slower (lost before this corner)`,
  },
  { type: 'brakePoint', half: 'in', gap: (own, reference, lengthM) => reach(pointGap(own.brakeM, reference.brakeM, lengthM), BRAKE_GAP_MAX_M),
    line: gap => `braking ${Math.round(gap)} m earlier` },
  { type: 'brakeLonger', half: 'in', gap: (own, reference) => from(diff(own.brakeSec, reference.brakeSec), TIME_GAP_SEC),
    line: gap => `braking ${gap.toFixed(1)} s longer` },
  { type: 'brakeSofter', half: 'in', gap: (own, reference) => (own.brakeM === null ? null : from(diff(reference.peakBrake, own.peakBrake), BRAKE_SOFTER)),
    line: gap => `peak brake ${Math.round(gap * 100)} points softer` },
  { type: 'coast', half: 'in', gap: (own, reference) => from(own.coastSec - reference.coastSec, TIME_GAP_SEC),
    line: gap => `${gap.toFixed(1)} s more coasting` },
  { type: 'throttlePoint', half: 'out', gap: (own, reference, lengthM) => reach(pointGap(reference.throttleM, own.throttleM, lengthM)),
    line: gap => `back on the throttle ${Math.round(gap)} m later` },
  { type: 'partThrottle', half: 'out', gap: (own, reference) => from(diff(own.partThrottleSec, reference.partThrottleSec), TIME_GAP_SEC),
    line: gap => `${gap.toFixed(1)} s more part throttle` },
  { type: 'gear', half: 'out', gap: (own, reference) => (own.gear === null || reference.gear === null || own.gear === reference.gear ? null : own.gear - reference.gear),
    line: (_gap, own, reference) => `gear ${own.gear} against ${reference.gear}` },
];

/** The cause that says what an action already says. */
const ACTION_CAUSE: Partial<Record<HabitActionType, HabitCauseType>> = { brakeLater: 'brakePoint', brakeShorter: 'brakeLonger' };

/**
 * What else was measured in the habit's half of the turn, said under the headline: the pedal timings and the entry
 * speed (it names the turn before, where the speed was lost). A gear compares only in the same car.
 */
export function habitCauses(half: TurnHalf, action: HabitAction | null, own: TurnUsual, reference: TurnUsual, lengthM: number, sameCar: boolean): HabitCause[] {
  const said = action ? ACTION_CAUSE[action.type] : undefined;
  return CAUSES.flatMap(cause => {
    if ((half !== 'whole' && cause.half !== half) || cause.type === said || (cause.type === 'gear' && !sameCar)) return [];
    const gap = cause.gap(own, reference, lengthM);
    return gap === null ? [] : [{ type: cause.type, gap, line: cause.line(gap, own, reference) }];
  });
}
