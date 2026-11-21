import type { CornerPass } from './cornerPasses.js';
import type { GapUnit, HabitFocus, PaceGoal } from './habitFocus.js';

/** One counted lap of a driver: its place in the driver's stored laps and its passes through the official turns. */
export interface AnalysisLap {
  lapOrdinal: number;
  passes: CornerPass[];
}

/** A driver's counted laps at the layout, in one session. */
export interface AnalysisDriver {
  sessionId: string;
  driverOrdinal: number;
  name: string;
  /** The car's model, null when unknown: gears compare only within one car. */
  car: string | null;
  /** The driver's true pace in the session (the average of the 3 fastest clean dry laps, s); null when unknown: never a target. */
  paceSec: number | null;
  laps: AnalysisLap[];
}

/** A corner of the class's map (else an official turn on its own), with the official turns it holds in lap order. */
export interface AnalysisCorner {
  id: number;
  label: string;
  name: string;
  turnIds: number[];
}

export interface AnalysisTurn {
  id: number;
  label: string;
}

/** What the engine reads: the layout's corners and turns, the driver's counted laps and every candidate reference's. */
export interface CornerAnalysisInput {
  lengthM: number;
  corners: AnalysisCorner[];
  turns: AnalysisTurn[];
  driver: AnalysisDriver;
  /** The layout's target candidates: other human drivers of the class with a true pace, and each car's best. */
  others: AnalysisDriver[];
  /** Counted laps a reference needs: its usual is a median, never one lap. */
  minReferenceLaps: number;
}

/** Into the turn's slowest point, out of it, or the whole turn when the split is unknown. */
export type TurnHalf = 'in' | 'out' | 'whole';

/**
 * The headlines the engine can name (shared/domain/cornerAnalysis/habitRules.ts): the measures whose gap, once closed,
 * made the turn quicker on the driver's history.
 */
export type HabitRule = 'brakesWhereLift' | 'overSlowing' | 'brakeEarly' | 'exitSpeed';

/**
 * How a turn loses its speed. At the slowest point speed² = sideways g × arc radius, so a lower minimum speed is a
 * tighter arc, the same arc with less grip used, or both; a turn slower at the exit with the same minimum is its own kind.
 */
export type LossKind = 'tighterArc' | 'lessGrip' | 'arcAndGrip' | 'exitOnly';

/** What the driver can try: something done with a pedal or the wheel, or a place on the road. */
export type HabitActionType = 'lift' | 'brakeLater' | 'brakeShorter' | 'turnInEarlier' | 'reachInside';

export interface HabitAction {
  type: HabitActionType;
  /** The driver's usual against the target's, in the action's unit (m, s). */
  gap: number;
  /** "Brake 11 m later". */
  line: string;
}

/** A measured difference that goes with a headline: said under it, never a focus alone. */
export type HabitCauseType = 'entrySpeed' | 'brakePoint' | 'brakeLonger' | 'brakeSofter' | 'coast' | 'throttlePoint' | 'partThrottle' | 'gear';

export interface HabitCause {
  type: HabitCauseType;
  gap: number;
  /** "braking 0.4 s longer". */
  line: string;
}

/** The driver's and the target's usual speeds at a turn (km/h): the minimum is on every row, the speed to hit. */
export interface TurnSpeeds {
  minKmh: number | null;
  targetMinKmh: number | null;
  exitKmh: number | null;
  targetExitKmh: number | null;
}

/** The usual arc at the slowest point (m) and the sideways g there, the driver's and the target's. */
export interface TurnArc {
  radiusM: number;
  targetRadiusM: number;
  latG: number;
  targetLatG: number;
}

/**
 * A measured turn's gaps to the target, the driver's usual against the target's, whether or not a rule holds there:
 * a series over sessions then has no holes. Each in its rule's or action's unit, positive the habit's way.
 */
export interface TurnMeasures {
  turnId: number;
  rules: Record<HabitRule, number | null>;
  actions: Record<HabitActionType, number | null>;
}

/** A loss to the target that repeats, and what explains it. */
export interface CornerHabit {
  cornerId: number;
  turnId: number;
  turnLabel: string;
  half: TurnHalf;
  /** The usual (median) time the half loses to the reference, per lap (s). */
  lossSec: number;
  /** With a reference in another car, the same half's usual loss to the quickest driver in the driver's car (s). */
  sameCarLossSec: number | null;
  /** Null when no rule explains the loss: the line then says so. */
  rule: HabitRule | null;
  /** The rule's usual gap: metres, km/h or brake points, as the rule measures it. */
  gap: number | null;
  speeds: TurnSpeeds;
  /** How the turn loses its speed; null when the speeds are level or the arc is not measured. */
  kind: LossKind | null;
  arc: TurnArc | null;
  /** The one thing to try, the largest gap among the actions of the kind; null when none stands out. */
  action: HabitAction | null;
  /** What else can be tried there, the largest gap first: the next one is offered when a try of `action` gave no gain. */
  otherActions: HabitAction[];
  causes: HabitCause[];
  /** The share of counted laps where the rule held (or, without a rule, where the half lost time). */
  repeatability: number;
  confidence: number;
  /** lossSec × repeatability × confidence. */
  priority: number;
  line: string;
  detail: string;
}

