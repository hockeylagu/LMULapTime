import type { LiveLapsLeft, LiveSessionInfo } from '../../types/live.js';
import type { LiveVehicleReading } from './liveLifecycle.js';
import { knownCarClass } from '../vehicleMapping.js';

const FINISHED = 1;

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/** The class leader's estimated lap time when it races in the player's (known) class, else null. */
export function classLeaderLapSeconds(player: LiveVehicleReading | null, classLeader: LiveVehicleReading | null | undefined): number | null {
  const playerClass = knownCarClass(player?.vehicleClass);
  return playerClass && classLeader && knownCarClass(classLeader.vehicleClass) === playerClass && positive(classLeader.estimatedLapTime)
    ? classLeader.estimatedLapTime : null;
}

/** Qualifying: the player's own laps to its flag, the first line crossing after the clock ends. */
function ownLapsLeft(endSeconds: number | null, player: LiveVehicleReading): LiveLapsLeft | null {
  if (endSeconds === null) return null;
  const flag = projectRaceFlagSeconds(endSeconds, player.lapStartEt, player.estimatedLapTime);
  return flag === null ? null : { laps: Math.round((flag - player.lapStartEt) / player.estimatedLapTime), estimated: true };
}

/** Overall leader's first estimated line crossing at/after the timed end. No class sets its own race end. */
export function projectRaceFlagSeconds(endSeconds: number, lapStart: number, lapSeconds: number): number | null {
  if (!positive(endSeconds) || !Number.isFinite(lapStart) || lapStart < 0 || !positive(lapSeconds)) return null;
  const laps = Math.ceil((endSeconds - lapStart) / lapSeconds);
  return laps >= 1 ? lapStart + laps * lapSeconds : null;
}

/**
 * Race laps left, counting the lap in progress. LMU races are always timed, so the clock is converted to laps:
 * the leader gets the flag at the first line crossing after the clock ends. With `L` its lap start
 *   time, `e` its estimated lap time and `E` the end time, it still has `ceil((E - L) / e)` laps counting the
 *   one in progress (the laps it still starts before the clock ends, plus the one it finishes: the lap in
 *   progress is the last when `L + e >= E`), so it takes the flag at `F = L + n * e`. Every other car gets the
 *   flag at its first line crossing from `F`: `ceil((F - l) / p)` laps with `l` its own lap start and `p` the
 *   same-class leader's pace when known, otherwise its own estimate. Laps already lost never add extra laps.
 *   Never fewer than the lap in progress. Marked `estimated`, since the lap time estimates move.
 * Null when it is not a race, the player has finished, there is no usable lap start or estimate, or the leader
 *   has no lap left to run (everyone is cooling down).
 */
export function computeLapsLeft(
  session: Pick<LiveSessionInfo, 'kind' | 'endSeconds' | 'elapsedSeconds'> | null,
  player: LiveVehicleReading | null,
  leader: LiveVehicleReading | null,
  classLeader: LiveVehicleReading | null = null,
): LiveLapsLeft | null {
  if (!session || !player || player.finishStatus === FINISHED) return null;
  if (session.kind === 'qualifying') return ownLapsLeft(session.endSeconds, player);
  if (session.kind !== 'race') return null;
  if (session.endSeconds === null || !leader) return null;
  // Once the leader has the flag, the lap in progress is the last: exact.
  if (leader.finishStatus === FINISHED) return { laps: 1, estimated: false };
  const flag = projectRaceFlagSeconds(session.endSeconds, leader.lapStartEt, leader.estimatedLapTime);
  if (flag === null) return null;
  const leaderLaps = Math.round((flag - leader.lapStartEt) / leader.estimatedLapTime);
  if (leader.id === player.id) return { laps: leaderLaps, estimated: true };
  const pace = classLeaderLapSeconds(player, classLeader) ?? player.estimatedLapTime;
  if (!(player.lapStartEt >= 0) || !positive(pace)) return null;
  return { laps: Math.max(1, Math.ceil((flag - player.lapStartEt) / pace)), estimated: true };
}
