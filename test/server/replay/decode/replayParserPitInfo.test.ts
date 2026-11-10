import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractReplayTrajectory } from '../../../../server/replay/decode/replayTrajectory.js';
import { createSliceVcrBuffer } from '../../../utils/mockVcr.js';

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

    it('decodes engine speed (pose bits 50..63, rpm = n × 60 / 14π) and the 6-bit throttle (bits 43..48)', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const vcrPath = path.join(tempDir, 'synthetic_rpm.vcr');
      fs.writeFileSync(vcrPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, engineSpeedRaw: 3665, throttle: 0 },
          // n = 32: the top bit the old decoder dropped.
          { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, engineSpeedRaw: 12000, throttle: 50.8 },
          { sTime: 1.2, driverSlot: 1, x: 30, y: 0, z: 30, engineSpeedRaw: 0x3fff, throttle: 100 },
        ],
      }));

      const traj = extractReplayTrajectory(vcrPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.points.map(p => p.engineRpm)).toEqual([5000, 16370, 22349]);
      expect(traj.points.map(p => p.throttle)).toEqual([0, 51, 100]);
    });

    it('decodes the pose wheels (angular speed, suspension) and the opcode 143 brake temperatures, loads and slide speeds', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const vcrPath = path.join(tempDir, 'synthetic_wheels.vcr');
      const slow = (radPerSec: number) => (radPerSec * 16) << 13;
      const fast = (radPerSec: number) => (255 << 13) | (radPerSec * 16);
      fs.writeFileSync(vcrPath, createSliceVcrBuffer({
        slices: [
          {
            sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10,
            wheel: { brakeTemps: [500, 480, 300, 290], loadSteps: [5, 5, 4, 3], slideSteps: [10, 0, 0, 63] },
            poseWheels: [
              { speed: slow(10), deflection: -41 },
              { speed: slow(10) | (1 << 21), deflection: 0 },
              { speed: fast(200), deflection: 100 },
              { speed: fast(200) | (1 << 21), deflection: -8192 },
            ],
          },
          { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20 },
        ],
      }));

      const [first, second] = extractReplayTrajectory(vcrPath, { driverSlot: 1, maxPoints: 0 }).points;
      expect(first.wheelAngularSpeeds).toEqual([10, -10, 200, -200]);
      expect(first.suspensionDeflections).toEqual([-41 / 2048, 0, 100 / 2048, -4]);
      // 10-bit kelvin steps of 1.47 K: 480 °C comes back as 481.
      expect(first.brakeTemps).toEqual([500, 481, 300, 290]);
      expect(first.wheelLoads).toEqual([5000, 5000, 4000, 3000]);
      expect(first.tireSlideSpeeds).toEqual([2.52, 0, 0, 100.0188]);
      // Held until the car's next opcode 143.
      expect(second.brakeTemps).toEqual(first.brakeTemps);
    });

    it('times events by their slice time plus the header time offset (n / 4000 s)', () => {
      fs.mkdirSync(tempDir, { recursive: true });
      const vcrPath = path.join(tempDir, 'synthetic_offset.vcr');
      const contact = Buffer.alloc(33);
      contact.writeFloatLE(50, 8);
      fs.writeFileSync(vcrPath, createSliceVcrBuffer({
        slices: [
          { sTime: 2.0, driverSlot: 1, x: 10, y: 0, z: 10, rawEvents: [{ opcode: 145, slot: 1, payload: contact, timeOffset: 40 }] },
          { sTime: 2.02, driverSlot: 1, x: 20, y: 0, z: 20 },
        ],
      }));

      const traj = extractReplayTrajectory(vcrPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.contacts?.[0].timeSec).toBe(2.01);
    });

    it('decodes live standings snapshots (opcode 240) into running-order history', () => {
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
