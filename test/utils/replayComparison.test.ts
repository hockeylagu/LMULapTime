import { describe, it, expect } from 'vitest';
import {
  computeCumulativeDistances,
  interpolatePointAtDistance,
  computeLapComparisons,
  computeLapSegmentComparisons,
  findIndexAtDistance,
  filterCompatibleReplays,
  mapVehicleIdToClass,
} from '../../src/utils/replayComparison';
import { ReplayTrajectoryPoint, ReplaySummary } from '../../server/types';

describe('replayComparison utility', () => {
  const mockPoints: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
    { x: 10, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 5, timeSec: 1 },
    { x: 30, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 2 },
  ];

  describe('computeCumulativeDistances', () => {
    it('calculates cumulative distance along path correctly', () => {
      const dists = computeCumulativeDistances(mockPoints);
      expect(dists).toHaveLength(3);
      expect(dists[0]).toBe(0);
      expect(dists[1]).toBeCloseTo(10);
      expect(dists[2]).toBeCloseTo(30);
    });

    it('filters out teleport anomalies exceeding 60m', () => {
      const teleportPoints: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 10, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 1 },
        { x: 200, y: 0, z: 0, speedKmh: 120, throttle: 80, brake: 0, steerYaw: 0, timeSec: 2 }, // 190m jump
        { x: 205, y: 0, z: 0, speedKmh: 130, throttle: 90, brake: 0, steerYaw: 0, timeSec: 3 },
      ];
      const dists = computeCumulativeDistances(teleportPoints);
      expect(dists[2]).toBe(10); // jump ignored
      expect(dists[3]).toBe(15);
    });
  });

  describe('interpolatePointAtDistance', () => {
    it('interpolates point attributes smoothly between distance nodes', () => {
      const cumDists = [0, 10, 30];
      // Target at 5m (halfway between node 0 and node 1)
      const pt = interpolatePointAtDistance(mockPoints, cumDists, 5);
      expect(pt.x).toBeCloseTo(5);
      expect(pt.speedKmh).toBe(110);
      expect(pt.throttle).toBe(65);
      expect(pt.timeSec).toBeCloseTo(0.5);
    });

    it('clamps gracefully if distance is out of bounds', () => {
      const cumDists = [0, 10, 30];
      const before = interpolatePointAtDistance(mockPoints, cumDists, -5);
      expect(before.x).toBe(0);

      const after = interpolatePointAtDistance(mockPoints, cumDists, 50);
      expect(after.x).toBe(30);
    });
  });

  describe('computeLapComparisons', () => {
    it('computes time deltas and telemetry deltas normalized across 0-100% distance', () => {
      const primary: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1 },
        { x: 100, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, steerYaw: 0, timeSec: 2 },
      ];

      const baseline: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 90, throttle: 40, brake: 0, steerYaw: 0, timeSec: 0 },
        { x: 50, y: 0, z: 0, speedKmh: 140, throttle: 90, brake: 0, steerYaw: 0, timeSec: 1.2 },
        { x: 100, y: 0, z: 0, speedKmh: 180, throttle: 90, brake: 0, steerYaw: 0, timeSec: 2.4 },
      ];

      const comparisons = computeLapComparisons(primary, baseline);
      expect(comparisons).toHaveLength(3);

      // Node 0: delta time = 0 - 0 = 0
      expect(comparisons[0].deltaTimeSec).toBe(0);
      expect(comparisons[0].deltaSpeedKmh).toBe(10); // 100 - 90

      // Node 1: delta time = 1.0 - 1.2 = -0.2 (primary is 0.2s faster!)
      expect(comparisons[1].deltaTimeSec).toBeCloseTo(-0.2);
      expect(comparisons[1].deltaSpeedKmh).toBe(10);

      // Node 2: delta time = 2.0 - 2.4 = -0.4s faster
      expect(comparisons[2].deltaTimeSec).toBeCloseTo(-0.4);
      expect(comparisons[2].deltaSpeedKmh).toBe(20);
    });

    it('eliminates boundary glitches at start and end when laps have non-zero session timestamps', () => {
      // Primary lap starts at minute 25 (1500.0s), total lap time is 80.0s
      const primary: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 100, throttle: 50, brake: 0, steerYaw: 0, timeSec: 1500.0 },
        { x: 20, y: 0, z: 0, speedKmh: 150, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1540.0 },
        { x: 40, y: 0, z: 0, speedKmh: 200, throttle: 100, brake: 0, steerYaw: 0, timeSec: 1580.0 },
      ];

      // Baseline lap comes from a different session starting at minute 90 (5400.0s), total lap time is 80.5s
      const baseline: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 95, throttle: 45, brake: 0, steerYaw: 0, timeSec: 5400.0 },
        { x: 20, y: 0, z: 0, speedKmh: 145, throttle: 90, brake: 0, steerYaw: 0, timeSec: 5440.2 },
        { x: 40, y: 0, z: 0, speedKmh: 195, throttle: 90, brake: 0, steerYaw: 0, timeSec: 5480.5 },
      ];

      const comparisons = computeLapComparisons(primary, baseline);
      expect(comparisons).toHaveLength(3);

      // Start line boundary: MUST be exactly 0 (no multi-thousand second glitch!)
      expect(comparisons[0].deltaTimeSec).toBe(0);
      expect(comparisons[0].baseline.timeSec).toBe(0);

      // Mid-lap: primary (40.0s) vs baseline (40.2s) => delta = -0.2s
      expect(comparisons[1].deltaTimeSec).toBeCloseTo(-0.2, 2);
      expect(comparisons[1].baseline.timeSec).toBeCloseTo(40.2, 2);

      // Finish line boundary: 80.0s vs 80.5s => delta = -0.5s (no end-of-lap glitch!)
      expect(comparisons[2].deltaTimeSec).toBeCloseTo(-0.5, 2);
      expect(comparisons[2].baseline.timeSec).toBeCloseTo(80.5, 2);

      // Scale check: All absolute deltas should be within 1.0 second, NOT skewed by session timestamp offsets
      const maxDelta = Math.max(...comparisons.map(c => Math.abs(c.deltaTimeSec)));
      expect(maxDelta).toBeLessThanOrEqual(1.0);
    });

    it('handles single-point and degenerate trajectories gracefully without NaN or infinite deltas', () => {
      const singlePoint: ReplayTrajectoryPoint[] = [
        { x: 0, y: 0, z: 0, speedKmh: 0, throttle: 0, brake: 0, steerYaw: 0, timeSec: 100 },
      ];
      const comps = computeLapComparisons(singlePoint, singlePoint);
      expect(comps).toHaveLength(1);
      expect(comps[0].deltaTimeSec).toBe(0);
      expect(isNaN(comps[0].deltaTimeSec)).toBe(false);
    });
  });

  describe('computeLapSegmentComparisons', () => {
    // Speed trace with genuine turning points at both ends (100->200->minSpeed->200->100),
    // so the boundary "max" points actually register - not a flat plateau the algorithm
    // can't turn around on. Corner window: entry@30m, min@70m, exit@110m; lap ends at 140m.
    function buildLap(minSpeedKmh: number, extraTimeThroughCorner: number): ReplayTrajectoryPoint[] {
      const speeds = [100, 150, 200, 200, 180, 150, minSpeedKmh, minSpeedKmh, 150, 180, 200, 200, 180, 150, 100];
      let t = 0;
      return speeds.map((speedKmh, i) => {
        const distM = i * 10;
        // Corner spans (30, 110]; add the extra delay across just that stretch.
        t += distM > 30 && distM <= 110 ? extraTimeThroughCorner : 0.3;
        return { x: distM, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: t };
      });
    }

    function withBrakeThrottle(points: ReplayTrajectoryPoint[], brakeOnDistM: number, throttleOnDistM: number): ReplayTrajectoryPoint[] {
      return points.map(p => ({
        ...p,
        brake: p.x >= brakeOnDistM && p.x < 70 ? 60 : 0,
        throttle: p.x >= throttleOnDistM ? 100 : 0,
      }));
    }

    it('builds a contiguous straight -> corner -> straight breakdown of the whole lap', () => {
      const baseline = buildLap(100, 0.3);
      const primary = buildLap(90, 0.3);

      const segments = computeLapSegmentComparisons(primary, baseline);

      expect(segments.map(s => s.type)).toEqual(['straight', 'corner', 'straight']);
      expect(segments[0].entryDistM).toBe(0);
      expect(segments[0].exitDistM).toBe(30);
      expect(segments[2].entryDistM).toBe(110);
      expect(segments[2].exitDistM).toBe(140);

      const corner = segments[1];
      if (corner.type !== 'corner') throw new Error('expected corner segment');
      expect(corner.cornerNumber).toBe(1);
      expect(corner.entryDistM).toBe(30);
      expect(corner.minDistM).toBe(70);
      expect(corner.exitDistM).toBe(110);
      expect(corner.baselineEntrySpeedKmh).toBe(200);
      expect(corner.baselineMinSpeedKmh).toBe(100);
      expect(corner.baselineExitSpeedKmh).toBe(200);
      expect(corner.primaryMinSpeedKmh).toBe(90);
      expect(corner.minSpeedDeltaKmh).toBe(-10);
    });

    it('reports a positive (lost time) delta isolated to the corner segment only', () => {
      const baseline = buildLap(100, 0.3);
      const primary = buildLap(100, 0.5); // same speeds, but slower through the corner stretch

      const segments = computeLapSegmentComparisons(primary, baseline);
      const corner = segments.find(s => s.type === 'corner');
      if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

      // 8 steps of 10m each between entry(30) and exit(110) get the extra 0.2s delay.
      expect(corner.timeDeltaSec).toBeCloseTo(1.6, 2);
      // No extra delay was applied outside the corner, so the straights should show ~0 delta.
      for (const s of segments) {
        if (s.type === 'straight') expect(s.timeDeltaSec).toBeCloseTo(0, 2);
      }
    });

    it('computes braking point and throttle-on point deltas within a corner', () => {
      const baseline = withBrakeThrottle(buildLap(100, 0.3), 40, 80);
      const primary = withBrakeThrottle(buildLap(100, 0.3), 50, 70);

      const segments = computeLapSegmentComparisons(primary, baseline);
      const corner = segments.find(s => s.type === 'corner');
      if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

      // Brake/throttle ramp linearly between 10m-spaced samples, so the detected threshold
      // crossing lands a bit before the raw keyframe distance - the delta between the two
      // laps is unaffected since both ramps are shaped identically, just offset by 10m.
      expect(corner.baselineBrakingDistM).toBe(32);
      expect(corner.primaryBrakingDistM).toBe(42);
      expect(corner.brakingPointDeltaM).toBe(10); // primary braked 10m later than baseline

      expect(corner.baselineThrottleOnDistM).toBe(80);
      expect(corner.primaryThrottleOnDistM).toBe(70);
      expect(corner.throttleOnDeltaM).toBe(-10); // primary got back to full throttle 10m earlier
    });

    it('returns an empty array when either lap has no points', () => {
      expect(computeLapSegmentComparisons([], buildLap(100, 0.3))).toEqual([]);
      expect(computeLapSegmentComparisons(buildLap(100, 0.3), [])).toEqual([]);
    });

    it('ignores noise dips below the prominence threshold (no corner rows, still covers the lap)', () => {
      const speeds = [100, 150, 200, 200, 195, 200, 200, 180, 150, 100]; // only a 5 km/h dip
      const toPoints = (s: number[]) => s.map((speedKmh, i) => ({
        x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: i * 0.3,
      }));
      const segments = computeLapSegmentComparisons(toPoints(speeds), toPoints(speeds));

      expect(segments.filter(s => s.type === 'corner')).toHaveLength(0);
      expect(segments.some(s => s.type === 'straight')).toBe(true);
    });
  });

  describe('findIndexAtDistance', () => {
    it('finds the closest index for an exact and an in-between distance', () => {
      const dists = [0, 10, 20, 30, 40];
      expect(findIndexAtDistance(dists, 20)).toBe(2);
      expect(findIndexAtDistance(dists, 22)).toBe(2);
      expect(findIndexAtDistance(dists, 28)).toBe(3);
    });

    it('clamps to the first/last index when out of range', () => {
      const dists = [0, 10, 20];
      expect(findIndexAtDistance(dists, -5)).toBe(0);
      expect(findIndexAtDistance(dists, 100)).toBe(2);
    });

    it('returns 0 for an empty distance array', () => {
      expect(findIndexAtDistance([], 10)).toBe(0);
    });
  });

  describe('filterCompatibleReplays', () => {
    const allReplays: ReplaySummary[] = [
      { name: 'Spa_GT3_1.vcr', path: '/Spa_GT3_1.vcr', sizeBytes: 1000, mtime: 1, trackName: 'Spa-Francorchamps', eventTitle: 'LMGT3 Fixed', fileSizeBytes: 1000, mtimeMs: 1 },
      { name: 'Spa_GT3_2.vcr', path: '/Spa_GT3_2.vcr', sizeBytes: 1000, mtime: 2, trackName: 'Circuit de Spa', eventTitle: 'LMGT3 Sprint', fileSizeBytes: 1000, mtimeMs: 2 },
      { name: 'Spa_Hypercar.vcr', path: '/Spa_Hypercar.vcr', sizeBytes: 1000, mtime: 3, trackName: 'Spa-Francorchamps', eventTitle: 'Hypercar Series', fileSizeBytes: 1000, mtimeMs: 3 },
      { name: 'Monza_GT3.vcr', path: '/Monza_GT3.vcr', sizeBytes: 1000, mtime: 4, trackName: 'Autodromo Nazionale Monza', eventTitle: 'LMGT3 Fixed', fileSizeBytes: 1000, mtimeMs: 4 },
    ];

    it('filters replays sharing the same track and car class while excluding current replay', () => {
      const matching = filterCompatibleReplays(
        allReplays,
        'Spa-Francorchamps',
        'LMGT3',
        'Spa_GT3_1.vcr'
      );

      // Should find Spa_GT3_2.vcr (same track Spa + GT3 class), and NOT Monza or Hypercar or itself
      expect(matching.map(r => r.name)).toContain('Spa_GT3_2.vcr');
      expect(matching.map(r => r.name)).not.toContain('Spa_GT3_1.vcr');
      expect(matching.map(r => r.name)).not.toContain('Monza_GT3.vcr');
      expect(matching.map(r => r.name)).not.toContain('Spa_Hypercar.vcr');
    });

    it('strictly filters by r.carClass and r.carModel even when eventTitle is absent or generic', () => {
      const realWorldReplays: ReplaySummary[] = [
        {
          name: 'Circuit de Spa-Francorchamps Q1 27.Vcr',
          path: '/Spa_Q1_27.Vcr',
          sizeBytes: 1000,
          mtime: 1,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMGT3',
          carModel: 'BMW M4 GT3',
          eventTitle: 'Practice',
        },
        {
          name: 'Circuit de Spa-Francorchamps P1 79.Vcr',
          path: '/Spa_P1_79.Vcr',
          sizeBytes: 1000,
          mtime: 2,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMH',
          carModel: 'Cadillac V-Series.R',
          eventTitle: 'Practice', // Same eventTitle!
        },
        {
          name: 'Circuit de Spa-Francorchamps P1 80.Vcr',
          path: '/Spa_P1_80.Vcr',
          sizeBytes: 1000,
          mtime: 3,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMP2',
          carModel: 'Oreca 07 LMP2',
          eventTitle: undefined,
        },
        {
          name: 'Circuit de Spa-Francorchamps R1 31.Vcr',
          path: '/Spa_R1_31.Vcr',
          sizeBytes: 1000,
          mtime: 4,
          trackName: 'Spa-Francorchamps',
          carClass: 'LMGT3',
          carModel: 'Ferrari 296 GT3',
          eventTitle: undefined,
        },
      ];

      // When active car is LMGT3 (e.g. BMW M4 GT3 at Spa)
      const matching = filterCompatibleReplays(
        realWorldReplays,
        'Spa-Francorchamps',
        'LMGT3',
        'Circuit de Spa-Francorchamps Q1 27.Vcr'
      );

      // Must ONLY match Spa_R1_31 (LMGT3), and NEVER match Hypercar (P1 79) or LMP2 (P1 80) despite same track & title
      expect(matching.map(r => r.name)).toEqual(['Circuit de Spa-Francorchamps R1 31.Vcr']);

      // When active car is LMH / Hypercar
      const matchingHyper = filterCompatibleReplays(
        realWorldReplays,
        'Spa-Francorchamps',
        'LMH'
      );
      expect(matchingHyper.map(r => r.name)).toEqual(['Circuit de Spa-Francorchamps P1 79.Vcr']);
    });

    it('strictly isolates track layouts (Monza Curva Grande, Bahrain Outer/Paddock, Paul Ricard Short)', () => {
      const layoutReplays: ReplaySummary[] = [
        { name: 'Monza_GP.Vcr', path: '/Monza_GP.Vcr', sizeBytes: 1000, mtime: 1, trackName: 'Autodromo Nazionale Monza', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 1 },
        { name: 'Monza_CurvaGrande.Vcr', path: '/Monza_CurvaGrande.Vcr', sizeBytes: 1000, mtime: 2, trackName: 'Monza Curva Grande Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 2 },
        { name: 'Bahrain_GP.Vcr', path: '/Bahrain_GP.Vcr', sizeBytes: 1000, mtime: 3, trackName: 'Bahrain International Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 3 },
        { name: 'Bahrain_Outer.Vcr', path: '/Bahrain_Outer.Vcr', sizeBytes: 1000, mtime: 4, trackName: 'Bahrain Outer Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 4 },
        { name: 'Bahrain_Paddock.Vcr', path: '/Bahrain_Paddock.Vcr', sizeBytes: 1000, mtime: 5, trackName: 'Bahrain Paddock Circuit', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 5 },
        { name: 'PaulRicard_Full.Vcr', path: '/PaulRicard_Full.Vcr', sizeBytes: 1000, mtime: 6, trackName: 'Circuit Paul Ricard', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 6 },
        { name: 'PaulRicard_Short.Vcr', path: '/PaulRicard_Short.Vcr', sizeBytes: 1000, mtime: 7, trackName: 'Paul Ricard - 1A-V2-Short', carClass: 'LMGT3', fileSizeBytes: 1000, mtimeMs: 7 },
      ];

      // 1. Monza Curva Grande
      const monzaMatches = filterCompatibleReplays(layoutReplays, 'Autodromo Nazionale Monza (Curva Grande Circuit)', 'LMGT3');
      expect(monzaMatches.map(r => r.name)).toEqual(['Monza_CurvaGrande.Vcr']);

      // 2. Bahrain Outer
      const outerMatches = filterCompatibleReplays(layoutReplays, 'Bahrain International Circuit (Outer Circuit)', 'LMGT3');
      expect(outerMatches.map(r => r.name)).toEqual(['Bahrain_Outer.Vcr']);

      // 3. Bahrain Paddock
      const paddockMatches = filterCompatibleReplays(layoutReplays, 'Bahrain International Circuit (Paddock Circuit)', 'LMGT3');
      expect(paddockMatches.map(r => r.name)).toEqual(['Bahrain_Paddock.Vcr']);

      // 4. Paul Ricard Short
      const shortMatches = filterCompatibleReplays(layoutReplays, 'Paul Ricard Circuit (1A V2 Short)', 'LMGT3');
      expect(shortMatches.map(r => r.name)).toEqual(['PaulRicard_Short.Vcr']);
    });
  });

  describe('mapVehicleIdToClass', () => {
    it('correctly classifies LMGT3 vehicles', () => {
      expect(mapVehicleIdToClass('21_26_AFCO95641716', 'Ferrari 296 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('32_26_WRT_83524148', 'BMW M4 GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('397_25_MUSTANG', 'Ford Mustang GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('8_26_GCHAL79481284', 'McLaren 720S GT3 Evo')).toBe('LMGT3');
      expect(mapVehicleIdToClass('91_26_MANT18218509', 'Porsche 911 GT3 R')).toBe('LMGT3');
      expect(mapVehicleIdToClass('78_25_AKKOF71490E4', 'Lexus RC F GT3')).toBe('LMGT3');
      expect(mapVehicleIdToClass('61_26_IRON57024276', 'Lamborghini Huracan GT3 Evo2')).toBe('LMGT3');
    });

    it('correctly classifies Hypercar / LMH vehicles', () => {
      expect(mapVehicleIdToClass('50_26_499P_123456', 'Ferrari 499P')).toBe('LMH');
      expect(mapVehicleIdToClass('963', 'Porsche 963')).toBe('LMH');
      expect(mapVehicleIdToClass('101_26_WTR51729170', 'Cadillac V-Series.R')).toBe('LMH');
      expect(mapVehicleIdToClass('93_26_PEUG27100541', 'Peugeot 9X8')).toBe('LMH');
      expect(mapVehicleIdToClass('GR010', 'Toyota GR010 Hybrid')).toBe('LMH');
      expect(mapVehicleIdToClass('007_26_THO73564855', 'Aston Martin Valkyrie LMH')).toBe('LMH');
      expect(mapVehicleIdToClass('BMW_HY', 'BMW M Hybrid V8')).toBe('LMH');
      expect(mapVehicleIdToClass('A424', 'Alpine A424')).toBe('LMH');
      expect(mapVehicleIdToClass('GENESIS', 'Genesis GMR001 Hypercar')).toBe('LMH');
    });

    it('correctly classifies LMP2, GTE, and LMP3 vehicles', () => {
      expect(mapVehicleIdToClass('10_VECTOR_C18BEE4', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('4_25_DKR_E8E7FBE8C', 'Oreca 07 LMP2')).toBe('LMP2');
      expect(mapVehicleIdToClass('777_DSTATI5BFA7EF3', 'Aston Martin Vantage AMR')).toBe('GTE');
      expect(mapVehicleIdToClass('488', 'Ferrari 488 GTE EVO')).toBe('GTE');
      expect(mapVehicleIdToClass('G61', 'Ginetta G61-LT-P325 Evo')).toBe('LMP3');
      expect(mapVehicleIdToClass('D09', 'Duqueine D09 P3')).toBe('LMP3');
    });
  });
});
