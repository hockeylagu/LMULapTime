import type { ReplayDriverEntry, ReplayMetadata } from '../../../../../shared/types/index.js';
import { resolveDriverCarClass } from '../../../../../shared/domain/vehicleMapping.js';

/**
 * The track layout and the inspected driver's car class of `/api/compare/laps`: laps are only
 * compared within one layout and one car class. Null when the replay names no track.
 */
export function replayCompareScope(metadata: ReplayMetadata, driver: ReplayDriverEntry | undefined): URLSearchParams | null {
  const track = metadata.trackVenue || metadata.displayTrack || metadata.trackCourse || metadata.trackName;
  if (!track) return null;
  const query = new URLSearchParams({ track });
  if (metadata.trackVenue) { query.set('trackVenue', metadata.trackVenue); query.set('trackCourse', metadata.trackCourse ?? ''); }
  const carClass = resolveDriverCarClass(driver);
  if (carClass) query.set('carClass', carClass);
  return query;
}
