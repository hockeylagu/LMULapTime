import type { ReplayCloudFieldSample, ReplayDaylightClock } from '../../types/replay.js';
import type { ScenerySessionId } from '../../types/scenes/scenery.js';

const SESSIONS: Record<string, ScenerySessionId> = { Practice: 'practice1', Qualifying: 'qualify', Race: 'race' };
/** Qualifying starts this long before the event's race start (docs/VCR_FORMAT.md §2.2). Online practice starts at it. */
const QUALIFYING_LEAD_MIN = 15;

/**
 * The in-game clock of a replay moment: the session start from the replay's race start and session type, and the session
 * time. Without a race start (offline, or a replay cached before it was read) the start is null and the track's default
 * time for the session applies. The cloud cover is the replay's weather sample nearest the lap start, and so are the cloud
 * cells; the two drifts are ramps, so they are interpolated between the samples around the moment (held outside them).
 */
export function replayDaylightClock(
  sessionType: string | undefined, raceStartMinute: number | null | undefined, sessionTimeSec: number,
  cloudCover?: ReadonlyArray<readonly [number, number]> | null, cloudField?: ReadonlyArray<ReplayCloudFieldSample> | null,
  cloudVariants?: readonly string[] | null,
): ReplayDaylightClock {
  const session = SESSIONS[sessionType ?? ''] ?? 'race';
  const known = sessionType !== undefined && sessionType in SESSIONS && typeof raceStartMinute === 'number';
  const clock: ReplayDaylightClock = { session, startMinute: known ? raceStartMinute - (session === 'qualify' ? QUALIFYING_LEAD_MIN : 0) : null, sessionTimeSec };
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
