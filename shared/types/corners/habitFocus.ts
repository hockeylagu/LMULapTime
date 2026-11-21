import type { AnalysisSessionRef, CornerHabit, HabitActionType, HabitRule } from './cornerAnalysis.js';
import type { PaceCategory } from '../reference.js';

/** What a habit's gap is counted in. */
export type GapUnit = 'km/h' | 'm' | 'points';

/** A focus corner of the session shown: one of the 2 the driver works on next (shared/domain/cornerAnalysis/habitFocus.ts). */
export interface FocusCorner {
  cornerId: number;
  /** The corner's turns ("T5–T6"). */
  name: string;
  /** The corner's first turn: what a pin is stored on. */
  pinTurnId: number;
  pinned: boolean;
  /** The corner's habit this session; null for a pinned corner with no named habit (its cost still shows). */
  habit: CornerHabit | null;
  /** The usual time lost to the target through the whole corner (s a lap); null when the session did not measure it. */
  costSec: number | null;
  /** The cost sits well above its recent level in the latest sessions running. */
  slipping: boolean;
}

/** A focus corner, or one that left the focus lately, then against now. */
export interface FocusProgress {
  cornerId: number;
  name: string;
  /** In focus now, or out of it within the last few sessions ("no longer in your top 2"): leaving is not fixing. */
  state: 'focus' | 'left';
  slipping: boolean;
  /** The previous session that measured the corner: what "then" is (the span "Last try" reads). */
  since: AnalysisSessionRef & { driverOrdinal: number };
  costThenSec: number;
  costNowSec: number;
  /** Corner cost (s/lap) across the last measuring sessions, oldest first (up to 5 points), for the sparkline. */
  costs: number[];
  /** The corner habit's own measure at its turn, the driver's usual against the target's, in `since` and now; null without a named habit. */
  gap: { rule: HabitRule; turnLabel: string; unit: GapUnit; before: number; now: number } | null;
  /**
   * The action the session before advised here, when the driver's usual moved its way since: what they did, and
   * whether the corner's cost followed. Null when it did not move or nothing was advised.
   */
  tried: { action: HabitActionType; turnLabel: string; did: string; moved: number; costChangeSec: number; worked: boolean } | null;
  /** The driver's counted laps closest to their usual through the corner, now and then: the lap view opens one against the other. */
  view: { lapOrdinal: number; thenLapOrdinal: number } | null;
}

/** The focus of a session: its 2 corners and the progress on them and on those that left lately. */
export interface HabitFocus {
  /** The driver's analysed sessions here in the class up to this one, this one included. */
  sessions: number;
  corners: FocusCorner[];
  progress: FocusProgress[];
}

/** A pinned corner of a layout and class: the driver's own choice of focus, by a turn of the corner. */
export interface HabitFocusPin {
  layoutKey: string;
  carClass: string;
  turnId: number;
}

/**
 * The goal: the next pace level of the Reference Benchmarks above the session's true pace, the levels the pace badges
 * rate with (driver, 2026-11-21: a midpack driver aims for Good, a good one for Competitive; nobody goes straight to
 * Alien pace, so there is no percent to set). True pace is the average of the 3 fastest clean dry laps, so one lucky
 * lap does not reach a level; a qualifying session counts with the laps it has.
 */
export interface PaceGoal {
  /** The benchmark target of the layout and class (s): 100%. */
  benchmarkSec: number;
  /** The session's true pace as a percent of the benchmark target, and the level it is in. */
  percent: number;
  level: PaceCategory;
  /** The level above, where it starts (percent of the benchmark target) and the seconds a lap to find to reach it; null at the top level. */
  next: { level: PaceCategory; maxPercent: number; toFindSec: number } | null;
}
