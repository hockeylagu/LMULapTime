/**
 * Live race intelligence contracts: virtual energy or fuel, the next pit stop, damage, tyres and the forecast.
 * Built by `shared/domain/live/liveStrategyTracker.ts` from the shared memory and LMU's local REST reads
 * (docs/LMU_REST_API.md section 4.3). Every figure is deterministic; unknown values are null, never zero-filled.
 */

/** Virtual energy for GT3 and Hypercar, fuel for every other class; only one is ever shown. */
export type LiveResourceKind = 've' | 'fuel';

/** Where the per-lap use comes from: laps measured in this event, or LMU's own estimate before the first lap. */
/** `history`: the player's earlier races on the layout in the class (the garage plan only, before the event's laps). */
export type LivePerLapSource = 'measured' | 'game' | 'history';

import type { LiveFuelRatio, LiveSavingPlan, LiveTyreCoverage } from './liveInsights.js';

export interface LiveResourcePlan {
  kind: LiveResourceKind;
  /** Percent of a full VE tank, or litres. */
  unit: '%' | 'L';
  /** Amount now. */
  amount: number | null;
  /** A full tank in `unit` (100 for VE). */
  capacity: number | null;
  /** Use per lap: the mean of the last five representative laps less the lowest, or the game's estimate before the first. */
  perLap: number | null;
  perLapSource: LivePerLapSource | null;
  /** Historical calibration applied to the baseline; absent when ordinary estimation is used. */
  learning?: { baselinePerLap: number; adjustment: number };
  /** Representative laps measured in this event (all sessions on this layout and car). */
  lapsMeasured: number;
  /** Reserve kept at the pit entry or the finish, in laps. */
  reserveLaps: number;
  /** Laps the amount still covers after the reserve, from the current position. */
  lapsInTank: number | null;
  /** Races only, with laps left known. */
  race: LiveRacePlan | null;
  saving?: LiveSavingPlan | null;
}

export interface LiveRacePlan {
  /** The finish is reachable with the reserve: no pit stop for the resource. */
  finishReachable: boolean;
  /** Projected at the finish when reachable. */
  atFinish: number | null;
  /** Laps before the pit lap: 0 is pit this lap. Null when the finish is reachable. */
  pitInLaps: number | null;
  /** Racing lap to pit on. */
  pitLap: number | null;
  /**
   * Allowed use per lap to reach the pit lap (or the finish) with the reserve, minus the use per lap:
   * positive is spare, negative means saving is needed.
   */
  sparePerLap: number | null;
  /** What the tank should hold after the next stop to reach the finish with the reserve, capped at a full tank. */
  neededAfterStop: number | null;
  /**
   * The same for a stop at the end of the lap in progress (an unplanned stop: damage, or pitting early), also when
   * the finish is reachable; capped at a full tank.
   */
  neededStopNow: number;
  /** Further stops after the next one when a full tank does not reach the finish. */
  stopsAfterNext: number;
}

export type LivePitState = 'none' | 'request' | 'entering' | 'stopped' | 'exiting';

/** The MFD as set for the next stop (`receivePitMenu`). */
export interface LivePitMenu {
  /** VE percent (`VIRTUAL ENERGY:`, the target after the stop) or fuel; null when the line is not there. */
  resourceValue: number | null;
  /** The line's text as the game shows it, e.g. `50% 20 laps`. */
  resourceText: string | null;
  /** `TIRES:` setting, e.g. `No Change`, `New Medium`, `New Wet`. */
  tyres: string | null;
  /** `DAMAGE:` setting: `N/A` without damage, else `Do Not Repair`, `Repair Body`, `Repair All`. */
  repair: string | null;
  fuelRatio?: number | null;
  fuelRatioOptions?: number[];
}

export interface LivePitInfo {
  state: LivePitState;
  /** Pending penalties: the next stop is a stop-and-go with no service while any is pending. */
  penalties: number;
  /** The game's estimate of the next service (`pitstop-estimate.total`); null while a penalty hides it. */
  serviceSeconds: number | null;
  /** The estimate plus the game's random delays (`pitStopTimes`), the top of the range. */
  serviceMaxSeconds: number | null;
  /**
   * The planned stop's service: the refuel to the plan's need after the stop (not the MFD target) and the game's
   * other service (tyres, repairs) as the MFD sets them. With the pit lane loss it is the stop's whole time loss, for
   * the race distance; null without the game's estimate, a stop to plan, or with a penalty.
   */
  plannedServiceSeconds: number | null;
  /** Stop-and-go hold while a penalty is pending. */
  penaltySeconds: number | null;
  mfd: LivePitMenu | null;
}

export type LiveCorner = 'FL' | 'FR' | 'RL' | 'RR';

