import { AiLapEvidence, ReplayLapSummary, ReplayTrajectoryData } from '../../server/types.js';
import { LapSegmentComparison } from './cornerAnalysis.js';

const round = (value: number): number => Number(value.toFixed(3));
const optionalRound = (value: number | null | undefined): number | undefined => value == null ? undefined : round(value);

export interface BuildAiLapEvidenceOptions {
  trajectory: ReplayTrajectoryData;
  baselineTrajectory?: ReplayTrajectoryData | null;
  currentLapSummary?: ReplayLapSummary | null;
  baselineLapSummary?: ReplayLapSummary | null;
  segments: LapSegmentComparison[];
  carClass?: string;
  carModel?: string;
}

export function buildAiLapEvidence({
  trajectory,
  baselineTrajectory,
  currentLapSummary,
  baselineLapSummary,
  segments,
  carClass,
  carModel,
}: BuildAiLapEvidenceOptions): AiLapEvidence {
  const lap = currentLapSummary || trajectory.laps?.find(item => item.lapNumber === trajectory.currentLap) || trajectory.laps?.[0];
  if (!lap) throw new Error('No lap summary is available for AI analysis.');

  const notable = segments
    .filter(segment => segment.type === 'corner' ? Math.abs(segment.timeDeltaSec) > 0.05 : Math.abs(segment.topSpeedDeltaKmh) > 1)
    .sort((a, b) => Math.abs(b.timeDeltaSec) - Math.abs(a.timeDeltaSec))
    .slice(0, 8)
    .map(segment => segment.type === 'corner'
      ? {
          segmentIndex: segment.segmentIndex,
          type: 'corner' as const,
          cornerNumber: segment.cornerNumber,
          segmentLengthM: round(segment.lengthM),
          primaryTimeSec: round(segment.primaryTimeSec),
          baselineTimeSec: round(segment.primaryTimeSec - segment.timeDeltaSec),
          timeDeltaSec: round(segment.timeDeltaSec),
          entrySpeedDeltaKmh: round(segment.entrySpeedDeltaKmh),
          primaryEntrySpeedKmh: round(segment.primaryEntrySpeedKmh),
          baselineEntrySpeedKmh: round(segment.baselineEntrySpeedKmh),
          minSpeedDeltaKmh: round(segment.minSpeedDeltaKmh),
          primaryMinSpeedKmh: round(segment.primaryMinSpeedKmh),
          baselineMinSpeedKmh: round(segment.baselineMinSpeedKmh),
          exitSpeedDeltaKmh: round(segment.exitSpeedDeltaKmh),
          primaryExitSpeedKmh: round(segment.primaryExitSpeedKmh),
          baselineExitSpeedKmh: round(segment.baselineExitSpeedKmh),
          brakingPointDeltaM: optionalRound(segment.brakingPointDeltaM),
          primaryBrakingOffsetM: optionalRound(segment.primaryBrakingDistM === null ? null : segment.primaryBrakingDistM - segment.entryDistM),
          baselineBrakingOffsetM: optionalRound(segment.baselineBrakingDistM === null ? null : segment.baselineBrakingDistM - segment.entryDistM),
          throttleOnDeltaM: optionalRound(segment.throttleOnDeltaM),
          primaryThrottleOnOffsetM: optionalRound(segment.primaryThrottleOnDistM === null ? null : segment.primaryThrottleOnDistM - segment.minDistM),
          baselineThrottleOnOffsetM: optionalRound(segment.baselineThrottleOnDistM === null ? null : segment.baselineThrottleOnDistM - segment.minDistM),
        }
      : {
          segmentIndex: segment.segmentIndex,
          type: 'straight' as const,
          segmentLengthM: round(segment.lengthM),
          primaryTimeSec: round(segment.primaryTimeSec),
          baselineTimeSec: round(segment.primaryTimeSec - segment.timeDeltaSec),
          timeDeltaSec: round(segment.timeDeltaSec),
          topSpeedDeltaKmh: round(segment.topSpeedDeltaKmh),
          primaryTopSpeedKmh: round(segment.primaryTopSpeedKmh),
          baselineTopSpeedKmh: round(segment.baselineTopSpeedKmh),
        });

  const evidence: AiLapEvidence = {
    lap: {
      replayName: trajectory.replayName,
      lapNumber: lap.lapNumber,
      driverName: trajectory.driverName,
      carClass,
      carModel,
      lapTimeSec: round(lap.lapTimeSec),
      s1Sec: optionalRound(lap.s1Sec),
      s2Sec: optionalRound(lap.s2Sec),
      s3Sec: optionalRound(lap.s3Sec),
      isValid: lap.isValid,
      isOutlap: lap.isOutlap,
    },
    segments: notable,
  };

  if (baselineTrajectory && baselineLapSummary) {
    evidence.baseline = {
      replayName: baselineTrajectory.replayName,
      lapNumber: baselineLapSummary.lapNumber,
      driverName: baselineTrajectory.driverName,
      lapTimeSec: round(baselineLapSummary.lapTimeSec),
      s1Sec: optionalRound(baselineLapSummary.s1Sec),
      s2Sec: optionalRound(baselineLapSummary.s2Sec),
      s3Sec: optionalRound(baselineLapSummary.s3Sec),
    };
  }

  return evidence;
}
