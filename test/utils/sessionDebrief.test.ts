import { describe, it, expect } from 'vitest';
import {
  comparisonConfidence,
  describeCornerEvidence,
  passTrafficSpell,
  rankDebriefCorners,
  rankTurnCorners,
} from '../../src/utils/sessionDebrief.js';
import type { CornerSegmentComparison, LapSegmentComparison } from '../../src/utils/cornerAnalysis/types.js';
import type { CornerConsistencyStat } from '../../src/utils/cornerConsistency.js';
import type { ReplayTrajectoryData } from '../../shared/types/index.js';
import type { CornerPass, CornerTurn } from '../../shared/types/corners/cornerPasses.js';

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

/** An official turn's stat timing each of the session's laps (2, 3, ...) through it, placed on the corner's slowest point. */
function lapTimes(cornerNumber: number, times: number[]): CornerConsistencyStat {
  const samples = times.map((value, i) => ({ lapNumber: i + 2, value }));
  return {
    turnId: cornerNumber,
    label: `T${cornerNumber}`,
    title: '',
    apexM: 0,
    lapDistM: cornerNumber * 1000 + 100,
    cornerNumber,
    lapsSampled: samples.length,
    turnInDistM: null,
    time: { count: samples.length, min: 0, max: 0, avg: 0, stdDev: 0, consistencyPct: 0, samples },
    brakingDistM: null,
    throttleOnDistM: null,
    entrySpeedKmh: null,
    apexSpeedKmh: null,
    exitSpeedKmh: null,
  };
}

