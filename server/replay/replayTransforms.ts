import {
  DetailedSession,
  DriverData,
  LapData,
  ReplayLapSummary,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
} from '../core/types.js';
import { downsampleReplayTrajectory } from './replayParser.js';
import { enrichTrajectoryWithTrackGeometry } from '../tracks/serverTrackSync.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';

export function cloneTrajectoryPoint(point: ReplayTrajectoryPoint): ReplayTrajectoryPoint {
  return { ...point };
}

export function cloneTrajectoryLap(lap: ReplayLapSummary): ReplayLapSummary {
  return { ...lap };
}

export function cloneReplayTrajectory(trajectory: ReplayTrajectoryData): ReplayTrajectoryData {
  const cloned: ReplayTrajectoryData = {
    ...trajectory,
    points: trajectory.points ? trajectory.points.map(cloneTrajectoryPoint) : [],
    laps: trajectory.laps ? trajectory.laps.map(cloneTrajectoryLap) : undefined,
    sectors: trajectory.sectors ? { ...trajectory.sectors } : undefined,
    bounds: trajectory.bounds ? { ...trajectory.bounds } : { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
    validation: trajectory.validation
      ? {
          ...trajectory.validation,
          officialLaps: Array.isArray(trajectory.validation.officialLaps)
            ? trajectory.validation.officialLaps.map(lap => ({ ...lap }))
            : [],
        }
      : undefined,
    allLapsData: Array.isArray(trajectory.allLapsData)
      ? trajectory.allLapsData.map(cloneReplayTrajectory)
      : undefined,
  };

  return cloned;
}

export function downsampleTrajectoryResponse(
  trajectory: ReplayTrajectoryData,
  maxPoints: number | undefined
): ReplayTrajectoryData {
  const copy = cloneReplayTrajectory(trajectory);
  return downsampleReplayTrajectory(copy, maxPoints);
}

export function enrichTrajectoryGeometryResponse(
  trajectory: ReplayTrajectoryData,
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  sceneDesc?: string | null,
  trackLengthMeters?: number | null
): ReplayTrajectoryData {
  const copy = cloneReplayTrajectory(trajectory);
  return enrichTrajectoryWithTrackGeometry(
    copy,
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
  }));

  const clonedLaps = trajectory.laps
    ? trajectory.laps.map((lap): ReplayLapSummary => {
        const match = officialLaps.find(official => official.lapNumber === lap.lapNumber);
        if (match && typeof match.lapTimeSec === 'number' && match.lapTimeSec > 0) {
          return {
            ...lap,
            validatedTimeSec: Number(match.lapTimeSec.toFixed(3)),
            validatedS1Sec: typeof match.s1Sec === 'number' ? Number(match.s1Sec.toFixed(3)) : null,
            validatedS2Sec: typeof match.s2Sec === 'number' ? Number(match.s2Sec.toFixed(3)) : null,
            validatedS3Sec: typeof match.s3Sec === 'number' ? Number(match.s3Sec.toFixed(3)) : null,
            timeDiffSec: Number((lap.lapTimeSec - match.lapTimeSec).toFixed(3)),
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
