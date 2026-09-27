import { describe, it, expect } from 'vitest';
import {
  comparisonConfidence,
  describeCornerEvidence,
  rankDebriefCorners,
} from '../../src/utils/sessionDebrief.js';
import type { CornerSegmentComparison, LapSegmentComparison } from '../../src/utils/cornerAnalysis.js';
import type { CornerConsistencyStat } from '../../src/utils/cornerConsistency.js';
import type { ReplayTrajectoryData } from '../../shared/types/index.js';

function corner(cornerNumber: number, primaryTimeSec: number, timeDeltaSec: number, extra: Partial<CornerSegmentComparison> = {}): CornerSegmentComparison {
  return {
    type: 'corner',
    segmentIndex: cornerNumber,
    cornerNumber,
    entryDistM: cornerNumber * 1000,
    exitDistM: cornerNumber * 1000 + 200,
    minDistM: cornerNumber * 1000 + 100,
    lengthM: 200,
    primaryTimeSec,
    timeDeltaSec,
    primaryEntrySpeedKmh: 300,
    baselineEntrySpeedKmh: 300,
    entrySpeedDeltaKmh: 0,
    primaryMinSpeedKmh: 100,
    baselineMinSpeedKmh: 100,
    minSpeedDeltaKmh: 0,
    primaryExitSpeedKmh: 200,
    baselineExitSpeedKmh: 200,
    exitSpeedDeltaKmh: 0,
    primaryBrakingDistM: null,
    baselineBrakingDistM: null,
    brakingPointDeltaM: null,
    primaryThrottleOnDistM: null,
    baselineThrottleOnDistM: null,
    throttleOnDeltaM: null,
    ...extra,
  };
}

/** Consistency stat timing each of the session's laps through a corner. */
function lapTimes(cornerNumber: number, times: number[]): CornerConsistencyStat {
  const samples = times.map((value, i) => ({ lapNumber: i + 2, value }));
  return {
    cornerNumber,
    lapsSampled: samples.length,
    minDistM: 0,
    time: { count: samples.length, min: 0, max: 0, avg: 0, stdDev: 0, consistencyPct: 0, samples },
    brakingDistM: null,
    throttleOnDistM: null,
    entrySpeedKmh: null,
    apexSpeedKmh: null,
    exitSpeedKmh: null,
  } as CornerConsistencyStat;
}

describe('rankDebriefCorners', () => {
  it('ranks a corner lost on every lap above a bigger loss that happened once', () => {
    // T1: 0.50 s lost on the analysed lap, but only 1 of 4 laps is slower than the reference there.
    // T5: 0.30 s lost, and every lap is slower than the reference there.
    const segments: LapSegmentComparison[] = [corner(1, 12.5, 0.5), corner(5, 28.8, 0.3)];
    const stats = [lapTimes(1, [12.5, 11.95, 11.99, 12.0]), lapTimes(5, [28.8, 28.9, 28.75, 28.85])];

    const ranked = rankDebriefCorners(segments, stats, 1);

    expect(ranked.map(c => c.cornerNumber)).toEqual([5, 1]);
    expect(ranked[0]).toMatchObject({ lapsLosing: 4, lapsSampled: 4, repeatability: 1, priority: 0.3 });
    expect(ranked[1]).toMatchObject({ lapsLosing: 1, lapsSampled: 4, repeatability: 0.25, priority: 0.125 });
  });

  it('leaves out corners that cost less than 0.03 s, or gained time, and keeps the top three', () => {
    const segments = [corner(1, 10, 0.02), corner(2, 10, -0.2), corner(3, 10, 0.4), corner(4, 10, 0.3), corner(6, 10, 0.2), corner(7, 10, 0.1)];

    const ranked = rankDebriefCorners(segments, null, 1);

    expect(ranked.map(c => c.cornerNumber)).toEqual([3, 4, 6]);
  });

  it('uses the analysed lap alone when the session laps were not timed', () => {
    const [only] = rankDebriefCorners([corner(5, 28.8, 0.766)], null, 0.8);

    expect(only).toMatchObject({ lapsLosing: null, lapsSampled: null, repeatability: 1, confidence: 0.8 });
    expect(only.priority).toBeCloseTo(0.6128, 4);
  });

  it('names the corner phase that lost the most time', () => {
    const [ranked] = rankDebriefCorners([
      corner(1, 12, 0.4, {
        phaseTiming: {
          entry: { startDistM: 0, endDistM: 50, timeDeltaSec: 0.05 },
          rotation: { startDistM: 50, endDistM: 100, timeDeltaSec: 0.1 },
          exit: { startDistM: 100, endDistM: 200, timeDeltaSec: 0.25 },
        },
      }),
    ], null, 1);

    expect(ranked.worstPhase).toBe('exit');
  });
});

describe('describeCornerEvidence', () => {
  it('quotes braking, apex, throttle and exit differences in the order they happen', () => {
    // Daytona T5 against a faster Peugeot: brake 28 m earlier, 12 km/h slower at the apex.
    const evidence = describeCornerEvidence(corner(5, 28.8, 0.77, {
      brakingPointDeltaM: -28,
      minSpeedDeltaKmh: -12,
      throttleOnDeltaM: 38,
      exitSpeedDeltaKmh: -2,
    }));

    expect(evidence).toEqual([
      'Brakes 28 m earlier',
      '12 km/h slower at the apex',
      'Full throttle 38 m later',
      '2 km/h slower on exit',
    ]);
  });

  it('leaves out differences too small to act on', () => {
    expect(describeCornerEvidence(corner(1, 10, 0.1, { brakingPointDeltaM: 3, minSpeedDeltaKmh: 1, throttleOnDeltaM: -4 }))).toEqual([]);
  });
});

describe('comparisonConfidence', () => {
  const lap = (source: 'duckdb' | 'vcr', stationSource: 'track' | 'odometer') => ({ source, stationSource }) as ReplayTrajectoryData;

  it('trusts two 100 Hz laps matched on the track map fully', () => {
    expect(comparisonConfidence(lap('duckdb', 'track'), lap('duckdb', 'track'))).toBe(1);
  });

  it('trusts a replay-only reference lap less, and laps matched by driven distance least', () => {
    expect(comparisonConfidence(lap('duckdb', 'track'), lap('vcr', 'track'))).toBe(0.8);
    expect(comparisonConfidence(lap('duckdb', 'odometer'), lap('vcr', 'track'))).toBe(0.4);
  });
});
