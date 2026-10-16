import type { LiveLapsLeft, LiveSessionInfo } from '../../types/live.js';
import type { LiveVehicleReading } from './liveLifecycle.js';

const FINISHED = 1;

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Race laps left, counting the lap in progress (the HUD's lap 22 of 26 is 5 left).
 *
 * - Lap-limited race: `maxLaps - player.totalLaps` (`totalLaps` counts completed laps). Exact.
 * - Timed race: the leader gets the flag at the first line crossing after the clock ends. With `L` its lap start
 *   time, `e` its estimated lap time and `E` the end time, it still has `ceil((E - L) / e)` laps counting the
 *   one in progress (the laps it still starts before the clock ends, plus the one it finishes: the lap in
 *   progress is the last when `L + e >= E`). A car `b` laps behind the leader finishes `b` laps fewer, but never
 *   fewer than the lap in progress. Marked `estimated`, since the lap time estimate moves.
 * - Null when it is not a race, the player has finished, a timed race has no usable estimate, or the leader
 *   has no lap left to run (everyone is cooling down).
 */
export function computeLapsLeft(
  session: Pick<LiveSessionInfo, 'kind' | 'maxLaps' | 'endSeconds' | 'elapsedSeconds'> | null,
  player: LiveVehicleReading | null,
  leader: LiveVehicleReading | null,
): LiveLapsLeft | null {
  if (!session || session.kind !== 'race' || !player || player.finishStatus === FINISHED) return null;
  if (session.maxLaps !== null) {
    const laps = session.maxLaps - player.totalLaps;
    return laps >= 1 ? { laps, estimated: false } : null;
  }
  if (session.endSeconds === null || !leader) return null;
  if (leader.finishStatus === FINISHED) return { laps: 1, estimated: true };
  if (!(leader.lapStartEt >= 0) || !positive(leader.estimatedLapTime)) return null;
  const leaderLaps = Math.ceil((session.endSeconds - leader.lapStartEt) / leader.estimatedLapTime);
  if (leaderLaps < 1) return null;
  const behind = leader.id === player.id ? 0 : Math.max(0, player.lapsBehindLeader);
  return { laps: Math.max(1, leaderLaps - behind), estimated: true };
}
