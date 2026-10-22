import type { LiveLapRecord } from '../../types/live.js';
import type { LiveVehicleReading } from './liveLifecycle.js';
import { median } from '../pitStops.js';

/** A car in the pit lane that does not move for longer than this (seconds) is stopped in its box. */
export const PIT_LANE_STOPPED_GAP_SECONDS = 1;
/** Stored measurements the median of a layout and class is taken over: the newest ones. */
export const PIT_LANE_LOSS_SAMPLES = 20;
/** The player's pace: the median of its newest valid laps, stop laps left out. */
export const PIT_LANE_PACE_LAPS = 5;

/**
 * Damage spoils a stop's measurement when it came on the laps its pace is taken over, the in-lap or the out-lap: the
 * stop laps are then slow for their own reasons. Older damage is in the pace too (Bahrain 2026-10-21: hit on lap 2,
 * 74 s laps on to the stop on lap 14).
 */
export const damageSpoilsStop = (impactLap: number | null, inLap: number): boolean => impactLap !== null && impactLap >= inLap - PIT_LANE_PACE_LAPS;

const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0;

/**
 * The time a stop loses driving through the pit lane, entry and exit, without the time stopped in the box: the in-lap
 * and the out-lap against two laps at `pace`, less `stoppedSeconds`. A planned stop then costs this plus its own
 * service (fuel, tyres, repairs, penalties), which changes from stop to stop. Le Mans 2026-10-22, the second stop:
 * 223.3 + 242.2 - 2 x 214.8 - 6.6 = 29.3 s. Null when an input is missing or nothing was lost.
 */
export function pitLaneLoss(inLapSeconds: number | null, outLapSeconds: number | null, pace: number | null, stoppedSeconds: number): number | null {
  if (!positive(inLapSeconds) || !positive(outLapSeconds) || !positive(pace) || !Number.isFinite(stoppedSeconds) || stoppedSeconds < 0) return null;
  const loss = inLapSeconds + outLapSeconds - 2 * pace - stoppedSeconds;
  return loss > 0 ? Math.round(loss * 10) / 10 : null;
}

/** One measured stop: its pit lane loss and the lap the car entered the lane on. */
export interface PitLaneMeasurement { seconds: number; inLap: number }

interface LaneStop {
  /** The lap the car entered the lane on (the in-lap); the next one is the out-lap. */
  inLap: number;
  stoppedSeconds: number;
  lastDist: number;
  lastMoveEt: number;
  /** The previous reading's time: standing still lasts from the last move to the last reading before moving again. */
  lastEt: number;
  /** The newest damage lap seen from the entry to the end of the out-lap (`damageSpoilsStop`). */
  impactLap: number | null;
}

/**
 * Measures each race stop's pit lane loss (`pitLaneLoss`) from the scoring readings: the entry seen from the track
 * (a start from the garage is no stop), the time standing still in the lane (the lap distance unchanged for over
 * `PIT_LANE_STOPPED_GAP_SECONDS`), then the in-lap and out-lap once both are timed, against `pace`. A stop with
 * recent damage is not measured (`damageSpoilsStop`). The in-lap and out-lap never count as pace, even when the game times them as valid laps
 * (a line outside the pit lane).
 */
export class LivePitLaneMeter {
  private wasInPits: boolean | null = null;
  private open: LaneStop | null = null;
  private done: LaneStop | null = null;
  private validLaps: number[] = [];
  private lastLap: number | null = null;

  public reset(): void {
    this.wasInPits = null; this.open = null; this.done = null; this.validLaps = []; this.lastLap = null;
  }

  /** The median of the newest valid laps that were no in-lap or out-lap; null before one. */
  public pace(): number | null { return median(this.validLaps.slice(-PIT_LANE_PACE_LAPS)); }

  /** Follows one reading; returns a new loss once the out-lap of a measured stop is timed. */
  public update(player: LiveVehicleReading, et: number, laps: readonly LiveLapRecord[], impactLap: number | null): PitLaneMeasurement | null {
    const latest = laps[laps.length - 1];
    if (latest && latest.lapNumber !== this.lastLap) {
      this.lastLap = latest.lapNumber;
      const stopLap = [this.open, this.done].some(stop => stop && latest.lapNumber >= stop.inLap && latest.lapNumber <= stop.inLap + 1);
      if (latest.valid && !stopLap && !player.inPits && positive(latest.lapSeconds)) this.validLaps.push(latest.lapSeconds);
    }
    const entered = player.inPits && this.wasInPits === false;
    this.wasInPits = player.inPits;
    if (entered) this.open = { inLap: player.totalLaps + 1, stoppedSeconds: 0, lastDist: player.lapDist, lastMoveEt: et, lastEt: et, impactLap };
    for (const stop of [this.open, this.done]) if (stop && impactLap !== null) stop.impactLap = Math.max(stop.impactLap ?? impactLap, impactLap);
    const open = this.open;
    if (open && player.inPits) {
      if (Math.abs(player.lapDist - open.lastDist) > 0.5) {
        const still = open.lastEt - open.lastMoveEt;
        if (still > PIT_LANE_STOPPED_GAP_SECONDS) open.stoppedSeconds += still;
        open.lastDist = player.lapDist;
        open.lastMoveEt = et;
      }
      open.lastEt = et;
    } else if (open) {
      this.done = open;
      this.open = null;
    }
    const stop = this.done;
    if (!stop || !latest || latest.lapNumber < stop.inLap + 1) return null;
    this.done = null;
    const lapSeconds = (number: number) => laps.find(lap => lap.lapNumber === number)?.lapSeconds ?? null;
    const seconds = damageSpoilsStop(stop.impactLap, stop.inLap) ? null : pitLaneLoss(lapSeconds(stop.inLap), lapSeconds(stop.inLap + 1), this.pace(), stop.stoppedSeconds);
    return seconds === null ? null : { seconds, inLap: stop.inLap };
  }
}
