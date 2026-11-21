import type { NonRepresentativeReason } from '../session.js';

/**
 * Corner passes: one car's drive through one official turn segment
 * of one lap, built per replay from its stored laps (server/corners/).
 */
export interface CornerPass {
  slot: number;
  lapNumber: number;
  /** The turn's id in its layout's placed list (`PlacedTurn.id`). */
  segment: number;
  /** Replay clock (seconds) at the segment's start, at its slowest point and at its end. */
  entrySec: number;
  minSpeedSec: number | null;
  exitSec: number;
  entrySpeedKmh: number | null;
  minSpeedKmh: number | null;
  exitSpeedKmh: number | null;
  /** Lap distances below are from the start line along the centre line; a point before the line is negative. */
  minSpeedM: number | null;
  brakeM: number | null;
  turnInM: number | null;
  throttleM: number | null;
  /** The gear at the slowest point. */
  minSpeedGear: number | null;
  /** The hardest braking from the brake point (else the segment's start) to the segment's end (0-1), and the time braking there (s). */
  peakBrake: number | null;
  brakeSec: number;
  /**
   * From the slowest point to the segment's end, the time on part throttle (10-95 %) with traction control off (s): a lift,
   * or a slow way back to full throttle; null without a slowest point.
   */
  partThrottleSec: number | null;
  /** Time with ABS active from the brake point (else the segment's start) to its end (s). */
  absSec: number;
  /** Off both pedals (brake under 5 %, throttle under 10 %) from the end of braking (else the segment's start) to the throttle pick-up (else the segment's end) (s). */
  coastSec: number;
  /** The closest car ahead during the pass, within 2 s at this car's speed. */
  aheadSlot: number | null;
  aheadGapSec: number | null;
}

/** An official turn as the passes cut it: its label and its segment, from the start line (metres). */
export interface CornerTurn {
  id: number;
  /** "T7", or the turn's name where it has no number; empty when it has neither (named by position). */
  label: string;
  /** Number, name and how the number was found, for a tooltip. */
  title: string;
  /** The title's head, without how it was found: "Turn 7 · Lesmo 1", or a sequence's turns ("Lesmo 1, Lesmo 2 (T6–T7)"). */
  name?: string;
  apexM: number;
  startM: number;
  endM: number;
  /**
   * A class's turn sequence (`?segments=sequences`): its class and the official turns it holds. Its id is its first
   * turn's, so it is unique within the class only; the slowest point stands for the apex.
   */
  sequence?: { carClass: string; turnIds: number[] };
}

/** What the passes cut: the layout's official turns, or each class's turn sequences (`?segments=`). */
export type CornerSegmentKind = 'turns' | 'sequences';

/**
 * GET /api/corner-sequences/layout: a layout's corners for a class, any lap's (no replay needed): the class's sequences,
 * or the official turns when the class has no map there. Distances from the start line; `startStationM` puts them on
 * the centre line.
 */
export interface LayoutCorners {
  kind: CornerSegmentKind;
  startStationM: number;
  lengthM: number;
  corners: CornerTurn[];
}

/** A car of the replay, for naming the traffic a pass met. */
export interface CornerPassCar {
  slot: number;
  name: string;
  carClass?: string;
  carNumber?: string;
  sessionDriverOrdinal?: number;
}

/**
 * A car's lap of the replay with the parser's flags (the session's results; the replay's own where the car is no
 * session driver): which passes count as a car's usual, and the marks on the corner card's strip.
 */
export interface CornerPassLap {
  slot: number;
  lapNumber: number;
  /** Replay clock (seconds) at the lap's start and end. */
  startSec: number;
  endSec: number;
  isValid: boolean;
  isPitStop: boolean;
  isOutLap: boolean;
  nonRepresentativeReason?: NonRepresentativeReason;
  /** Run on wet tyres or in the rain (the lap's conditions). */
  wet: boolean;
}

/** A contact of the replay (with a car, a wall or an object), for the incident mark. */
export interface CornerPassContact {
  slot: number;
  timeSec: number;
}

/** GET /api/session/:id/corner-passes: unavailable without a replay, a known layout, or passes of the current build. */
export type SessionCornerPasses =
  | {
    available: true;
    layoutKey: string;
    /** Where the start line is on the centre line, and its length: a lap point's station minus this is the pass distance. */
    startStationM: number;
    trackLengthM: number;
    turns: CornerTurn[];
    cars: CornerPassCar[];
    /** Every car's passes, or the asked driver's only; their laps and contacts likewise. */
    passes: CornerPass[];
    laps: CornerPassLap[];
    contacts: CornerPassContact[];
  }
  | { available: false; reason: string };
