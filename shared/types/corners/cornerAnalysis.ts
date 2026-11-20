import type { CornerPass } from './cornerPasses.js';

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
  /** Driven in the analysed session: a reference from it is preferred (same grip, rubber and patch). */
  sameSession: boolean;
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
  /** Other human drivers of the class: the analysed session's and the layout's other sessions'. */
  others: AnalysisDriver[];
  /** Counted laps a reference needs: its usual is a median, never one lap. */
  minReferenceLaps: number;
}

/** Into the turn's slowest point, out of it, or the whole turn when the split is unknown. */
export type TurnHalf = 'in' | 'out' | 'whole';

/** The patterns the engine can name (shared/domain/cornerAnalysis/habitRules.ts). */
export type HabitRule =
  | 'brakesWhereLift'
  | 'dragBrake'
  | 'coast'
  | 'overSlowing'
  | 'brakeEarly'
  | 'apexEarly'
  | 'inFastOutSlow'
  | 'partThrottle'
  | 'gear';

/** A loss to the class that repeats, and what explains it. */
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
  /** The rule's usual gap: metres, km/h, seconds or a gear difference, as the rule measures it. */
  gap: number | null;
  /** The share of counted laps where the rule held (or, without a rule, where the half lost time). */
  repeatability: number;
  confidence: number;
  /** lossSec × repeatability × confidence. */
  priority: number;
  line: string;
  detail: string;
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
 * The reference a corner is compared with: one driver for the whole session, the quickest of the analysed session when
 * quicker than the driver, else the layout's quickest; a corner that driver lacks takes its own quickest there.
 */
export interface CornerReference {
  sessionId: string;
  driverOrdinal: number;
  name: string;
  /** The car's model, null when unknown. */
  car: string | null;
  sameSession: boolean;
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
  /** The quickest driver in the driver's own car, checking a reference in another car; null when there is none. */
  sameCarReference: Omit<CornerReference, 'usualSec' | 'usualLapOrdinal'> | null;
  /** Ranked by priority (a view shows the first MAX_HABITS); the turns losing time that no rule explains follow separately. */
  habits: CornerHabit[];
  unexplained: CornerHabit[];
  /** Losses to the reference that the quickest driver in the same car does not share: the car, not the driving. */
  carDifferences: CornerHabit[];
  /** In lap order. */
  mistakes: CornerMistake[];
}

/** A session of the driver's habit history. */
export interface AnalysisSessionRef {
  sessionId: string;
  timestamp: number;
  sessionType: string;
}

/** A habit against the driver's previous session at the layout in the same car: the driver against themself. */
export interface HabitChange {
  turnId: number;
  half: TurnHalf;
  rule: HabitRule | null;
  /** Not among that session's habits at the turn (the same rule at the same turn). */
  isNew: boolean;
  /** The cue the rule names, now against then ("brake 6 m later"); null without a rule or a measure. */
  cue: string | null;
}

/** The analysis of a session's player (`GET /api/session/:id/corner-analysis`), with what it was read for. */
export interface SessionCornerAnalysis extends CornerAnalysis {
  sessionId: string;
  layoutKey: string;
  carClass: string;
  driverOrdinal: number;
  /** The habits and unexplained losses against the previous analysed session in the same car; null without one. */
  sinceLast: { session: AnalysisSessionRef; habits: HabitChange[] } | null;
}

/** A corner's habit over the driver's latest analysed sessions at the layout, in one car (the corner trends row). */
export interface CornerHabitTrend {
  /** The latest analysed session. */
  session: AnalysisSessionRef;
  /** Its main habit at the corner (the highest priority, else a loss no rule explains); null when it loses nothing worth telling. */
  habit: { line: string; lossSec: number; rule: HabitRule | null } | null;
  /** The sessions, of the last few analysed, where the same habit showed (the same rule at the same turn), and how many were read. */
  seen: number;
  of: number;
  /** The analysed session before it, null without one. */
  since: AnalysisSessionRef | null;
  /** The usual time through the corner then minus now (s): positive is quicker now. */
  gainSec: number | null;
  change: HabitChange | null;
  /** That session's main habit at the corner when it no longer shows. */
  fixed: string | null;
}
