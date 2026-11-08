import type { ReplayDaylightClock } from '../../types/replay.js';
import type { ScenerySessionId } from '../../types/scenes/scenery.js';

const SESSIONS: Record<string, ScenerySessionId> = { Practice: 'practice1', Qualifying: 'qualify', Race: 'race' };
/** Qualifying starts this long before the event's race start (docs/VCR_FORMAT.md §2.2). Online practice starts at it. */
const QUALIFYING_LEAD_MIN = 15;

/**
 * The in-game clock of a replay moment: the session start from the replay's race start and session type, and the session
 * time. Without a race start (offline, or a replay cached before it was read) the start is null and the track's default
 * time for the session applies. The cloud cover is the replay's weather sample nearest the lap start.
 */
export function replayDaylightClock(
  sessionType: string | undefined, raceStartMinute: number | null | undefined, sessionTimeSec: number,
  cloudCover?: ReadonlyArray<readonly [number, number]> | null,
): ReplayDaylightClock {
  const session = SESSIONS[sessionType ?? ''] ?? 'race';
  const known = sessionType !== undefined && sessionType in SESSIONS && typeof raceStartMinute === 'number';
  const clock: ReplayDaylightClock = { session, startMinute: known ? raceStartMinute - (session === 'qualify' ? QUALIFYING_LEAD_MIN : 0) : null, sessionTimeSec };
  // The weather sample nearest the lap start.
  let nearest: readonly [number, number] | undefined;
  for (const sample of cloudCover ?? []) if (!nearest || Math.abs(sample[0] - sessionTimeSec) < Math.abs(nearest[0] - sessionTimeSec)) nearest = sample;
  if (nearest) clock.cloudCover = nearest[1];
  return clock;
}
