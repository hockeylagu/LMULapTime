import type { CornerPass } from '../../types/corners/cornerPasses.js';
import type { HabitRule, TurnHalf } from '../../types/corners/cornerAnalysis.js';
import { lapGapM, type TurnUsual } from './turnUsual.js';

/** A point gap from this (m) is worth a line... */
export const POINT_GAP_M = 3;
/** ...up to this: further apart, the drivers use a different technique there, and a point says nothing. */
export const POINT_GAP_MAX_M = 40;
/** A slowest point this much earlier (m) than the reference's is an early apex. */
export const APEX_GAP_M = 5;
/** A speed gap from this (km/h) is worth a line. */
export const SPEED_GAP_KMH = 1.5;
/** Part throttle out of the slowest point this much longer (s) than the reference: a lift or a slow way back to full. */
export const PART_THROTTLE_GAP_SEC = 0.2;
/** A reference with less part throttle than this (s) out of the slowest point stays flat there. */
export const FLAT_PART_THROTTLE_SEC = 0.1;
/**
 * Braking this much longer (s) than the reference, with a peak this much softer (0-1), is dragging the brake into the
 * corner: the blind hand analyses' brake release. Longer alone fires on most slow corners (validation, 2026-11-19).
 */
export const DRAG_BRAKE_SEC = 0.3;
export const DRAG_BRAKE_SOFTER = 0.1;
/** Braking at least this hard (0-1) where the reference brakes under LIFT_REFERENCE_BRAKE is braking for a lift. */
export const LIFT_CORNER_BRAKE = 0.4;
export const LIFT_REFERENCE_BRAKE = 0.25;
/**
 * Coasting this much longer (s) than the reference, off both pedals between the braking and the throttle pick-up: the
 * corner-map branch's coasting, the one of its technique rules the blind validation of 2026-11-20 kept.
 */
export const COAST_GAP_SEC = 0.2;
/** What a rule measured on one lap: whether it holds there, and its gap. */
export interface RuleCheck { holds: boolean; gap: number | null }

export interface HabitRuleSpec {
  rule: HabitRule;
  /** The half of the turn whose loss the rule explains. */
  half: Exclude<TurnHalf, 'whole'>;
  check(own: CornerPass, reference: TurnUsual, lengthM: number): RuleCheck;
  line(gap: number, turn: string, reference: TurnUsual): string;
  detail(gap: number, own: TurnUsual, reference: TurnUsual, name: string): string;
}

const NO: RuleCheck = { holds: false, gap: null };
const kmh = (value: number | null): string => (value === null ? '–' : `${Math.round(value)} km/h`);
const secs = (value: number | null): string => `${(value ?? 0).toFixed(1)} s`;
/** Metres the reference brakes later than this pass (negative: earlier); null when either does not brake. */
const brakeGapM = (own: CornerPass, reference: TurnUsual, lengthM: number): number | null =>
  own.brakeM === null || reference.brakeM === null ? null : lapGapM(own.brakeM, reference.brakeM, lengthM);

/**
 * In checking order: the first rule that holds on most laps explains the half.
 * Exit speed is no condition: at the segment's end, far down the next straight, it is diluted (validation, 2026-11-19).
 */
