import type { CornerHabit, HabitAction, HabitActionType, HabitCauseType, HabitRule, MistakeCause } from '../../../../shared/types/corners/cornerAnalysis.js';
import type { GapUnit } from '../../../../shared/types/corners/habitFocus.js';
import {
  BRAKE_GAP_MAX_M, LIFT_CORNER_BRAKE, LIFT_REFERENCE_BRAKE, POINT_GAP_M, SPEED_GAP_KMH,
} from '../../../../shared/domain/cornerAnalysis/habitRules.js';
import {
  EARLY_BRAKE_MISTAKE_M, LIFT_MISTAKE_SEC, LOCKUP_ABS_SEC, SLOW_MISTAKE_KMH, TRAFFIC_SEC,
} from '../../../../shared/domain/cornerAnalysis/analyzeCorners.js';

export const HABIT_LABELS: Record<HabitRule, string> = {
  brakesWhereLift: 'Braking for a lift',
  overSlowing: 'Over-slowing',
  brakeEarly: 'Early braking',
  exitSpeed: 'Slow exit',
};

const pct = (share: number) => `${Math.round(share * 100)} %`;

/** What each habit rule measured against the target through the corner (shared/domain/cornerAnalysis/habitRules.ts). */
export const HABIT_EXPLANATIONS: Record<HabitRule, string> = {
  brakesWhereLift: `You brake (${pct(LIFT_CORNER_BRAKE)} or more) where the target only lifts or barely brakes (under ${pct(LIFT_REFERENCE_BRAKE)}).`,
  overSlowing: `Your slowest speed in the corner is at least ${SPEED_GAP_KMH} km/h under the target's.`,
  brakeEarly: `You start braking ${POINT_GAP_M} to ${BRAKE_GAP_MAX_M} m before the target.`,
  exitSpeed: `Your speed at the end of the corner is at least ${SPEED_GAP_KMH} km/h under the target's.`,
};

/** A brake point or a lift is its own advice: the headline already says it. */
const HEADLINE_IS_ACTION: ReadonlySet<HabitRule> = new Set(['brakeEarly', 'brakesWhereLift']);

/** The one thing to try under a habit's headline ("Turn in 5 m earlier"); null when the headline is the action or none is measured. */
export const habitTryLine = ({ rule, action }: Pick<CornerHabit, 'rule' | 'action'>): string | null =>
  (action && rule && !HEADLINE_IS_ACTION.has(rule) ? action.line : null);

/** The metres behind an action said in words: the road position, where a number means little at the wheel. */
const ROAD_MEASURES: Partial<Record<HabitActionType, { target: string; moved: string }>> = {
  reachInside: { target: 'closer to the inside at the apex than you', moved: 'closer to the inside at the apex' },
};

/** The measure behind a try said in words, for a tooltip: "The target is 0.6 m closer to the inside at the apex than you". */
export function habitTryTitle(action: HabitAction | null): string | undefined {
  const words = action && ROAD_MEASURES[action.type];
  return words ? `The target is ${action.gap.toFixed(1)} m ${words.target}` : undefined;
}

/** How far a try moved the driver's usual, for a tooltip: "Your usual moved 0.4 m closer to the inside at the apex". */
export function habitTriedTitle(action: HabitActionType, moved: number): string | undefined {
  const words = ROAD_MEASURES[action];
  return words ? `Your usual moved ${moved.toFixed(1)} m ${words.moved}` : undefined;
}

/** What a habit's gap to the target measures, and the word for each side of it. */
const GAP_WORDS: Record<HabitRule, { label: string; behind: string; ahead: string }> = {
  brakesWhereLift: { label: 'Brake pressure', behind: 'more', ahead: 'less' },
  overSlowing: { label: 'Minimum speed', behind: 'under', ahead: 'over' },
  brakeEarly: { label: 'Brake point', behind: 'early', ahead: 'late' },
  exitSpeed: { label: 'Exit speed', behind: 'under', ahead: 'over' },
};

/** A gap to the target in words: "7 km/h under", "2 km/h over", "level". */
export function habitGapText(rule: HabitRule, unit: GapUnit, gap: number): string {
  const size = Math.round(Math.abs(gap));
  const words = GAP_WORDS[rule];
  return size === 0 ? 'level' : `${size} ${unit} ${gap > 0 ? words.behind : words.ahead}`;
}

/** "Minimum speed at T5": what a habit's gap series is of. */
export const habitGapLabel = (rule: HabitRule, turnLabel: string): string => `${GAP_WORDS[rule].label} at ${turnLabel}`;

/** What each secondary difference ("Other differences vs target") measures (shared/domain/cornerAnalysis/habitRules.ts). */
export const CAUSE_EXPLANATIONS: Record<HabitCauseType, string> = {
  entrySpeed: "Your speed entering the corner segment is lower than the target's (time lost before this corner).",
  brakePoint: 'You start braking (pedal over 10%) earlier along the track than the target.',
  brakeLonger: "Total time on the brake pedal (over 10%) through the corner is longer than the target's.",
  brakeSofter: "Your peak brake pressure in the corner is lower than the target's.",
  coast: 'Time off both pedals (brake under 5%, throttle under 10%) between releasing the brake and picking up the throttle.',
  throttlePoint: 'You get back on the throttle (over 50%) further down the track than the target.',
  partThrottle: 'Time on partial throttle (10–95%, with traction control off) from the slowest point to the exit: feathering, hesitating, or lifting before full throttle.',
  gear: 'The gear held at the slowest point of the corner compared to the target in the same car.',
};

/** Why one lap lost time in a corner, against the driver's own usual there (shared/domain/cornerAnalysis/analyzeCorners.ts). */
export const MISTAKE_EXPLANATIONS: Record<Exclude<MistakeCause, null>, string> = {
  traffic: `Within ${TRAFFIC_SEC} s of the car ahead through the corner.`,
  lockup: `ABS working at least ${LOCKUP_ABS_SEC} s longer than on your usual lap: a lockup under braking.`,
  brakeEarly: `Braking at least ${EARLY_BRAKE_MISTAKE_M} m earlier than on your usual lap.`,
  lift: `At least ${LIFT_MISTAKE_SEC} s more part throttle than on your usual lap: a lift.`,
  slowMiddle: `At least ${SLOW_MISTAKE_KMH} km/h slower at the slowest point than on your usual lap.`,
  slowExit: `At least ${SLOW_MISTAKE_KMH} km/h slower on the way out than on your usual lap.`,
};
