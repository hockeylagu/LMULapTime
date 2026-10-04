import {
  DetailedSession,
  DriverData,
  LapData,
  ReplayLapSummary,
  ReplayTrajectoryData,
} from '../../core/types.js';
import { downsampleReplayTrajectory } from './replayParser.js';
import { enrichTrajectoryWithTrackGeometry } from '../../tracks/serverTrackSync.js';
import { getDisplayTrackName } from '../../../shared/domain/formatters.js';

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
  matchedSession?: DetailedSession,
  matchedDriver?: DriverData
): ReplayTrajectoryData {
  if (!matchedSession || !matchedDriver?.laps?.length) {
    return trajectory;
  }

  const officialLaps = matchedDriver.laps.map((lap: LapData) => ({
    lapNumber: lap.lapNum,
    lapTimeSec: lap.lapTime,
    s1Sec: lap.s1,
    s2Sec: lap.s2,
    s3Sec: lap.s3,
    isValid: lap.isValid,
    isPitStop: lap.isPitStop,
    isOutLap: lap.isOutLap,
    nonRepresentativeReason: lap.nonRepresentativeReason,
  }));

  const clonedLaps = trajectory.laps
    ? trajectory.laps.map((lap): ReplayLapSummary => {
        const match = officialLaps.find(official => official.lapNumber === lap.lapNumber);
        if (match) {
          return {
            ...lap,
            isValid: match.isValid,
            isPitStop: Boolean(match.isPitStop),
            isOutlap: Boolean(match.isOutLap),
            isBest: match.isPitStop || match.isOutLap || !match.isValid ? false : lap.isBest,
            nonRepresentativeReason: match.nonRepresentativeReason,
            ...(typeof match.lapTimeSec === 'number' && match.lapTimeSec > 0 ? {
              validatedTimeSec: Number(match.lapTimeSec.toFixed(3)),
              validatedS1Sec: typeof match.s1Sec === 'number' ? Number(match.s1Sec.toFixed(3)) : null,
              validatedS2Sec: typeof match.s2Sec === 'number' ? Number(match.s2Sec.toFixed(3)) : null,
              validatedS3Sec: typeof match.s3Sec === 'number' ? Number(match.s3Sec.toFixed(3)) : null,
              timeDiffSec: Number((lap.lapTimeSec - match.lapTimeSec).toFixed(3)),
            } : {}),
          };
        }
        return { ...lap };
      })
    : undefined;

  return {
    ...trajectory,
    laps: clonedLaps,
    validation: {
      matchedSessionId: matchedSession.id,
      sessionType: matchedSession.sessionType,
      trackName: getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse),
      driverName: matchedDriver.driverName || matchedDriver.name,
      totalSessionLaps: matchedSession.totalLapsCount || officialLaps.length,
      officialBestLapTime: matchedDriver.bestLapTime,
      officialLaps,
    },
  };
}
