import type { LiveLapsLeft, LiveSessionInfo } from '../../types/live.js';
import type { LiveVehicleReading } from './liveLifecycle.js';
import { knownCarClass } from '../vehicleMapping.js';

const FINISHED = 1;
const GREEN = 5;
const SESSION_OVER = 8;
/** rF2's paused phase; LMU also reports it in a race garage before the start (seen 2026-10-17, clock at 0). */
const PAUSED = 9;

/**
 * Whether a race's clock runs, so its end time is the race end. Before the green flag the end time is the countdown
 * to the start (64 s on the grid, 2026-10-16) or a few seconds (5 s at phase 9 then 0 in the garage, 2026-10-17).
 */
export function raceClockRunning(gamePhase: number, elapsedSeconds: number): boolean {
  return (gamePhase >= GREEN && gamePhase <= SESSION_OVER) || (gamePhase === PAUSED && elapsedSeconds > 0);
}

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/** The class leader's estimated lap time when it races in the player's (known) class, else null. */
export function classLeaderLapSeconds(player: LiveVehicleReading | null, classLeader: LiveVehicleReading | null | undefined): number | null {
  const playerClass = knownCarClass(player?.vehicleClass);
  return playerClass && classLeader && knownCarClass(classLeader.vehicleClass) === playerClass && positive(classLeader.estimatedLapTime)
    ? classLeader.estimatedLapTime : null;
}

/**
 * Qualifying: the player's own laps to its flag, the first line crossing after the clock ends. In the pits the lap
 * start stands still, so the laps count from now (seen 2026-10-17: 9 laps held in the garage while the clock ran out).
 */
function ownLapsLeft(session: Pick<LiveSessionInfo, 'endSeconds' | 'elapsedSeconds'>, player: LiveVehicleReading): LiveLapsLeft | null {
  if (session.endSeconds === null) return null;
  const start = player.inPits ? Math.max(player.lapStartEt, session.elapsedSeconds) : player.lapStartEt;
  const flag = projectRaceFlagSeconds(session.endSeconds, start, player.estimatedLapTime);
  return flag === null ? null : { laps: Math.round((flag - start) / player.estimatedLapTime), estimated: true };
}

/**
 * Overall leader's first estimated line crossing at/after the timed end. No class sets its own race end. A stop the
 * leader still makes (`stopSeconds`) moves its crossings later, often by a lap (Le Mans race 2026-10-23: 18 laps read
 * until the leader stopped on lap 13, everyone ran 17).
 */
export function projectRaceFlagSeconds(endSeconds: number, lapStart: number, lapSeconds: number, stopSeconds = 0): number | null {
  if (!positive(endSeconds) || !Number.isFinite(lapStart) || lapStart < 0 || !positive(lapSeconds)) return null;
  if (Math.ceil((endSeconds - lapStart) / lapSeconds) < 1) return null;
  const stop = Math.max(0, stopSeconds);
  return lapStart + Math.max(1, Math.ceil((endSeconds - lapStart - stop) / lapSeconds)) * lapSeconds + stop;
}

/** The player's own side of the race distance (`LiveSessionTracker`). */
export interface LiveOwnPace {
  /** Median of the player's recent valid laps; null before one. */
  lapSeconds: number | null;
  /** Time a planned stop still costs before the flag (pit lane loss plus service); 0 without one. */
  stopSeconds: number;
  /** What one stop costs (pit lane loss plus service), also once the player's is behind: the leader's still to make. */
  stopCostSeconds: number;
  /** Share of the lap in progress already driven, 0..1; null when unknown. */
  lapFraction: number | null;
}

