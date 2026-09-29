/**
 * What happened in one pit stop, from the linked replay's pit events (and, for the player, the
 * energy in their stored laps). Set on the in-lap at read time; absent without a replay.
 */
export interface PitService {
  /** Pit entry line to pit exit line; null when one of the two events is missing. */
  pitLaneSec: number | null;
  /** On the jacks to service complete: the time in the box; null for a drive-through. */
  serviceSec: number | null;
  /** The median time in the box of the driver's class in this session (other stops), null below 3 stops. */
  classMedianServiceSec: number | null;
  /** Virtual energy (%) when the car came in and when the refill finished; absent when not recorded. */
  energyFrom?: number;
  energyTo?: number;
  /** From on the jacks to the end of the refill; absent when the energy was not recorded or not refilled. */
  refillSec?: number;
  /** A penalty served during the stop: its time in the box is not service. */
  penaltyServed?: boolean;
  /**
   * The car stayed this much longer than a normal stop (the refill, or the class's usual stop,
   * whichever is longer), with no penalty to explain it: a guess at repairs. The replay records
   * no repair, so this is never stated as one.
   */
  unexplainedSec?: number;
}