/** What differs in a half of a turn between two laps, where the one lap loses time to the other. */
export interface LapTurnDifference {
  half: TurnHalf;
  /** The time the lap loses to the other lap in the half (s). */
  lossSec: number;
  /** The first headline measure that differs the losing way; null when none does. */
  rule: HabitRule | null;
  /** The rule's gap between the two laps: metres, km/h or brake points, as the rule measures it. */
  gap: number | null;
  /** How the lap's lower minimum speed came about ("tighter arc (34 m radius against 42 m)"); null when the speeds are level or no arc is measured. */
  kindLine: string | null;
  /** What else differs in the half, without what the headline already says. */
  causes: HabitCause[];
}

/** One lap against another through a turn: a description of two laps, never a habit and never advice. */
export interface LapTurnComparison {
  /** The halves where the lap loses time worth telling, in lap order. */
  differences: LapTurnDifference[];
  /** The lap loses time with a car close ahead through the turn: the loss is not the driving. */
  traffic: boolean;
  /**
   * The lap loses time into the turn with ABS working this much longer than on the other lap (s); null otherwise.
   * A lockup against the driver's own lap; against another driver it may be how they brake, so it is said as measured.
   */
  absMoreSec: number | null;
}

/** Why one lap lost time in one turn against the driver's own usual there. */
export type MistakeCause = 'traffic' | 'brakeEarly' | 'lockup' | 'slowMiddle' | 'lift' | 'slowExit' | null;

export interface CornerMistake {
  lapOrdinal: number;
  cornerId: number;
  turnId: number;
  turnLabel: string;
  /** Against the driver's own usual through the turn (s). */
  lossSec: number;
  cause: MistakeCause;
  line: string;
}

/**
 * The driver a corner is compared with: the layout's target (the best true pace in the class, the same for every
 * session); a corner the target lacks takes the candidates' fastest usual there.
 */
export interface CornerReference {
  sessionId: string;
  driverOrdinal: number;
  name: string;
  /** The car's model, null when unknown. */
  car: string | null;
  laps: number;
  /** The usual time through the corner's turns (s). */
  usualSec: number;
  /** The counted lap whose time through the corner is closest to the usual: the one a view opens. */
  usualLapOrdinal: number;
}

export interface CornerAnalysisCorner {
  id: number;
  label: string;
  name: string;
  turnIds: number[];
  /** The driver's usual time through the corner's turns (s), and the loss to the reference's (null without one). */
  usualSec: number | null;
  /** The driver's counted lap closest to their usual through the corner (null without a usual). */
  usualLapOrdinal: number | null;
  lossSec: number | null;
  reference: CornerReference | null;
}

export interface CornerAnalysis {
  laps: number;
  corners: CornerAnalysisCorner[];
  /** The layout's target: the best true pace in the class, the same driver for every session; null without one. */
  target: (Omit<CornerReference, 'usualSec' | 'usualLapOrdinal'> & { paceSec: number }) | null;
  /** The quickest driver in the driver's own car, checking a target in another car; null when there is none. */
  sameCarReference: Omit<CornerReference, 'usualSec' | 'usualLapOrdinal'> | null;
  /** Ranked by priority (a view shows the first MAX_HABITS); the turns losing time that no rule explains follow separately. */
  habits: CornerHabit[];
  unexplained: CornerHabit[];
  /** Losses to the reference that the quickest driver in the same car does not share: the car, not the driving. */
  carDifferences: CornerHabit[];
  /** In lap order. */
  mistakes: CornerMistake[];
  /** The turns measured against the target, in turn order. */
  measures: TurnMeasures[];
}

/** A session of the driver's habit history. */
export interface AnalysisSessionRef {
  sessionId: string;
  timestamp: number;
  sessionType: string;
}

/** The analysis of a session's player (`GET /api/session/:id/corner-analysis`), with what it was read for. */
export interface SessionCornerAnalysis extends CornerAnalysis {
  sessionId: string;
  layoutKey: string;
  carClass: string;
  /** The car's model; null when unknown. */
  car: string | null;
  driverOrdinal: number;
  /** The 2 corners to work on next and the progress on them, over the driver's analysed sessions here in the class. */
  focus: HabitFocus;
  /** The session's true pace against the target's and the goal; null without a target. */
  goal: PaceGoal | null;
}

/** A corner's habit over the driver's latest analysed sessions at the layout, in the class (the corner trends row). */
export interface CornerHabitTrend {
  /** The latest analysed session. */
  session: AnalysisSessionRef;
  /** Its habit at the corner (the named one a focus would carry, else a loss no rule explains); null when it loses nothing worth telling. */
  habit: CornerHabit | null;
  /** The usual time lost to the target through the whole corner that session (s a lap); null without a target there. */
  costSec: number | null;
  /** One of the 2 focus corners: by the rules, or pinned by the driver. */
  focus: 'focus' | 'pinned' | null;
  /** The corner's first turn: what a pin is stored on. */
  pinTurnId: number;
  slipping: boolean;
  /** What the series' gap measures: the habit's rule at its turn; null without a named habit. */
  gap: { rule: HabitRule; turnLabel: string; unit: GapUnit } | null;
  /** The last few sessions that measured the corner, oldest first: its cost and the habit's gap (null where not measured). */
  series: Array<{ session: AnalysisSessionRef; costSec: number; gap: number | null }>;
  /**
   * The laps that show the habit: the latest session's lap closest to the driver's usual through the corner, against
   * the target's lap closest to theirs (the lap view opens one against the other); null without a target.
   */
  view: { lap: { sessionId: string; driverOrdinal: number; lapOrdinal: number }; reference: { sessionId: string; driverOrdinal: number; lapOrdinal: number; name: string } } | null;
}
