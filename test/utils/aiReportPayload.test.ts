import { describe, expect, it } from 'vitest';
import { buildAiLapEvidence } from '../../src/utils/aiReportPayload.js';
import { ReplayTrajectoryData } from '../../server/core/types.js';

const trajectory: ReplayTrajectoryData = {
  replayName: 'primary.Vcr',
  driverName: 'Player',
  pointsCount: 0,
  currentLap: 5,
  bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1 },
  points: [],
  laps: [{ lapNumber: 5, lapTimeSec: 100, s1Sec: 33, s2Sec: 34, s3Sec: 33, isValid: true }],
};

describe('buildAiLapEvidence', () => {
  it('selects and rounds the eight most meaningful segments', () => {
    const segments = Array.from({ length: 10 }, (_, index) => ({
      type: 'corner' as const,
      segmentIndex: index,
      cornerNumber: index + 1,
      entryDistM: 0,
      minDistM: 5,
      exitDistM: 10,
      lengthM: 10,
      primaryTimeSec: 1,
      timeDeltaSec: (index + 1) / 10,
      primaryEntrySpeedKmh: 100,
      baselineEntrySpeedKmh: 100,
      entrySpeedDeltaKmh: index + 0.1234,
      primaryMinSpeedKmh: 90,
      baselineMinSpeedKmh: 90,
      minSpeedDeltaKmh: -index,
      primaryExitSpeedKmh: 100,
      baselineExitSpeedKmh: 100,
      exitSpeedDeltaKmh: index,
      primaryBrakingDistM: 1,
      baselineBrakingDistM: 2,
      brakingPointDeltaM: -1,
      primaryThrottleOnDistM: 5,
      baselineThrottleOnDistM: 6,
      throttleOnDeltaM: -1,
      primaryInitialThrottleDistM: 4,
      baselineInitialThrottleDistM: 5,
      initialThrottleDeltaM: -1,
      phaseTiming: {
        entry: { startDistM: 0, endDistM: 2, timeDeltaSec: 0.01234 },
        rotation: { startDistM: 2, endDistM: 5, timeDeltaSec: 0.02345 },
        exit: { startDistM: 5, endDistM: 10, timeDeltaSec: 0.03456 },
      },
    }));
    const evidence = buildAiLapEvidence({ trajectory, segments });
    expect(evidence.segments).toHaveLength(8);
    expect(evidence.segments[0].cornerNumber).toBe(10);
    expect(evidence.segments[0].entrySpeedDeltaKmh).toBe(9.123);
    expect(evidence.segments[0].primaryInitialThrottleOffsetM).toBe(-1);
    expect(evidence.segments[0].baselineInitialThrottleOffsetM).toBe(0);
    expect(evidence.segments[0].initialThrottleDeltaM).toBe(-1);
    expect(evidence.segments[0].phaseTiming).toEqual({
      entry: { startDistM: 0, endDistM: 2, timeDeltaSec: 0.012 },
      rotation: { startDistM: 2, endDistM: 5, timeDeltaSec: 0.023 },
      exit: { startDistM: 5, endDistM: 10, timeDeltaSec: 0.035 },
    });
    expect(evidence.lap.s1Sec).toBe(33);
  });

  it('keeps corner observations for self-analysis without a baseline', () => {
    const evidence = buildAiLapEvidence({
      trajectory,
      segments: [{
        type: 'corner',
        segmentIndex: 0,
        cornerNumber: 1,
        entryDistM: 10,
        minDistM: 30,
        exitDistM: 50,
        lengthM: 40,
        primaryTimeSec: 2,
        timeDeltaSec: 0,
        primaryEntrySpeedKmh: 150,
        baselineEntrySpeedKmh: 150,
        entrySpeedDeltaKmh: 0,
        primaryMinSpeedKmh: 80,
        baselineMinSpeedKmh: 80,
        minSpeedDeltaKmh: 0,
        primaryExitSpeedKmh: 130,
        baselineExitSpeedKmh: 130,
        exitSpeedDeltaKmh: 0,
        primaryBrakingDistM: 12,
        baselineBrakingDistM: 12,
        brakingPointDeltaM: 0,
        primaryThrottleOnDistM: 35,
        baselineThrottleOnDistM: 35,
        throttleOnDeltaM: 0,
      }],
    });

    expect(evidence.segments).toHaveLength(1);
    expect(evidence.segments[0].cornerNumber).toBe(1);
  });
});
