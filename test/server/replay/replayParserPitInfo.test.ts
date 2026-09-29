import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractReplayTrajectory } from '../../../server/replay/replayTrajectory.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

const runRealReplayTests = process.env.RUN_REAL_REPLAY_TESTS === '1';

describe('replayParser - pit info', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-replays-temp-pit-'));

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  describe('pit stop and garage info extraction', () => {
    const steamReplays = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
    const daytonaRace = path.join(steamReplays, 'Daytona International Speedway Road Course R1 3.Vcr');
    const lagunaPractice = path.join(steamReplays, 'WeatherTech Raceway Laguna Seca P1 5.Vcr');

    it('extracts full pitstop lifecycle across all drivers in online race replay (Daytona R1 3)', () => {
      if (!runRealReplayTests || !fs.existsSync(daytonaRace)) return;

      const allTraj = extractReplayTrajectory(daytonaRace, { maxPoints: 10 });
      const allPitEvents = allTraj.pitEvents || [];
      expect(allPitEvents.length).toBeGreaterThan(100);

      // Verify driver slot 32 pit sequence
      const traj = extractReplayTrajectory(daytonaRace, { driverSlot: 32, maxPoints: 50 });
      const slot32Events = (traj.pitEvents || []).filter(e => e.driverSlot === 32);
      expect(slot32Events.length).toBeGreaterThanOrEqual(4);
      expect(slot32Events.every(e => e.driverSlot === 32)).toBe(true);

      const actions = slot32Events.map(e => e.action);
      expect(actions).toContain('requested pit');
      expect(actions).toContain('entered pit lane');
      expect(actions).toContain('on jacks');
      expect(actions).toContain('service complete');
      expect(actions).toContain('exited pit lane');

      // Verify trajectory also carries pitEvents
      expect(traj.pitEvents).toBeDefined();
      expect(traj.pitEvents?.length).toBeGreaterThan(100);
    });

    it('extracts garage exits and returns during practice sessions (Laguna Seca P1 5)', () => {
      if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

      const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 10 });
      const pitEvents = (traj.pitEvents || []).filter(e => e.driverSlot === 0);
      expect(pitEvents.length).toBeGreaterThanOrEqual(4);

      const garageExits = pitEvents.filter(e => e.code === 16 && e.action === 'exited garage');
      const garageReturns = pitEvents.filter(e => (e.code === 21 || e.code === 49) && (e.action === 'returned to garage' || e.action === 'entered pit / garage'));

      expect(garageExits.length).toBeGreaterThanOrEqual(2);
      expect(garageReturns.length).toBeGreaterThanOrEqual(2);
      expect(garageExits.every(e => e.isGarage === true)).toBe(true);
      expect(garageReturns.every(e => e.isGarage === true)).toBe(true);
    });

    it('correctly sets inGarage and inPit flags on trajectory points from the pit events', () => {
      if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

      // Extract full points around the first stint start (time 0 to 40s)
      const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 0 });
      expect(traj.points.length).toBeGreaterThan(50);

      // First garage exit for driver 0 in Laguna Seca P1 5 is at 28.41s
      const garagePoints = traj.points.filter(p => p.timeSec !== undefined && p.timeSec < 28.0);
      const flyingPoints = traj.points.filter(p => p.timeSec !== undefined && p.timeSec > 35.0 && p.timeSec < 340.0 && (p.speedKmh ?? 0) > 40);

      // Parked in the garage, then driving down the pit lane (in the pits, no longer in the garage).
      if (garagePoints.length > 0) {
        expect(garagePoints.filter(p => (p.speedKmh ?? 0) < 1 && !p.inPit).every(p => p.inGarage === true)).toBe(true);
        expect(garagePoints.filter(p => (p.speedKmh ?? 0) > 5).every(p => p.inGarage === false && p.inPit === true)).toBe(true);
      }
      if (flyingPoints.length > 0) {
        expect(flyingPoints.every(p => p.inGarage === false && p.inPit === false)).toBe(true);
      }
    });

    it('emits authentic wheel telemetry (brakeTemps) when present and omits unverified tire wear', () => {
      if (!runRealReplayTests || !fs.existsSync(lagunaPractice)) return;

      const traj = extractReplayTrajectory(lagunaPractice, { driverSlot: 0, maxPoints: 200 });
      expect(traj.wheelTelemetryAvailable).toBe(true);
      expect(traj.points.length).toBeGreaterThan(10);

      // Does NOT emit unverified/refuted tire wear or carcass temps
      const pointsWithWear = traj.points.filter(p => p.tireTemps !== undefined || p.tireWear !== undefined);
      expect(pointsWithWear.length).toBe(0);

      // Does emit authentic brake rotor temperatures and suspension deflection
      const pointsWithBrakes = traj.points.filter(p => p.brakeTemps !== undefined);
      expect(pointsWithBrakes.length).toBeGreaterThan(0);
      const sampleBrake = pointsWithBrakes[0].brakeTemps!;
      expect(sampleBrake.length).toBe(4);
      expect(sampleBrake[0]).toBeGreaterThanOrEqual(20);
      expect(sampleBrake[0]).toBeLessThanOrEqual(1000);
    });

    it('decodes engine RPM from the 10-bit pose packet field (byte 6 bit 5 through byte 7 bit 6)', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const rpmVcrPath = path.join(tempDir, 'synthetic_rpm.vcr');
      // raw10 = round(rpm / 10.9228); 5000rpm -> raw 458, 8000rpm -> raw 733
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, rpmRaw10: 458 },
          { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, rpmRaw10: 733 },
          // Saturated field (0x3ff) must be treated as unknown, not a real rpm value
          { sTime: 1.2, driverSlot: 1, x: 30, y: 0, z: 30, rpmRaw10: 1023 },
        ],
      });
      fs.writeFileSync(rpmVcrPath, buf);

      const traj = extractReplayTrajectory(rpmVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.points.length).toBe(3);
      expect(traj.points[0].engineRpm).toBeCloseTo(5002, -1);
      expect(traj.points[1].engineRpm).toBeCloseTo(8006, -1);
      expect(traj.points[2].engineRpm).toBeUndefined();

    });

    it('decodes track flag status events (Class 3 Type 10)', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const flagVcrPath = path.join(tempDir, 'synthetic_flags.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 0.0, driverSlot: 1, x: 10, y: 0, z: 10, flag: { flagState: 1, sectorMask: 33, driverFlag: 0 } },
          { sTime: 66.0, driverSlot: 1, x: 20, y: 0, z: 20, flag: { flagState: 0, sectorMask: 33, driverFlag: 0 } },
          { sTime: 1400.0, driverSlot: 1, x: 30, y: 0, z: 30, flag: { flagState: 8, sectorMask: 1, driverFlag: 0 } },
        ],
      });
      fs.writeFileSync(flagVcrPath, buf);

      const traj = extractReplayTrajectory(flagVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.flagEvents).toBeDefined();
      expect(traj.flagEvents?.length).toBe(3);
      expect(traj.flagEvents?.[0]).toMatchObject({ flagState: 1, flagName: 'Local Yellow', sectorMask: 33 });
      expect(traj.flagEvents?.[1]).toMatchObject({ flagState: 0, flagName: 'Green' });
      expect(traj.flagEvents?.[2]).toMatchObject({ flagState: 8, flagName: 'Checkered' });

    });

    it('decodes live standings snapshots (Type 48) into running-order history', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const standingsVcrPath = path.join(tempDir, 'synthetic_standings.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 4.0, driverSlot: 1, x: 10, y: 0, z: 10, standings: [2, 1, 3] },
          { sTime: 8.0, driverSlot: 1, x: 20, y: 0, z: 20, standings: [1, 2, 3] },
        ],
      });
      fs.writeFileSync(standingsVcrPath, buf);

      const traj = extractReplayTrajectory(standingsVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.standingsHistory).toBeDefined();
      expect(traj.standingsHistory?.length).toBe(2);
      expect(traj.standingsHistory?.[0]).toEqual({ timeSec: 4, order: [2, 1, 3] });
      expect(traj.standingsHistory?.[1]).toEqual({ timeSec: 8, order: [1, 2, 3] });
      // sessionRunningOrder reflects the most recent snapshot
      expect(traj.sessionRunningOrder).toEqual([1, 2, 3]);

    });
  });
});
