import type { LiveLapsLeft, LiveSessionInfo } from '../../types/live.js';
import type { LiveVehicleReading } from './liveLifecycle.js';

const FINISHED = 1;

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Race laps left, counting the lap in progress. LMU races are always timed, so the clock is converted to laps:
 * the leader gets the flag at the first line crossing after the clock ends. With `L` its lap start
 *   time, `e` its estimated lap time and `E` the end time, it still has `ceil((E - L) / e)` laps counting the
 *   one in progress (the laps it still starts before the clock ends, plus the one it finishes: the lap in
 *   progress is the last when `L + e >= E`). A car `b` laps behind the leader finishes `b` laps fewer, but never
 *   fewer than the lap in progress. Marked `estimated`, since the lap time estimate moves.
 * Null when it is not a race, the player has finished, there is no usable estimate, or the leader
 *   has no lap left to run (everyone is cooling down).
 */
export function computeLapsLeft(
  session: Pick<LiveSessionInfo, 'kind' | 'endSeconds' | 'elapsedSeconds'> | null,
  player: LiveVehicleReading | null,
  leader: LiveVehicleReading | null,
): LiveLapsLeft | null {
  if (!session || session.kind !== 'race' || !player || player.finishStatus === FINISHED) return null;
  if (session.endSeconds === null || !leader) return null;
  // Once the leader has the flag, the lap in progress is the last: exact.
  if (leader.finishStatus === FINISHED) return { laps: 1, estimated: false };
  if (!(leader.lapStartEt >= 0) || !positive(leader.estimatedLapTime)) return null;
  const leaderLaps = Math.ceil((session.endSeconds - leader.lapStartEt) / leader.estimatedLapTime);
  if (leaderLaps < 1) return null;
  const behind = leader.id === player.id ? 0 : Math.max(0, player.lapsBehindLeader);
  return { laps: Math.max(1, leaderLaps - behind), estimated: true };
}
