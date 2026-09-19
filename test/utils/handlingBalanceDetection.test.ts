import { describe, it, expect } from 'vitest';
import {
  detectHandlingBalanceEvents,
  computeVisibleHandlingBands,
} from '../../src/utils/handlingBalanceDetection.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';

function makePoint(overrides: Partial<ReplayTrajectoryPoint>): ReplayTrajectoryPoint {
  return {
    x: 0,
    y: 0,
    z: 0,
    speedKmh: 120,
    timeSec: 0,
    throttle: 0,
    brake: 0,
    steerYaw: 0,
    yawRateDeg: 0,
    accelLatG: 0,
    ...overrides,
  };
}

describe('handlingBalanceDetection', () => {
  describe('detectHandlingBalanceEvents', () => {
    it('returns empty array for empty or tiny inputs', () => {
      expect(detectHandlingBalanceEvents([])).toEqual([]);
      expect(detectHandlingBalanceEvents([makePoint({})])).toEqual([]);
    });

    it('detects understeer (US) when understeerDeg exceeds threshold under cornering', () => {
      const points: ReplayTrajectoryPoint[] = [];
      // 10 straight points
      for (let i = 0; i < 10; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 140, steerYaw: 0, understeerDeg: 0 }));
      }
      // 10 understeer points: steering into right turn, balance +2.5 deg push
      for (let i = 10; i < 20; i++) {
        points.push(
          makePoint({
            timeSec: i * 0.05,
            speedKmh: 130,
            steerYaw: 25,
            yawRateDeg: 8,
            accelLatG: 1.2,
            understeerDeg: 5.0,
          })
        );
      }
      // 10 straight points
      for (let i = 20; i < 30; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 150, steerYaw: 0, understeerDeg: 0 }));
      }

      const events = detectHandlingBalanceEvents(points);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('understeer');
      expect(events[0].label).toMatch(/^US /);
      expect(events[0].peakDeg).toBe(5.0);
      expect(events[0].startIdx).toBe(10);
      expect(events[0].endIdx).toBe(19);
    });

    it('detects oversteer (OS) when understeerDeg is strongly negative', () => {
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 10; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 160 }));
      }
      // 8 points of oversteer (loose rear, rotating faster than steering)
      for (let i = 10; i < 18; i++) {
        points.push(
          makePoint({
            timeSec: i * 0.05,
            speedKmh: 125,
            steerYaw: 10,
            yawRateDeg: 25,
            accelLatG: 1.5,
            understeerDeg: -2.8,
          })
        );
      }
      for (let i = 18; i < 25; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 150 }));
      }

      const events = detectHandlingBalanceEvents(points);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('oversteer');
      expect(events[0].label).toMatch(/^OS /);
      expect(events[0].peakDeg).toBe(-2.8);
    });

    it('detects oversteer via opposite lock / countersteering even with small balance angle', () => {
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 10; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 120 }));
      }
      // Driver caught snap oversteer: yaw rate is +20 (rotating right), but steering is -15 (opposite lock left!)
      for (let i = 10; i < 16; i++) {
        points.push(
          makePoint({
            timeSec: i * 0.05,
            speedKmh: 110,
            steerYaw: -15, // opposite lock
            yawRateDeg: 20, // vehicle rotating right
            understeerDeg: -0.5,
          })
        );
      }
      for (let i = 16; i < 22; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 125 }));
      }

      const events = detectHandlingBalanceEvents(points);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('oversteer');
      expect(events[0].isCountersteer).toBe(true);
    });

    it('ignores momentary 1-frame spikes (noise rejection)', () => {
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push(makePoint({ timeSec: i * 0.05, speedKmh: 140, understeerDeg: 0 }));
      }
      // Single 1-frame kerb spike (duration 0.05s < 0.07s)
      points[10] = makePoint({
        timeSec: 0.5,
        speedKmh: 140,
        steerYaw: 20,
        accelLatG: 1.5,
        understeerDeg: 3.5,
      });

      const events = detectHandlingBalanceEvents(points);
      expect(events.length).toBe(0);
    });

    it('assigns corner phases (E, M, X, MX, EM) based on corner segment landmarks', () => {
      // Mock trajectory with distances
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 30; i++) {
        points.push(
          makePoint({
            x: 0,
            z: i * 10,
            timeSec: i * 0.1,
            speedKmh: 100,
            steerYaw: 18,
            yawRateDeg: 12,
            accelLatG: 1.1,
            understeerDeg: i >= 5 && i <= 8 ? 5.5 : 0, // Event around dist 50m - 80m
          })
        );
      }

      const mockCorner: CornerSegmentComparison = {
        type: 'corner',
        cornerNumber: 1,
        segmentIndex: 0,
        entryDistM: 30,
        minDistM: 100, // Apex at 100m
        exitDistM: 180,
        lengthM: 150,
        primaryTimeSec: 4.5,
        timeDeltaSec: 0,
        primaryEntrySpeedKmh: 150,
        baselineEntrySpeedKmh: 150,
        entrySpeedDeltaKmh: 0,
        primaryMinSpeedKmh: 95,
        baselineMinSpeedKmh: 95,
        minSpeedDeltaKmh: 0,
        primaryExitSpeedKmh: 160,
        baselineExitSpeedKmh: 160,
        exitSpeedDeltaKmh: 0,
        primaryBrakingDistM: 40,
        baselineBrakingDistM: 40,
        brakingPointDeltaM: 0,
        primaryThrottleOnDistM: 120,
        baselineThrottleOnDistM: 120,
        throttleOnDeltaM: 0,
      };

      const events = detectHandlingBalanceEvents(points, [mockCorner]);
      expect(events.length).toBe(1);
      // Event happens at 50m-80m, well before apex at 100m -> Entry 'E'
      expect(events[0].phase).toBe('E');
      expect(events[0].label).toMatch(/^US E|^SCRUB E/);
    });

    it('distinguishes excessive tire scrub (SCRUB) from normal cornering slip angle', () => {
      // 1. Normal cornering understeer: Driver adds steering and car rotates proportionally
      const cleanPoints: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 15; i++) {
        cleanPoints.push(
          makePoint({
            timeSec: i * 0.05,
            speedKmh: 120,
            steerYaw: 15 + i * 0.4, // gentle smooth lock
            yawRateDeg: 12 + i * 0.4, // car responds with proportional rotation
            accelLatG: 1.2,
            accelLonG: 0.0,
            understeerDeg: 5.0, // exactly at threshold
          })
        );
      }
      const cleanEvents = detectHandlingBalanceEvents(cleanPoints);
      expect(cleanEvents.length).toBe(1);
      expect(cleanEvents[0].isTireScrub).toBe(false);
      expect(cleanEvents[0].label).toMatch(/^US /);

      // 2. Excessive tire scrub with steering gain collapse:
      // Driver dumps +20° extra lock, but car yaw rate collapses
      const scrubPoints: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < 15; i++) {
        scrubPoints.push(
          makePoint({
            timeSec: i * 0.05,
            speedKmh: 110,
            steerYaw: 15 + i * 2.0, // steer increases rapidly from 15 to 43°
            yawRateDeg: 18 - i * 0.8, // yaw rate collapses from 18 to 6.8°/s (gain collapse!)
            accelLatG: 1.0,
            accelLonG: -0.25, // induced scrub drag
            understeerDeg: 5.5,
          })
        );
      }
      const scrubEvents = detectHandlingBalanceEvents(scrubPoints);
      expect(scrubEvents.length).toBe(1);
      expect(scrubEvents[0].isTireScrub).toBe(true);
      expect(scrubEvents[0].label).toMatch(/^SCRUB /);
      expect(scrubEvents[0].scrubSeverityPct).toBeGreaterThan(0);
    });
  });

  describe('computeVisibleHandlingBands', () => {
    it('projects events to SVG coordinates [0, 1000] across visible window', () => {
      const cumDists = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const events = [
        {
          id: 'b1',
          type: 'understeer' as const,
          phase: 'M' as const,
          label: 'US M',
          startIdx: 2,
          endIdx: 4,
          startDistM: 200,
          endDistM: 400,
          startTimeSec: 2,
          endTimeSec: 4,
          peakDeg: 2.2,
          avgDeg: 2.0,
          peakSpeedKmh: 110,
          isCountersteer: false,
          isTireScrub: false,
          scrubSeverityPct: 0,
        },
      ];

      // Full view 0 to 10 (dist 0 to 1000m)
      const bands = computeVisibleHandlingBands(events, 0, 10, cumDists);
      expect(bands.length).toBe(1);
      expect(bands[0].xStart).toBe(200);
      expect(bands[0].xEnd).toBe(400);
      expect(bands[0].width).toBe(200);
      expect(bands[0].label).toBe('US M');
      expect(bands[0].isTireScrub).toBe(false);
    });

    it('filters out events outside the active zoomed window', () => {
      const cumDists = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const events = [
        {
          id: 'b1',
          type: 'oversteer' as const,
          phase: 'MX' as const,
          label: 'OS MX',
          startIdx: 1,
          endIdx: 2,
          startDistM: 100,
          endDistM: 200,
          startTimeSec: 1,
          endTimeSec: 2,
          peakDeg: -3.0,
          avgDeg: -2.5,
          peakSpeedKmh: 130,
          isCountersteer: true,
          isTireScrub: false,
          scrubSeverityPct: 0,
        },
      ];

      // Zoomed into range 500m to 1000m (indices 5 to 10)
      const bands = computeVisibleHandlingBands(events, 5, 10, cumDists);
      expect(bands.length).toBe(0);
    });
  });
});
