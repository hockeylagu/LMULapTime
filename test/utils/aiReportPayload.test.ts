import { describe, expect, it } from 'vitest';
import { buildAiLapEvidence } from '../../src/utils/aiReportPayload.js';
import { ReplayTrajectoryData } from '../../server/core/types.js';
import type { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';
import type { DebriefCorner } from '../../src/utils/sessionDebrief.js';

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

  it('sends the app-ranked corners first, with their measurements, even when their loss is small', () => {
    const corner = (cornerNumber: number, timeDeltaSec: number) => ({
      type: 'corner', segmentIndex: cornerNumber, cornerNumber, entryDistM: 0, minDistM: 5, exitDistM: 10, lengthM: 10,
      primaryTimeSec: 1, timeDeltaSec, primaryEntrySpeedKmh: 100, baselineEntrySpeedKmh: 100, entrySpeedDeltaKmh: 0,
      primaryMinSpeedKmh: 90, baselineMinSpeedKmh: 90, minSpeedDeltaKmh: 0, primaryExitSpeedKmh: 100, baselineExitSpeedKmh: 100,
      exitSpeedDeltaKmh: 0, primaryBrakingDistM: null, baselineBrakingDistM: null, brakingPointDeltaM: null,
      primaryThrottleOnDistM: null, baselineThrottleOnDistM: null, throttleOnDeltaM: null,
    }) as CornerSegmentComparison;
    // Nine corners losing more than corner 1; the app still ranks corner 1 first (it is lost every lap).
    const segments = [corner(1, 0.06), ...Array.from({ length: 9 }, (_, i) => corner(i + 2, 0.2 + i / 10))];
    const ranked = [{ cornerNumber: 1, timeLossSec: 0.06, lapsLosing: 22, lapsSampled: 22, confidence: 1 }] as DebriefCorner[];
    const baseline = { ...trajectory, replayName: 'baseline.Vcr' };

    const evidence = buildAiLapEvidence({
      trajectory, baselineTrajectory: baseline, baselineLapSummary: baseline.laps![0], segments, priorities: ranked,
    });

    expect(evidence.priorities).toEqual([{ rank: 1, cornerNumber: 1, timeLossSec: 0.06, lapsLosing: 22, lapsSampled: 22, confidence: 1 }]);
    expect(evidence.segments).toHaveLength(8);
    expect(evidence.segments[0].cornerNumber).toBe(1);
  });

  it('sends no priorities without a comparison lap', () => {
    const evidence = buildAiLapEvidence({ trajectory, segments: [], priorities: [{ cornerNumber: 1 } as DebriefCorner] });

    expect(evidence.priorities).toBeUndefined();
  });
});