export const HABIT_RULES: readonly HabitRuleSpec[] = [
  {
    rule: 'brakesWhereLift', half: 'in',
    check: (own, reference) => (reference.peakBrake ?? 0) >= LIFT_REFERENCE_BRAKE || own.brakeM === null || (own.peakBrake ?? 0) < LIFT_CORNER_BRAKE
      ? NO : { holds: true, gap: Math.round((own.peakBrake ?? 0) * 100) },
    line: (_gap, turn) => `Lift, don't brake, into ${turn}`,
    detail: (gap, _own, reference, name) => `You brake up to ${gap} %; ${name} ${Math.round((reference.peakBrake ?? 0) * 100)} %`,
  },
  {
    rule: 'dragBrake', half: 'in',
    check: (own, reference) => {
      if (own.brakeM === null || reference.brakeSec === null || own.peakBrake === null || reference.peakBrake === null) return NO;
      const gap = own.brakeSec - reference.brakeSec;
      return { holds: gap >= DRAG_BRAKE_SEC && reference.peakBrake - own.peakBrake >= DRAG_BRAKE_SOFTER, gap };
    },
    line: (_gap, turn) => `Brake harder, then release sooner into ${turn}`,
    detail: (gap, own, reference, name) => `You brake ${gap.toFixed(1)} s longer than ${name}, peaking at ${Math.round((own.peakBrake ?? 0) * 100)} % `
      + `against ${Math.round((reference.peakBrake ?? 0) * 100)} %; slowest ${kmh(own.minKmh)} / ${kmh(reference.minKmh)}`,
  },
  {
    rule: 'coast', half: 'in',
    check: (own, reference) => ({ holds: own.coastSec - reference.coastSec >= COAST_GAP_SEC, gap: own.coastSec - reference.coastSec }),
    line: (_gap, turn) => `Don't coast into ${turn}: off the brake, onto the throttle`,
    detail: (_gap, own, reference, name) => `Off both pedals ${secs(own.coastSec)}, ${name} ${secs(reference.coastSec)}`,
  },
  {
    rule: 'overSlowing', half: 'in',
    check: (own, reference) => {
      if (own.minSpeedKmh === null || reference.minKmh === null) return NO;
      const gap = reference.minKmh - own.minSpeedKmh;
      return { holds: gap >= SPEED_GAP_KMH, gap };
    },
    line: (gap, turn) => `Carry ${Math.round(gap)} km/h more through ${turn}`,
    detail: (_gap, own, reference, name) => `Slowest ${kmh(own.minKmh)}, ${name} ${kmh(reference.minKmh)}`,
  },
  {
    rule: 'brakeEarly', half: 'in',
    check: (own, reference, lengthM) => {
      const gap = brakeGapM(own, reference, lengthM);
      return gap === null || gap < POINT_GAP_M || gap > POINT_GAP_MAX_M ? NO : { holds: true, gap };
    },
    line: (gap, turn) => `Brake ${Math.round(gap)} m later into ${turn}`,
    detail: (gap, own, reference, name) => `You brake ${Math.round(gap)} m before ${name}: in ${kmh(own.entryKmh)} / ${kmh(reference.entryKmh)}, `
      + `slowest ${kmh(own.minKmh)} / ${kmh(reference.minKmh)}`,
  },
  {
    rule: 'apexEarly', half: 'out',
    check: (own, reference, lengthM) => {
      if (own.minSpeedM === null || reference.minSpeedM === null) return NO;
      const gap = lapGapM(own.minSpeedM, reference.minSpeedM, lengthM);
      return gap < APEX_GAP_M || gap > POINT_GAP_MAX_M ? NO : { holds: true, gap };
    },
    line: (gap, turn) => `Turn in later: your slowest point in ${turn} is ${Math.round(gap)} m early`,
    detail: (gap, own, reference, name) => `Slowest ${Math.round(gap)} m before ${name}'s, at ${kmh(own.minKmh)} / ${kmh(reference.minKmh)}`,
  },
  {
    rule: 'inFastOutSlow', half: 'out',
    check: (own, reference) => {
      if (own.minSpeedKmh === null || reference.minKmh === null) return NO;
      const gap = own.minSpeedKmh - reference.minKmh;
      return { holds: gap >= SPEED_GAP_KMH, gap };
    },
    line: (gap, turn) => `Give up ${Math.round(gap)} km/h in the middle of ${turn} for a faster exit`,
    detail: (_gap, own, reference, name) => `Slowest ${kmh(own.minKmh)}, ${name} ${kmh(reference.minKmh)}, yet slower out`,
  },
  {
    rule: 'partThrottle', half: 'out',
    check: (own, reference) => {
      if (own.partThrottleSec === null || reference.partThrottleSec === null) return NO;
      const gap = own.partThrottleSec - reference.partThrottleSec;
      return { holds: gap >= PART_THROTTLE_GAP_SEC, gap };
    },
    line: (_gap, turn, reference) => ((reference.partThrottleSec ?? 1) < FLAT_PART_THROTTLE_SEC
      ? `Stay flat through ${turn}` : `Get to full throttle sooner out of ${turn}`),
    detail: (gap, own, reference, name) => `${(own.partThrottleSec ?? 0).toFixed(1)} s on part throttle out of the slowest point, `
      + `${name} ${(reference.partThrottleSec ?? 0).toFixed(1)} s (+${gap.toFixed(1)} s)`,
  },
  {
    rule: 'gear', half: 'out',
    check: (own, reference) => own.minSpeedGear === null || reference.gear === null || own.minSpeedGear === reference.gear
      ? NO : { holds: true, gap: own.minSpeedGear - reference.gear },
    line: (_gap, turn, reference) => `Try gear ${reference.gear} through ${turn}`,
    detail: (_gap, own, reference, name) => `You use gear ${own.gear}, ${name} gear ${reference.gear}`,
  },
];
