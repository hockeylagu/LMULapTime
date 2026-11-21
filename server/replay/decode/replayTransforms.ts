import {
  ReplayLapSummary,
  ReplayTrajectoryData,
} from '../../../shared/types/index.js';
import type { ReplaySessionContext, ReplayContextDriver, ReplayTimingLap } from '../replayServiceTypes.js';
import { downsampleReplayTrajectory } from './replayParser.js';
import { enrichTrajectoryWithTrackGeometry } from '../../tracks/serverTrackSync.js';

export function downsampleTrajectoryResponse(
  trajectory: ReplayTrajectoryData,
  maxPoints: number | undefined
): ReplayTrajectoryData {
  return downsampleReplayTrajectory({ ...trajectory }, maxPoints);
}

export function enrichTrajectoryGeometryResponse(
  trajectory: ReplayTrajectoryData,
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  sceneDesc?: string | null,
  trackLengthMeters?: number | null
): ReplayTrajectoryData {
  return enrichTrajectoryWithTrackGeometry(
    { ...trajectory },
    venue,
    course,
    replayName,
    sceneDesc,
    trackLengthMeters
  );
}

export function applyPureOfficialLapValidation(
  trajectory: ReplayTrajectoryData,
  matchedSession?: ReplaySessionContext,
  matchedDriver?: ReplayContextDriver
): ReplayTrajectoryData {
  if (!matchedSession || !matchedDriver?.laps?.length) {
    return trajectory;
  }

  const officialLaps: ReplayTimingLap[] = matchedDriver.laps;

  const clonedLaps = trajectory.laps
    ? trajectory.laps.map((lap): ReplayLapSummary => {
        const match = officialLaps.find(official => official.lapNumber === lap.lapNumber);
        if (match) {
          return {
            ...lap,
            isValid: match.isValid,
            isPitStop: Boolean(match.isPitStop),
            isOutLap: Boolean(match.isOutLap),
            isBest: match.isPitStop || match.isOutLap || !match.isValid ? false : lap.isBest,
            nonRepresentativeReason: match.nonRepresentativeReason,
            ...(typeof match.lapTime === 'number' && match.lapTime > 0 ? { validatedTimeSec: Number(match.lapTime.toFixed(3)) } : {}),
          };
        }
        return { ...lap };
      })
    : undefined;

  return { ...trajectory, laps: clonedLaps };
}