export interface LiveDamage {
  /** A flat or lost wheel: pit now. */
  wheel: { problem: 'flat' | 'detached'; corner: LiveCorner } | null;
  /** Body aero damage (`getVehicleCondition.vehicleDamage`; above 1 after big hits). */
  body: number | null;
  /** Worst suspension damage, 0..1. */
  suspension: number | null;
  /** The game reports a detached part. */
  partsDetached: boolean;
  /** Racing lap on which the damage first showed, or last got worse (suspension, a wheel or a part lost). */
  impactLap: number | null;
  /** Completed laps since that lap. */
  lapsSinceImpact: number | null;
  /** Median of the valid laps after the impact minus the median of the last valid laps before it (two each at least). */
  paceLossPerLap: number | null;
  /** Pace loss times the race laps left. */
  lossToFinish: number | null;
  /** Repair time the game estimates (`pitstop-estimate.damage`), kept while a penalty hides it. */
  repairSeconds: number | null;
  /** Worth the driver's attention: a wheel problem, a pace loss of 0.3 s/lap or more, or a repair of 30 s or more. */
  significant: boolean;
}

export interface LiveTyres {
  coverage?: LiveTyreCoverage | null;
  /** Compound on the car (front), as the game names it. */
  compound: string | null;
  /** Tread left on the most worn tyre, 0..1 (`getVehicleCondition.tireCondition`). */
  worst: number | null;
  worstCorner: LiveCorner | null;
  /** Measured loss of that figure per lap, from laps of this stint; null before two laps. */
  wearPerLap: number | null;
  /** Complete new sets left: the game's new tyre count in whole fours. */
  newSets: number | null;
}

export interface LiveForecast {
  /** The next change in this session: rain arriving or ending; `none` when the weather holds to the end. */
  change: 'rain' | 'dry' | 'none';
  /** Rain chance at that forecast node, percent. */
  chance: number;
  /** Session seconds of the node (nodes are fractions of the session length). */
  atSeconds: number;
  /** Racing lap it lands on, from the lap time; null without one. */
  lap: number | null;
}

/** In the garage: what to load for this session. */
export interface LiveGaragePlan {
  learning?: LiveResourcePlan['learning'];
  tyreCoverage?: LiveTyreCoverage | null;
  kind: LiveResourceKind;
  unit: '%' | 'L';
  /** Session length in minutes. */
  sessionMinutes: number | null;
  /** Laps of the session (timed: laps started before the clock ends, plus the out lap). */
  laps: number | null;
  /** The lap time the laps come from. */
  lapSeconds: number | null;
  perLap: number | null;
  perLapSource: LivePerLapSource | null;
  lapsMeasured: number;
  reserveLaps: number;
  /** Amount to load, capped at a full tank. */
  needed: number | null;
  /** Stops the session needs when a full tank does not cover it. */
  stops: number | null;
  /** The start amount set in the garage (`getPlayerGarageData`). */
  setInGarage: number | null;
  /** Resource-based first racing pit lap from the selected start load, allowing one formation/out lap; null if unknown or no stop. */
  firstPitLap?: number | null;
  /** The tyres the car goes out on (`TireManagement` selected set); null until read. */
  tyres: LiveGarageTyres | null;
  /** The race of the event, planned from any garage before it (`shared/domain/strategy/raceStrategy.ts`); null until it can be. */
  raceStrategy?: LiveRaceStrategies | null;
}

/** One way to run the race: the stops the VE or fuel needs, what to load, and the race tyres. */
export interface LiveRaceStrategy {
  name: string;
  stops: number;
  /** Racing lap of the first stop; null without one. */
  pitLap: number | null;
  /** To load at the start, and at the last stop (what the finish needs), in the plan's unit. */
  loadStart: number;
  loadToFinish: number | null;
  /** The race tyres in the game's words (`NEW MEDIUM`, `USED MEDIUM`; at the stop `NO CHANGE`). */
  tyresStart: string;
  tyresStop: string | null;
  /** Tread left on the most worn tyre at the flag, 0..1; null before the event's wear is measured. */
  treadAtFlag: number | null;
  /** Seconds lost against the chosen plan (tyre changes): 0 for it, null when the game's change time is unknown. */
  gapSeconds: number | null;
}

/**
 * Where the plan's use per lap and wear come from: the event's own laps, the player's earlier races on the layout in
 * the class (`races` of them), or the game's estimate; null when unknown.
 */
export interface LiveRaceStrategyBasis {
  use: 'event' | 'history' | 'game' | null;
  wear: 'event' | 'history' | null;
  races: number;
}

/** The engine's pick for the race, and the next best. */
export interface LiveRaceStrategies {
  kind: LiveResourceKind;
  unit: '%' | 'L';
  raceMinutes: number;
  /** Racing laps (the formation lap is not one). */
  laps: number;
  chosen: LiveRaceStrategy;
  nextBest: LiveRaceStrategy | null;
  /** Set by the live tracker; the demo leaves it out. */
  basis?: LiveRaceStrategyBasis;
}

/** The tyre set selected in the garage for the next run. */
export interface LiveGarageTyres {
  compound: string | null;
  /** Any of the four already driven (a set carried over from an earlier session). */
  used: boolean;
  /** Tread left on the most worn of the four, 0-1. */
  wear: number;
  newSets: number | null;
}

export interface LiveStrategy {
  resource: LiveResourcePlan | null;
  pit: LivePitInfo | null;
  damage: LiveDamage | null;
  tyres: LiveTyres | null;
  forecast: LiveForecast | null;
  /** Garage only. */
  garage: LiveGaragePlan | null;
  fuelRatio?: LiveFuelRatio | null;
}