/**
 * Race laps left, counting the lap in progress. LMU races are always timed, so the clock is converted to laps:
 * the leader gets the flag at the first line crossing after the clock ends. With `L` its lap start
 *   time, `e` its estimated lap time and `E` the end time, it still has `ceil((E - L) / e)` laps counting the
 *   one in progress (the laps it still starts before the clock ends, plus the one it finishes: the lap in
 *   progress is the last when `L + e >= E`), so it takes the flag at `F = L + n * e`. Every other car gets the
 *   flag at its first line crossing from `F`. With `p` its own measured pace (else the same-class leader's, else its
 *   own estimate), its next crossing is `c = max(l + p, now + (1 - fraction) * p)` (`l` its lap start: a lap slowed by
 *   a stop or a spin crosses later), and it has `1 + ceil((F - c - s) / p)` laps, or 1 when `c >= F`, with `s` the
 *   time its planned stop still costs (Le Mans race 2026-10-22: the class leader's pace and no stop read 17 laps to
 *   lap 11, the car ran 16). The leader itself counts the same way to `E`. Laps already lost never add extra laps.
 *   The leader is taken to make the player's stops: while it has made fewer than the player's done and planned, one
 *   more stop of the player's cost delays `F` (`projectRaceFlagSeconds`).
 *   Never fewer than the lap in progress. Marked `estimated`, since the lap time estimates move.
 * Null when it is not a race, the race clock does not run yet (`raceClockRunning`), the player has finished, there is no usable lap start or estimate, or the leader
 *   has no lap left to run (everyone is cooling down).
 */
export function computeLapsLeft(
  session: Pick<LiveSessionInfo, 'kind' | 'endSeconds' | 'elapsedSeconds' | 'gamePhase'> | null,
  player: LiveVehicleReading | null,
  leader: LiveVehicleReading | null,
  classLeader: LiveVehicleReading | null = null,
  own: LiveOwnPace = { lapSeconds: null, stopSeconds: 0, stopCostSeconds: 0, lapFraction: null },
): LiveLapsLeft | null {
  if (!session || !player || player.finishStatus === FINISHED) return null;
  if (session.kind === 'qualifying') return ownLapsLeft(session, player);
  if (session.kind !== 'race') return null;
  if (session.endSeconds === null || !leader || !raceClockRunning(session.gamePhase, session.elapsedSeconds)) return null;
  // Once the leader has the flag, the lap in progress is the last: exact.
  if (leader.finishStatus === FINISHED) return { laps: 1, estimated: false };
  const stop = Number.isFinite(own.stopSeconds) ? Math.max(0, own.stopSeconds) : 0;
  const ownPace = own.lapSeconds !== null && positive(own.lapSeconds) ? own.lapSeconds : null;
  const fraction = own.lapFraction !== null && Number.isFinite(own.lapFraction) ? Math.min(Math.max(own.lapFraction, 0), 1) : null;
  const lapsTo = (flag: number, lapStart: number, pace: number): LiveLapsLeft => {
    const next = Math.max(lapStart + pace, fraction === null ? -Infinity : session.elapsedSeconds + (1 - fraction) * pace);
    return { laps: next >= flag ? 1 : 1 + Math.max(0, Math.ceil((flag - next - stop) / pace)), estimated: true };
  };
  if (leader.id === player.id) {
    const pace = ownPace ?? leader.estimatedLapTime;
    return projectRaceFlagSeconds(session.endSeconds, leader.lapStartEt, pace) === null ? null : lapsTo(session.endSeconds, leader.lapStartEt, pace);
  }
  const leaderStops = (leader.pitStops ?? 0) < (player.pitStops ?? 0) + (stop > 0 ? 1 : 0);
  const leaderStop = leaderStops && Number.isFinite(own.stopCostSeconds) ? Math.max(0, own.stopCostSeconds) : 0;
  const flag = projectRaceFlagSeconds(session.endSeconds, leader.lapStartEt, leader.estimatedLapTime, leaderStop);
  if (flag === null) return null;
  const pace = ownPace ?? classLeaderLapSeconds(player, classLeader) ?? player.estimatedLapTime;
  if (!(player.lapStartEt >= 0) || !positive(pace)) return null;
  return lapsTo(flag, player.lapStartEt, pace);
}
