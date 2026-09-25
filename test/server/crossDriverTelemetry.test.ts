import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  computeLapComparisons,
  computeStartFinishOffset,
} from '../../src/utils/replayComparison.js';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/core/types.js';
import { decompressTrajectory } from '../../server/core/replayTrajectoryCodec.js';
import { extractReplayTrajectory } from '../../server/replay/replayParser.js';
import { enrichTrajectoryWithTrackGeometry } from '../../server/tracks/serverTrackSync.js';

const runRealReplayTests = process.env.RUN_REAL_REPLAY_TESTS === '1';
const steamReplaysDir = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';

describe('Cross-Driver Telemetry & Canonical Reference Matching', () => {
  const dbPath = path.resolve(process.cwd(), 'server', 'lmu_cache.db');
  const hasDb = fs.existsSync(dbPath);

  describe('Synthetic Bullet-Proof Cross-Driver Scenarios', () => {
    const trackLengthM = 5000;

    // Helper to generate a realistic lap trajectory around a circuit
    function generateSyntheticLap(
      _driverName: string,
      startStationOffsetM: number, // positive = trimmed after line, negative = trimmed before line
      speedFactor: number, // 1.0 = baseline, 1.02 = 2% faster
      baseTimeSec = 0
    ): ReplayTrajectoryPoint[] {
      const points: ReplayTrajectoryPoint[] = [];
      const numPoints = 500;
      const baseSpeedKmh = 180 * speedFactor;
      const speedMs = (baseSpeedKmh * 1000) / 3600;

      let currentStation = startStationOffsetM;
      let currentTime = baseTimeSec;

      for (let i = 0; i < numPoints; i++) {
        // Wrap station within [0, trackLengthM)
        let st = currentStation;
        while (st < 0) st += trackLengthM;
        while (st >= trackLengthM) st -= trackLengthM;

        points.push({
          x: currentStation,
          y: 0,
          z: 0,
          speedKmh: Math.round(baseSpeedKmh),
          throttle: 100,
          brake: 0,
          steerYaw: 0,
          timeSec: Number(currentTime.toFixed(4)),
          distM: i * 10,
          stationM: Math.round(st * 10) / 10,
        });

        currentStation += 10;
        currentTime += 10 / speedMs;
      }

      return points;
    }

    it('Scenario 1: Same session, same driver (Samuel Lague Lap A vs Lap B with identical pace)', () => {
      // Both laps start near line with slight sample offset (e.g. -2m vs +1m)
      const lapA = generateSyntheticLap('Samuel Lague', -2, 1.0, 100.0);
      const lapB = generateSyntheticLap('Samuel Lague', 1, 1.0, 250.0);

      const comparisons = computeLapComparisons(lapA, lapB, trackLengthM);
      expect(comparisons.length).toBe(lapA.length);

      // S/F crossing index for lapA is between node 0 (-2m) and node 1 (+8m)
      // At station 0, elapsed time is 0 for both, so delta must be 0.000s
      const nearSfComp = comparisons.find(c => Math.abs((c.primary.stationM ?? 0)) < 15);
      expect(nearSfComp).toBeDefined();
      expect(Math.abs(nearSfComp!.deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 2: Different session, same driver (Samuel Lague Session 1 vs Session 2)', () => {
      // Session 1 starts at t=500.0s, Session 2 starts at t=5400.0s (e.g. 1.5h later)
      // Driver was 1% faster in Session 2
      const lapS1 = generateSyntheticLap('Samuel Lague', -3, 1.0, 500.0);
      const lapS2 = generateSyntheticLap('Samuel Lague', 2, 1.01, 5400.0);

      const comparisons = computeLapComparisons(lapS2, lapS1, trackLengthM);
      expect(comparisons.length).toBe(lapS2.length);

      // Start/Finish line crossing delta must be 0.000s (no multi-thousand second session offset!)
      expect(comparisons[0].deltaTimeSec).toBeCloseTo(0.0, 2);

      // By mid-lap, the faster driver (lapS2) should show a negative delta (time gain)
      const midComp = comparisons[Math.floor(comparisons.length / 2)];
      expect(midComp.deltaTimeSec).toBeLessThan(0);
    });

    it('Scenario 3: Same session, different driver (Samuel Lague vs Opponent with different trims)', () => {
      // Samuel Lague started recording 4m before line (station = -4m)
      // Opponent started recording 6m after line (station = +6m)
      const samuelLap = generateSyntheticLap('Samuel Lague', -4, 1.0, 10.0);
      const opponentLap = generateSyntheticLap('Opponent Slot 0', 6, 1.0, 8.5);

      const comparisons = computeLapComparisons(samuelLap, opponentLap, trackLengthM);
      expect(comparisons.length).toBe(samuelLap.length);

      // Find node closest to the physical Start/Finish line (station ≈ 0)
      const sfIndex = samuelLap.findIndex(p => (p.stationM ?? 0) >= 0 && (p.stationM ?? 0) < 15);
      expect(sfIndex).toBeGreaterThanOrEqual(0);

      // Delta at Start/Finish line MUST be 0.000s without any initial step/jump
      expect(Math.abs(comparisons[sfIndex].deltaTimeSec)).toBeLessThanOrEqual(0.005);

      // All points should have delta ≈ 0 since both travel at equal speed
      for (let i = sfIndex; i < comparisons.length - 10; i++) {
        expect(Math.abs(comparisons[i].deltaTimeSec)).toBeLessThanOrEqual(0.01);
      }
    });

    it('Scenario 4: Different session, different driver (Samuel Lague Session A vs Opponent Session B)', () => {
      // Samuel in Session A (t=2000s), Opponent in Session B (t=7500s)
      const samuelLap = generateSyntheticLap('Samuel Lague', 1.5, 1.0, 2000.0);
      const opponentLap = generateSyntheticLap('Opponent Slot 3', -5.0, 1.0, 7500.0);

      const comparisons = computeLapComparisons(samuelLap, opponentLap, trackLengthM);
      expect(comparisons.length).toBe(samuelLap.length);

      // At Start/Finish line: delta must be 0.000s
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });
  });

  describe('Real Database Telemetry Cross-Tests (from server/lmu_cache.db)', () => {
    if (!hasDb) {
      it.skip('Skipping real DB tests because lmu_cache.db is not present in test environment', () => {});
      return;
    }

    const db = new Database(dbPath, { readonly: true });

    function loadCachedLap(vcrNameLike: string, slotId: number, lapNumber: number): ReplayTrajectoryData | null {
      let row = db.prepare(`
        SELECT trajectory_br FROM replay_trajectories
        WHERE filename LIKE ? AND driver_slot = ? AND lap_key = ?
        LIMIT 1
      `).get(`%${vcrNameLike}%`, slotId, lapNumber) as { trajectory_br: Buffer } | undefined;

      // After the dedup migration the -1 alias is a pointer rather than a stored copy.
      if (!row && slotId === -1) {
        const defaults = db.prepare(`
          SELECT resolved_driver_slot FROM replay_trajectory_defaults
          WHERE filename LIKE ? AND driver_slot = -1 LIMIT 1
        `).get(`%${vcrNameLike}%`) as { resolved_driver_slot: number | null } | undefined;
        if (typeof defaults?.resolved_driver_slot === 'number') {
          row = db.prepare(`
            SELECT trajectory_br FROM replay_trajectories
            WHERE filename LIKE ? AND driver_slot = ? AND lap_key = ?
            LIMIT 1
          `).get(`%${vcrNameLike}%`, defaults.resolved_driver_slot, lapNumber) as { trajectory_br: Buffer } | undefined;
        }
      }

      if (!row || !row.trajectory_br) return null;
      try {
        return decompressTrajectory(row.trajectory_br);
      } catch {
        return null;
      }
    }

    it('Scenario 1 (Real): Same session, same driver (Samuel Lague Lap 2 vs Lap 3 in Daytona R1 4)', () => {
      const lap2 = loadCachedLap('Daytona International Speedway R1 4.Vcr', -1, 2);
      const lap3 = loadCachedLap('Daytona International Speedway R1 4.Vcr', -1, 3);

      if (!lap2 || !lap3) {
        return; // Cache row not found in current environment
      }

      const comparisons = computeLapComparisons(lap3.points, lap2.points, lap3.trackLengthM);
      expect(comparisons.length).toBe(lap3.points.length);

      // Delta at Start/Finish line must be 0.000s
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    }, 15000);

    it('Scenario 2 (Real): Different session, same driver (Samuel Lague Daytona R1 4 vs Daytona R1 5)', () => {
      const r1_4 = loadCachedLap('Daytona International Speedway R1 4.Vcr', -1, 2);
      const r1_5 = loadCachedLap('Daytona International Speedway R1 5.Vcr', -1, 2);

      if (!r1_4 || !r1_5) {
        return;
      }

      const comparisons = computeLapComparisons(r1_5.points, r1_4.points, r1_5.trackLengthM);
      expect(comparisons.length).toBe(r1_5.points.length);

      // Delta at Start/Finish line must be <= 0.005s
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 3 (Real): Same session, different driver (Samuel Lague vs Slot 0 in Daytona R1 4)', () => {
      const samuel = loadCachedLap('Daytona International Speedway R1 4.Vcr', -1, 2);
      const opponent = loadCachedLap('Daytona International Speedway R1 4.Vcr', 0, 2);

      if (!samuel || !opponent) {
        return;
      }

      // Check crossing metrics
      const samuelOffset = computeStartFinishOffset(samuel.points, samuel.trackLengthM);
      const opponentOffset = computeStartFinishOffset(opponent.points, opponent.trackLengthM);
      expect(samuelOffset).not.toBeNull();
      expect(opponentOffset).not.toBeNull();

      const comparisons = computeLapComparisons(samuel.points, opponent.points, samuel.trackLengthM);
      expect(comparisons.length).toBe(samuel.points.length);

      // Critical Test: In the previous implementation, this produced a +82ms to +111ms jump!
      // Now, with canonical reference alignment, initial delta jump must be eliminated (<= 0.005s)
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 4 (Real): Different session, different driver (Samuel Lague R1 4 vs Opponent R1 5)', () => {
      const samuel = loadCachedLap('Daytona International Speedway R1 4.Vcr', -1, 2);
      const opponent = loadCachedLap('Daytona International Speedway R1 5.Vcr', 0, 2);

      if (!samuel || !opponent) {
        return;
      }

      const comparisons = computeLapComparisons(samuel.points, opponent.points, samuel.trackLengthM);
      expect(comparisons.length).toBe(samuel.points.length);

      // Initial delta jump at Start/Finish line must be eliminated (<= 0.005s)
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });
  });

  describe.skipIf(!runRealReplayTests)('Real Binary VCR File Extraction & Cross-Driver Matching (RUN_REAL_REPLAY_TESTS=1)', () => {
    const daytonaR1_4 = path.join(steamReplaysDir, 'Daytona International Speedway Road Course R1 4.Vcr');
    const daytonaR1_5 = path.join(steamReplaysDir, 'Daytona International Speedway Road Course R1 5.Vcr');
    const lagunaR1_4 = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 4.Vcr');
    const lagunaR1_2 = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 2.Vcr');

    function extractAndEnrichLap(
      filePath: string,
      options: { playerName?: string; driverSlot?: number; lapNumber: number }
    ): ReplayTrajectoryData {
      const traj = extractReplayTrajectory(filePath, options);
      enrichTrajectoryWithTrackGeometry(traj, null, null, path.basename(filePath));
      return traj;
    }

    it('Scenario 1 (Binary VCR): Same session, same driver (Samuel Lague Lap 2 vs Lap 3 from raw Daytona R1 4 .Vcr)', () => {
      if (!fs.existsSync(daytonaR1_4)) return;

      const lap2 = extractAndEnrichLap(daytonaR1_4, { playerName: 'Samuel Lague', lapNumber: 2 });
      const lap3 = extractAndEnrichLap(daytonaR1_4, { playerName: 'Samuel Lague', lapNumber: 3 });

      expect(lap2.pointsCount).toBeGreaterThan(50);
      expect(lap3.pointsCount).toBeGreaterThan(50);
      expect(lap2.trackLengthM).toBeGreaterThan(1000);

      const comparisons = computeLapComparisons(lap3.points, lap2.points, lap3.trackLengthM);
      expect(comparisons.length).toBe(lap3.points.length);

      // Start/Finish line crossing delta must be within ±0.005s (0.000s)
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 2 (Binary VCR): Different session, same driver (Samuel Lague from raw Daytona R1 4 vs R1 5 .Vcr)', () => {
      if (!fs.existsSync(daytonaR1_4) || !fs.existsSync(daytonaR1_5)) return;

      const r1_4 = extractAndEnrichLap(daytonaR1_4, { playerName: 'Samuel Lague', lapNumber: 2 });
      const r1_5 = extractAndEnrichLap(daytonaR1_5, { playerName: 'Samuel Lague', lapNumber: 2 });

      const comparisons = computeLapComparisons(r1_5.points, r1_4.points, r1_5.trackLengthM);
      expect(comparisons.length).toBe(r1_5.points.length);

      // Start/Finish line crossing delta must be <= 0.005s
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 3 (Binary VCR): Same session, different driver (Samuel Lague vs Opponent slot 0 in Daytona R1 4 .Vcr)', () => {
      if (!fs.existsSync(daytonaR1_4)) return;

      const samuel = extractAndEnrichLap(daytonaR1_4, { playerName: 'Samuel Lague', lapNumber: 2 });
      const opponent = extractAndEnrichLap(daytonaR1_4, { driverSlot: 0, lapNumber: 2 });

      expect(samuel.pointsCount).toBeGreaterThan(50);
      expect(opponent.pointsCount).toBeGreaterThan(50);

      const comparisons = computeLapComparisons(samuel.points, opponent.points, samuel.trackLengthM);
      expect(comparisons.length).toBe(samuel.points.length);

      // Eliminates the previously observed +82ms jump at Start/Finish crossing
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 4 (Binary VCR): Different session, different driver (Samuel Lague R1 4 vs Opponent R1 5)', () => {
      if (!fs.existsSync(daytonaR1_4) || !fs.existsSync(daytonaR1_5)) return;

      const samuel = extractAndEnrichLap(daytonaR1_4, { playerName: 'Samuel Lague', lapNumber: 2 });
      const opponent = extractAndEnrichLap(daytonaR1_5, { driverSlot: 0, lapNumber: 2 });

      const comparisons = computeLapComparisons(samuel.points, opponent.points, samuel.trackLengthM);
      expect(comparisons.length).toBe(samuel.points.length);

      // Eliminates the previously observed +111ms jump at Start/Finish crossing
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });

    it('Scenario 5 (Binary VCR Laguna Seca): Real multi-session comparison across Laguna Seca R1 4 vs R1 2', () => {
      if (!fs.existsSync(lagunaR1_4) || !fs.existsSync(lagunaR1_2)) return;

      const lapA = extractAndEnrichLap(lagunaR1_4, { playerName: 'Samuel', lapNumber: 2 });
      const lapB = extractAndEnrichLap(lagunaR1_2, { playerName: 'Samuel', lapNumber: 2 });

      expect(lapA.pointsCount).toBeGreaterThan(50);
      expect(lapB.pointsCount).toBeGreaterThan(50);

      const comparisons = computeLapComparisons(lapA.points, lapB.points, lapA.trackLengthM);
      expect(comparisons.length).toBe(lapA.points.length);

      // S/F line crossing delta must be aligned (<= 0.005s)
      expect(Math.abs(comparisons[0].deltaTimeSec)).toBeLessThanOrEqual(0.005);
    });
  });
});