describe('rankDebriefCorners', () => {
  it('ranks a corner lost on every lap above a bigger loss that happened once', () => {
    // T1: 0.50 s lost on the analysed lap, but only 1 of 4 laps is slower than the reference there.
    // T5: 0.30 s lost, and every lap is slower than the reference there.
    const segments: LapSegmentComparison[] = [corner(1, 12.5, 0.5), corner(5, 28.8, 0.3)];
    const stats = [lapTimes(1, [12.5, 11.95, 11.99, 12.0]), lapTimes(5, [28.8, 28.9, 28.75, 28.85])];

    const ranked = rankDebriefCorners(segments, stats, 1, undefined, { lapNumber: 2 });

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

  it('describes the corner as the technique lap drives it, and says what it costs against that lap', () => {
    const technique = [corner(1, 12.5, 0.9, { brakingPointDeltaM: -28 })];

    const [ranked] = rankDebriefCorners([corner(1, 12.5, 0.3)], null, 1, undefined, { technique });

    expect(ranked).toMatchObject({ timeLossSec: 0.3, techniqueLossSec: 0.9, evidence: ['Brake 28 m later'] });
    expect(rankDebriefCorners([corner(1, 12.5, 0.3)], null, 1)[0].techniqueLossSec).toBeNull();
  });

});

function turnPass(lapNumber: number, segment: number, sec: number, extra: Partial<CornerPass> = {}): CornerPass {
  const entrySec = lapNumber * 100 + segment * 10;
  return {
    slot: 1, lapNumber, segment, entrySec, minSpeedSec: entrySec + sec / 2, exitSec: entrySec + sec,
    entrySpeedKmh: 250, minSpeedKmh: 100, exitSpeedKmh: 180, minSpeedM: 500, brakeM: 400, turnInM: 450, throttleM: 520,
    aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null, ...extra,
  };
}

const TURNS: CornerTurn[] = [
  { id: 1, label: 'T1', title: 'Turn 1', apexM: 500, startM: 300, endM: 700 },
  { id: 2, label: '', title: 'Unnamed', apexM: 4100, startM: 3900, endM: 4300 },
];

describe('rankTurnCorners', () => {
  const noTraffic = () => null;

  it('ranks each official turn by the analysed pass against the reference pass, and how often the session loses there', () => {
    const passes = [turnPass(5, 1, 4.5), turnPass(6, 1, 4.1), turnPass(7, 1, 4.4), turnPass(5, 2, 6.3), turnPass(6, 2, 6.3)];
    const ranked = rankTurnCorners({
      turns: TURNS, passes, lapNumber: 5, repeatLaps: new Set([5, 6, 7]),
      reference: [turnPass(3, 1, 4.2), turnPass(3, 2, 6.0)], technique: null, trafficOf: noTraffic,
      cornerNumberAt: turn => (turn.id === 1 ? 4 : null),
    });

    expect(ranked.map(c => c.label)).toEqual(['km 4.1', 'T1']);
    expect(ranked[0]).toMatchObject({ label: 'km 4.1', cornerNumber: null, timeLossSec: 0.3, lapsLosing: 2, lapsSampled: 2, repeatability: 1 });
    expect(ranked[1]).toMatchObject({ label: 'T1', title: 'Turn 1', cornerNumber: 4, timeLossSec: 0.3, lapsLosing: 2, lapsSampled: 3, entryDistM: 300, minDistM: 500 });
    expect(ranked[1].repeatability).toBeCloseTo(2 / 3, 5);
  });

  it('describes the turn as the technique lap drives it, and names the half that lost the most', () => {
    const pass = turnPass(5, 1, 4.6, { minSpeedSec: 512.2, brakeM: 380, turnInM: 440, minSpeedKmh: 92, throttleM: 540 });
    const [ranked] = rankTurnCorners({
      turns: TURNS, passes: [pass], lapNumber: 5, repeatLaps: new Set([5]),
      reference: [turnPass(3, 1, 4.3)], technique: [turnPass(2, 1, 4.0, { brakeM: 410, turnInM: 455, minSpeedKmh: 104, throttleM: 515 })],
      trafficOf: noTraffic,
    });

    expect(ranked).toMatchObject({ timeLossSec: 0.3, techniqueLossSec: 0.6, lapsSampled: null, repeatability: 1, worstPhase: 'exit' });
    expect(ranked.evidence).toEqual(['Brake 30 m later', 'Turn in 15 m later', 'Carry 12 km/h more to the apex', 'Full throttle 25 m earlier']);
  });

  it('leaves passes with a car close in front out of repeatability and trusts an analysed pass in traffic less', () => {
    const passes = [turnPass(5, 1, 4.5), turnPass(6, 1, 4.6), turnPass(7, 1, 4.1), turnPass(8, 1, 4.5)];
    const spell = { driverName: 'Rui Paiva', kind: 'multiclass' as const, direction: 'ahead' as const, startSec: 0, endSec: 1, startStationM: 0, endStationM: 1, closestGapSec: 0.4 };
    const [ranked] = rankTurnCorners({
      turns: TURNS, passes, lapNumber: 5, repeatLaps: new Set([5, 6, 7, 8]),
      reference: [turnPass(3, 1, 4.2)], technique: null,
      trafficOf: pass => (pass.lapNumber === 5 || pass.lapNumber === 6 ? spell : null),
    });

    expect(ranked).toMatchObject({ lapsInTraffic: 2, lapsSampled: 2, lapsLosing: 1, repeatability: 0.5, confidence: 0.5 });
    expect(ranked.traffic?.driverName).toBe('Rui Paiva');
    expect(ranked.priority).toBeCloseTo(0.3 * 0.5 * 0.5, 4);
  });

  it('leaves out turns lost by less than 0.03 s, and turns without a reference pass', () => {
    const ranked = rankTurnCorners({
      turns: TURNS, passes: [turnPass(5, 1, 4.22), turnPass(5, 2, 7)], lapNumber: 5, repeatLaps: new Set([5]),
      reference: [turnPass(3, 1, 4.2)], technique: null, trafficOf: noTraffic,
    });
    expect(ranked).toEqual([]);
  });
});

describe('passTrafficSpell', () => {
  const cars = [
    { slot: 1, name: 'Me', carClass: 'Hyper' },
    { slot: 2, name: 'Rival', carClass: 'Hyper' },
    { slot: 3, name: 'Slow GT3', carClass: 'GT3' },
  ];
  const ahead = (aheadSlot: number, aheadGapSec: number) => turnPass(5, 1, 4, { aheadSlot, aheadGapSec });

  it('is null without a car within a second in front', () => {
    expect(passTrafficSpell(turnPass(5, 1, 4), TURNS[0], cars, [])).toBeNull();
    expect(passTrafficSpell(ahead(2, 1.4), TURNS[0], cars, [])).toBeNull();
  });

  it('tells a battle, a lapping and being lapped from the other car lap through the same turn', () => {
    const near = (lapNumber: number) => [turnPass(lapNumber, 1, 4, { slot: 2, entrySec: 510.5 }), turnPass(9, 1, 4, { slot: 2, entrySec: 900 })];
    expect(passTrafficSpell(ahead(2, 0.5), TURNS[0], cars, near(5))).toMatchObject({
      driverName: 'Rival', kind: 'battle', direction: 'ahead', closestGapSec: 0.5, startStationM: 300, endStationM: 700,
    });
    expect(passTrafficSpell(ahead(2, 0.5), TURNS[0], cars, near(4))?.kind).toBe('lapping');
    expect(passTrafficSpell(ahead(2, 0.5), TURNS[0], cars, near(6))?.kind).toBe('beingLapped');
  });

  it('calls another class multiclass traffic', () => {
    expect(passTrafficSpell(ahead(3, 0.8), TURNS[0], cars, [])).toMatchObject({ driverName: 'Slow GT3', carClass: 'GT3', kind: 'multiclass' });
  });
});

describe('describeCornerEvidence', () => {
  it('says what to change for braking, apex, throttle and exit, in the order they happen', () => {
    // Daytona T5 against a faster Peugeot: braked 28 m earlier and was 12 km/h slower at the apex.
    const evidence = describeCornerEvidence(corner(5, 28.8, 0.77, {
      brakingPointDeltaM: -28,
      minSpeedDeltaKmh: -12,
      throttleOnDeltaM: 38,
      exitSpeedDeltaKmh: -2,
    }));

    expect(evidence).toEqual([
      'Brake 28 m later',
      'Carry 12 km/h more to the apex',
      'Full throttle 38 m earlier',
      'Exit 2 km/h faster',
    ]);
  });

  it('turns the other way when the driver overdid it', () => {
    expect(describeCornerEvidence(corner(5, 28.8, 0.4, {
      brakingPointDeltaM: 15,
      minSpeedDeltaKmh: 6,
      throttleOnDeltaM: -20,
      exitSpeedDeltaKmh: 4,
    }))).toEqual([
      'Brake 15 m earlier',
      'Carry 6 km/h less to the apex',
      'Full throttle 20 m later',
      'Exit 4 km/h slower',
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
