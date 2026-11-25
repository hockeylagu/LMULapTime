import type { ReplayCloudFieldSample, ReplayDaylightClock } from '../../types/replay.js';
import type { ScenerySessionId } from '../../types/scenes/scenery.js';

const SESSIONS: Record<string, ScenerySessionId> = { Practice: 'practice1', Qualifying: 'qualify', Race: 'race' };

/**
 * The in-game clock of a replay moment: the session's start time of day (the replay's weather packets) and the session
 * time. Without a start (no weather packet) the start is null and the track's
 * default time for the session applies. The cloud cover is the replay's weather sample nearest the lap start, and so are
 * the cloud cells; the two drifts are ramps, so they are interpolated between the samples around the moment (held outside them).
 */
export function replayDaylightClock(
  sessionType: string | undefined, sessionStartMinute: number | null | undefined, sessionTimeSec: number,
  cloudCover?: ReadonlyArray<readonly [number, number]> | null, cloudField?: ReadonlyArray<ReplayCloudFieldSample> | null,
  cloudVariants?: readonly string[] | null,
): ReplayDaylightClock {
  const session = SESSIONS[sessionType ?? ''] ?? 'race';
  const clock: ReplayDaylightClock = { session, startMinute: typeof sessionStartMinute === 'number' ? sessionStartMinute : null, sessionTimeSec };
  // The weather sample nearest the lap start.
  let nearest: readonly [number, number] | undefined;
  for (const sample of cloudCover ?? []) if (!nearest || Math.abs(sample[0] - sessionTimeSec) < Math.abs(nearest[0] - sessionTimeSec)) nearest = sample;
  if (nearest) clock.cloudCover = nearest[1];
  const field = cloudField ?? [];
  if (field.length) {
    const next = field.findIndex(sample => sample[0] >= sessionTimeSec), a = field[Math.max(0, (next < 0 ? field.length : next) - 1)], b = field[next < 0 ? field.length - 1 : next];
    const t = b[0] > a[0] ? Math.min(1, Math.max(0, (sessionTimeSec - a[0]) / (b[0] - a[0]))) : 0;
    clock.cloudField = { cells: (t < 0.5 ? a : b)[3], upperDrift: a[1] + (b[1] - a[1]) * t, lowerDrift: a[2] + (b[2] - a[2]) * t, startUpperDrift: field[0][1], startLowerDrift: field[0][2], ...(cloudVariants ? { variants: [...cloudVariants] } : {}) };
  }
  return clock;
}
