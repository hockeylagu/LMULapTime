import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseReplayMetadata } from '../../../server/replay/replayParser.js';
import { extractReplayTrajectory } from '../../../server/replay/replayTrajectory.js';
import { MockSlice, createMockVcrBuffer, createSliceVcrBuffer } from '../../utils/mockVcr.js';

const runRealReplayTests = process.env.RUN_REAL_REPLAY_TESTS === '1';

describe('replayParser - trajectory & timing', () => {
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_temp_traj');
  const tempVcrPath = path.join(tempDir, 'Test_Replay_P1.Vcr');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(tempVcrPath, createMockVcrBuffer());
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractReplayTrajectory', () => {
    it('extracts downsampled GPS points and bounds accurately', () => {
      const traj = extractReplayTrajectory(tempVcrPath, { driverSlot: 1 });
      expect(traj.replayName).toBe('Test_Replay_P1.Vcr');
      expect(traj.driverSlot).toBe(1);
      expect(traj.pointsCount).toBe(3);
      expect(traj.currentLap).toBe(1);
      expect(traj.laps).toBeDefined();
      expect(traj.laps?.length).toBe(1);
      expect(traj.sectors).toBeDefined();
      expect(traj.points[0].x).toBe(100.0);
      expect(traj.points[0].z).toBe(200.0);
      expect(traj.points[2].x).toBe(145.0);
      expect(traj.points[2].z).toBe(230.0);
      expect(traj.bounds.minX).toBe(100.0);
      expect(traj.bounds.maxX).toBe(145.0);
      expect(traj.bounds.minZ).toBe(200.0);
      expect(traj.bounds.maxZ).toBe(230.0);
      expect(traj.bounds.spanX).toBeCloseTo(45.0, 1);
      expect(traj.bounds.spanZ).toBeCloseTo(30.0, 1);
    });

    it('defaults to player driver when no driverSlot or driverName is specified', () => {
      const traj = extractReplayTrajectory(tempVcrPath);
      expect(traj.replayName).toBe('Test_Replay_P1.Vcr');
      expect(traj.driverName).toContain('Samuel Lague');
      expect(traj.pointsCount).toBeGreaterThan(0);
      expect(traj.laps?.length).toBeGreaterThan(0);
      expect(traj.currentLap).toBe(1);
    });

    it('ensures each driver has a unique slot and flags player driver', () => {
      const meta = parseReplayMetadata(tempVcrPath);
      const slots = meta.drivers.map(d => d.slot);
      const uniqueSlots = new Set(slots);
      expect(uniqueSlots.size).toBe(slots.length);

      const player = meta.drivers.find(d => d.name === 'Samuel Lague');
      expect(player?.isPlayer).toBe(true);
    });

    it('decodes telemetry flags (tcActive, absActive, pitLimiter, isOffTrack) and pedal inputs', () => {
      const sliceVcrPath = path.join(tempDir, 'telemetry_flags.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          // Slice 0: full throttle, tcActive
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, throttle: 100, brake: 0, tc: true, abs: false },
          // Slice 1: mid brake, absActive
          { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, throttle: 0, brake: 60, tc: false, abs: true },
          // Slice 2: pitLimiter and offTrack
          { sTime: 1.2, driverSlot: 1, x: 30, y: 0, z: 30, throttle: 20, brake: 0, offTrack: true, pitLimiter: true },
          // Slice 3: clean running
          { sTime: 1.3, driverSlot: 1, x: 40, y: 0, z: 40, throttle: 80, brake: 0 },
        ],
      });
      fs.writeFileSync(sliceVcrPath, buf);

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.pointsCount).toBe(4);

      // Verify slice 0 telemetry
      expect(traj.points[0].throttle).toBe(100);
      expect(traj.points[0].tcActive).toBe(true);
      expect(traj.points[0].absActive).toBe(false);

      // Verify slice 1 telemetry
      expect(traj.points[1].brake).toBeGreaterThan(50);
      expect(traj.points[1].absActive).toBe(true);
      expect(traj.points[1].tcActive).toBe(false);

      // Verify slice 2 status flags
      expect(traj.points[2].isOffTrack).toBe(true);
      expect(traj.points[2].pitLimiter).toBe(true);

      // Verify slice 3 clean flags
      expect(traj.points[3].tcActive).toBe(false);
      expect(traj.points[3].absActive).toBe(false);
      expect(traj.points[3].isOffTrack).toBe(false);
      expect(traj.points[3].pitLimiter).toBe(false);

      fs.unlinkSync(sliceVcrPath);
    });

    it('decodes gear directly from the vehicle pose event eventType field (forward, neutral, reverse)', () => {
      const sliceVcrPath = path.join(tempDir, 'gear_basic.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, gear: 1 },
          { sTime: 1.2, driverSlot: 1, x: 30, y: 0, z: 30, gear: 3 },
          { sTime: 1.4, driverSlot: 1, x: 50, y: 0, z: 50, gear: 7 },
          { sTime: 1.6, driverSlot: 1, x: 70, y: 0, z: 70, gear: -1 },
          { sTime: 1.8, driverSlot: 1, x: 90, y: 0, z: 90, gear: -1 },
        ],
      });
      fs.writeFileSync(sliceVcrPath, buf);

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.pointsCount).toBe(5);
      expect(traj.points[0].gear).toBe(1);
      expect(traj.points[1].gear).toBe(3);
      expect(traj.points[2].gear).toBe(7);
      expect(traj.points[3].gear).toBe(-1);
      expect(traj.points[4].gear).toBe(-1);

      fs.unlinkSync(sliceVcrPath);
    });

    it('ignores a 65-byte event whose type is not a vehicle pose type', () => {
      const sliceVcrPath = path.join(tempDir, 'invalid_pose_type.vcr');
      fs.writeFileSync(sliceVcrPath, createSliceVcrBuffer({
        slices: [{ sTime: 1.0, driverSlot: 1, x: 100, y: 0, z: 100, poseType: 6 }],
      }));

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.points).toHaveLength(0);

      fs.unlinkSync(sliceVcrPath);
    });

    it('passes gear through raw/unfiltered - neutral bridging is a frontend post-processing concern', () => {
      const sliceVcrPath = path.join(tempDir, 'gear_neutral_bridge.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.00, driverSlot: 1, x: 10, y: 0, z: 10, gear: 2 },
          { sTime: 1.02, driverSlot: 1, x: 20, y: 0, z: 20, gear: 2 },
          { sTime: 1.04, driverSlot: 1, x: 30, y: 0, z: 30, gear: 0 },
          { sTime: 1.06, driverSlot: 1, x: 40, y: 0, z: 40, gear: 0 },
          { sTime: 1.08, driverSlot: 1, x: 50, y: 0, z: 50, gear: 3 },
          { sTime: 1.10, driverSlot: 1, x: 60, y: 0, z: 60, gear: 3 },
        ],
      });
      fs.writeFileSync(sliceVcrPath, buf);

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.points.map(p => p.gear)).toEqual([2, 2, 0, 0, 3, 3]);

      fs.unlinkSync(sliceVcrPath);
    });

    it('leaves a long neutral stretch (parked / coasting) untouched', () => {
      const sliceVcrPath = path.join(tempDir, 'gear_neutral_long.vcr');
      const slices: MockSlice[] = [];
      for (let i = 0; i < 10; i++) {
        slices.push({ sTime: 1.0 + i * 0.02, driverSlot: 1, x: 10 + i, y: 0, z: 10 + i, gear: 0 });
      }
      const buf = createSliceVcrBuffer({ slices });
      fs.writeFileSync(sliceVcrPath, buf);

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 20 });
      expect(traj.points.every(p => p.gear === 0)).toBe(true);

      fs.unlinkSync(sliceVcrPath);
    });

    it('passes a momentary gear flicker through raw/unfiltered', () => {
      const sliceVcrPath = path.join(tempDir, 'gear_flicker.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.00, driverSlot: 1, x: 10, y: 0, z: 10, gear: 3 },
          { sTime: 1.02, driverSlot: 1, x: 20, y: 0, z: 20, gear: 3 },
          { sTime: 1.04, driverSlot: 1, x: 30, y: 0, z: 30, gear: 2 },
          { sTime: 1.06, driverSlot: 1, x: 40, y: 0, z: 40, gear: 3 },
          { sTime: 1.08, driverSlot: 1, x: 50, y: 0, z: 50, gear: 3 },
        ],
      });
      fs.writeFileSync(sliceVcrPath, buf);

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.points.map(p => p.gear)).toEqual([3, 3, 2, 3, 3]);

      fs.unlinkSync(sliceVcrPath);
    });

    it('calculates rawSampleRateHz and supports uncompressed full raw trajectory (maxPoints: 0)', () => {
      const resVcrPath = path.join(tempDir, 'resolution_test.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 },
          { sTime: 1.05, driverSlot: 1, x: 15, y: 0, z: 15 },
          { sTime: 1.10, driverSlot: 1, x: 20, y: 0, z: 20 },
          { sTime: 1.15, driverSlot: 1, x: 25, y: 0, z: 25 },
        ],
      });
      fs.writeFileSync(resVcrPath, buf);

      // Downsampled extraction
      const downsampleTraj = extractReplayTrajectory(resVcrPath, { driverSlot: 1, maxPoints: 2 });
      expect(downsampleTraj.rawPointsCount).toBe(4);
      expect(downsampleTraj.rawSampleRateHz).toBe(20);
      expect(downsampleTraj.isFullResolution).toBe(false);
      expect(downsampleTraj.points.length).toBe(2);

      // Uncompressed raw extraction (maxPoints: 0)
      const rawTraj = extractReplayTrajectory(resVcrPath, { driverSlot: 1, maxPoints: 0 });
      expect(rawTraj.rawPointsCount).toBe(4);
      expect(rawTraj.rawSampleRateHz).toBe(20);
      expect(rawTraj.isFullResolution).toBe(true);
      expect(rawTraj.points.length).toBe(4);

      fs.unlinkSync(resVcrPath);
    });

    it('selects rival driver trajectory by driverSlot and driverName', () => {
      const multiDriverPath = path.join(tempDir, 'multi_driver.vcr');
      const buf = createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 },
          { sTime: 1.1, driverSlot: 1, x: 15, y: 0, z: 15 },
          { sTime: 1.0, driverSlot: 2, x: 80, y: 0, z: 80 },
          { sTime: 1.1, driverSlot: 2, x: 90, y: 0, z: 90 },
        ],
      });
      fs.writeFileSync(multiDriverPath, buf);

      // Extract slot 2 explicitly
      const trajSlot2 = extractReplayTrajectory(multiDriverPath, { driverSlot: 2 });
      expect(trajSlot2.driverSlot).toBe(2);
      expect(trajSlot2.pointsCount).toBe(2);
      expect(trajSlot2.points[0].x).toBe(80);

      // Extract Rival Driver by name
      const trajByName = extractReplayTrajectory(multiDriverPath, { driverName: 'Rival Driver' });
      expect(trajByName.driverSlot).toBe(2);
      expect(trajByName.driverName).toBe('Rival Driver');
      expect(trajByName.points[0].x).toBe(80);

      fs.unlinkSync(multiDriverPath);
    });

    it('handles non-existent driver slot gracefully without crashing', () => {
      const sliceVcrPath = path.join(tempDir, 'slot_fallback.vcr');
      fs.writeFileSync(sliceVcrPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 },
        ],
      }));

      const traj = extractReplayTrajectory(sliceVcrPath, { driverSlot: 99 });
      expect(traj.driverSlot).toBe(99);
      expect(traj.pointsCount).toBe(0);
      expect(traj.points).toEqual([]);
      expect(traj.laps?.length).toBe(1);
      expect(traj.laps?.[0].isBest).toBeFalsy();

      fs.unlinkSync(sliceVcrPath);
    });

    it('does not filter downshift rev-match throttle blips - raw pedal input is preserved for the frontend to filter', () => {
      const filterPath = path.join(tempDir, 'filter_blip.vcr');
      // Create a sequence where brake is > 8, and a brief throttle blip occurs flanked by zero throttle
      const slices = [
        { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, throttle: 0, brake: 50 },
        { sTime: 1.02, driverSlot: 1, x: 11, y: 0, z: 11, throttle: 0, brake: 50 },
        { sTime: 1.04, driverSlot: 1, x: 12, y: 0, z: 12, throttle: 65, brake: 50 }, // blip
        { sTime: 1.06, driverSlot: 1, x: 13, y: 0, z: 13, throttle: 0, brake: 50 },
        { sTime: 1.08, driverSlot: 1, x: 14, y: 0, z: 14, throttle: 0, brake: 50 },
      ];
      fs.writeFileSync(filterPath, createSliceVcrBuffer({ slices }));

      const traj = extractReplayTrajectory(filterPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.points[2].throttle).toBeGreaterThan(0);

      fs.unlinkSync(filterPath);
    });

    it('does not interpolate upshift ignition cuts - raw pedal input is preserved for the frontend to filter', () => {
      const cutPath = path.join(tempDir, 'filter_cut.vcr');
      // Sequence: throttle 100%, 100%, momentary cut to 10% for gear change, then back to 100%
      const slices = [
        { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, throttle: 100, brake: 0 },
        { sTime: 1.02, driverSlot: 1, x: 12, y: 0, z: 12, throttle: 100, brake: 0 },
        { sTime: 1.04, driverSlot: 1, x: 14, y: 0, z: 14, throttle: 10, brake: 0 }, // upshift cut
        { sTime: 1.06, driverSlot: 1, x: 16, y: 0, z: 16, throttle: 100, brake: 0 },
        { sTime: 1.08, driverSlot: 1, x: 18, y: 0, z: 18, throttle: 100, brake: 0 },
      ];
      fs.writeFileSync(cutPath, createSliceVcrBuffer({ slices }));

      const traj = extractReplayTrajectory(cutPath, { driverSlot: 1, maxPoints: 10 });
      expect(traj.points[2].throttle).toBeLessThan(20);

      fs.unlinkSync(cutPath);
    });

    it('gracefully falls back when requested lapNumber does not exist', () => {
      const traj = extractReplayTrajectory(tempVcrPath, { lapNumber: 999 });
      // Should fall back to best lap or lap 1 without crashing
      expect(traj.currentLap).toBe(1);
      expect(traj.pointsCount).toBeGreaterThan(0);
    });

    it('throws error when trajectory file does not exist', () => {
      const missingPath = path.join(tempDir, 'nonexistent_traj.vcr');
      expect(() => extractReplayTrajectory(missingPath)).toThrow(/no such file or directory/i);
    });
  });


  describe('extractReplayTrajectory — edge cases', () => {
    it('produces degenerate bounds for single-point trajectory', () => {
      const singlePtPath = path.join(tempDir, 'single_point.vcr');
      fs.writeFileSync(singlePtPath, createSliceVcrBuffer({
        slices: [{ sTime: 1.0, driverSlot: 1, x: 42.5, y: 0, z: -99.3 }],
      }));

      const traj = extractReplayTrajectory(singlePtPath, { driverSlot: 1 });
      expect(traj.pointsCount).toBe(1);
      expect(traj.bounds.minX).toBeCloseTo(42.5, 0);
      expect(traj.bounds.maxX).toBeCloseTo(42.5, 0);
      expect(traj.bounds.minZ).toBeCloseTo(-99.3, 0);
      expect(traj.bounds.maxZ).toBeCloseTo(-99.3, 0);
      expect(traj.bounds.spanX).toBeCloseTo(0, 1);
      expect(traj.bounds.spanZ).toBeCloseTo(0, 1);
      fs.unlinkSync(singlePtPath);
    });

    it('keeps each driver trajectory independent in multi-driver overlapping slices', () => {
      const multiPath = path.join(tempDir, 'multi_overlap.vcr');
      fs.writeFileSync(multiPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 100, y: 0, z: 100 },
          { sTime: 1.0, driverSlot: 2, x: 500, y: 0, z: 500 },
          { sTime: 1.1, driverSlot: 1, x: 110, y: 0, z: 110 },
          { sTime: 1.1, driverSlot: 2, x: 510, y: 0, z: 510 },
          { sTime: 1.2, driverSlot: 1, x: 120, y: 0, z: 120 },
          { sTime: 1.2, driverSlot: 2, x: 520, y: 0, z: 520 },
        ],
      }));

      const traj1 = extractReplayTrajectory(multiPath, { driverSlot: 1 });
      const traj2 = extractReplayTrajectory(multiPath, { driverSlot: 2 });

      expect(traj1.pointsCount).toBe(3);
      expect(traj2.pointsCount).toBe(3);
      // Driver 1 coordinates should all be ~100-120
      expect(traj1.points.every(p => p.x >= 99 && p.x <= 121)).toBe(true);
      // Driver 2 coordinates should all be ~500-520
      expect(traj2.points.every(p => p.x >= 499 && p.x <= 521)).toBe(true);

      fs.unlinkSync(multiPath);
    });

    it('calculates plausible speed from position deltas', () => {
      const speedPath = path.join(tempDir, 'speed_calc.vcr');
      // 100 m/s along x axis = 360 km/h, frames 0.05s apart => delta x = 5m per frame
      fs.writeFileSync(speedPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.00, driverSlot: 1, x: 0,  y: 0, z: 0 },
          { sTime: 1.05, driverSlot: 1, x: 5,  y: 0, z: 0 },
          { sTime: 1.10, driverSlot: 1, x: 10, y: 0, z: 0 },
          { sTime: 1.15, driverSlot: 1, x: 15, y: 0, z: 0 },
          { sTime: 1.20, driverSlot: 1, x: 20, y: 0, z: 0 },
        ],
      }));

      const traj = extractReplayTrajectory(speedPath, { driverSlot: 1, maxPoints: 0 });
      // Interior points should have speed ~360 km/h (100 m/s * 3.6)
      // After 3-point smoothing it may vary slightly
      const interiorSpeeds = traj.points.slice(1, -1).map(p => p.speedKmh ?? 0);
      for (const s of interiorSpeeds) {
        expect(s).toBeGreaterThan(200);
        expect(s).toBeLessThan(400);
      }

      fs.unlinkSync(speedPath);
    });

    it('uses embedded packet speed when pose coordinates do not advance', () => {
      const speedPath = path.join(tempDir, 'packet_speed.vcr');
      fs.writeFileSync(speedPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.00, driverSlot: 1, x: 25, y: 0, z: 40, speedBytes: [136, 63, 0, 32, 242] },
          { sTime: 1.02, driverSlot: 1, x: 25, y: 0, z: 40, speedBytes: [136, 63, 0, 32, 242] },
          { sTime: 1.04, driverSlot: 1, x: 25, y: 0, z: 40, speedBytes: [136, 63, 0, 32, 242] },
        ],
      }));

      const traj = extractReplayTrajectory(speedPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.points.map(point => point.speedKmh)).toEqual([101, 101, 101]);

      fs.unlinkSync(speedPath);
    });



    it('discards points with coordinates beyond ±20000 range', () => {
      const extremePath = path.join(tempDir, 'extreme_coords.vcr');
      fs.writeFileSync(extremePath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 100, y: 0, z: 100 },
          { sTime: 1.1, driverSlot: 1, x: 25000, y: 0, z: 100 }, // out of range
          { sTime: 1.2, driverSlot: 1, x: 200, y: 0, z: 200 },
        ],
      }));

      const traj = extractReplayTrajectory(extremePath, { driverSlot: 1, maxPoints: 0 });
      // The out-of-range point should be filtered out
      expect(traj.pointsCount).toBe(2);
      expect(traj.points.every(p => Math.abs(p.x) < 20000 && Math.abs(p.z) < 20000)).toBe(true);

      fs.unlinkSync(extremePath);
    });

    it('sets inPit from info1 bit 17, not the status byte bit 7', () => {
      const pitPath = path.join(tempDir, 'in_pit.vcr');
      const slices = [
        { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, throttle: 40, brake: 0 },
        { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, throttle: 40, brake: 0 },
      ];
      const buf = createSliceVcrBuffer({ slices });

      // Set the unrelated status bit on the first packet; it must not imply pit lane.
      // Each slice structure: 6 (sTime+nEvents) + 4 (evHdr) + 1 (evPad) + 65 (evData) = 76 bytes
      // Stream starts at byte 57 of file, first 4 bytes are streamPrefix
      // Event data starts at: 57 + 4 + 6 + 4 + 1 = 72 for slice 0's evData
      // Slice 1's evData starts at: 72 + 65 + 6 + 4 + 1 = 148
      // Status byte is at evData[38].
      const sliceSize = 6 + 4 + 1 + 65; // 76
      const slice0EvDataStart = 57 + 4 + 6 + 4 + 1;
      const slice1EvDataStart = 57 + 4 + sliceSize + 6 + 4 + 1; // 57+4+76+6+4+1 = 148
      buf[slice0EvDataStart + 38] = 0x80;
      // The authoritative pit-lane bit is info1 bit 17 at the payload start.
      buf.writeUInt32LE(1 << 17, slice1EvDataStart);

      fs.writeFileSync(pitPath, buf);

      const traj = extractReplayTrajectory(pitPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.pointsCount).toBe(2);
      expect(traj.points[0].inPit).toBeFalsy();
      expect(traj.points[1].inPit).toBe(true);

      fs.unlinkSync(pitPath);
    });
  });


  describe('VCR timing packet and XML cross-validation unit tests', () => {
    it('validates VCR sz=21 timing packets match XML lap timings and sector splits identically without regression', () => {
      // Mock XML lap data structure
      const mockXmlLaps = [
        { num: 1, et: 120.0, s1: 25.500, s2: 34.250, s3: 47.125, lapTime: 106.875 },
        { num: 2, et: 226.875, s1: 21.100, s2: 32.400, s3: 46.500, lapTime: 100.000 },
        { num: 3, et: 326.875, s1: 20.800, s2: 32.100, s3: 46.200, lapTime: 99.100 },
      ];

      // Build corresponding slices with motion (sz=65) and timing (sz=21) packets
      const slices: MockSlice[] = [];
      let t = 13.125; // start of lap 1

      // Lap 1
      slices.push({ sTime: t, driverSlot: 1, x: 1.45, y: 0, z: 10.80 });
      t += 25.500;
      slices.push({ sTime: t, driverSlot: 1, x: 50, y: 0, z: 100, timing: { splitSec: 25.500, sector: 1, lapIdx: 0 } });
      t += 34.250;
      slices.push({ sTime: t, driverSlot: 1, x: -50, y: 0, z: -100, timing: { splitSec: 59.750, sector: 2, lapIdx: 0 } });
      t += 47.125;
      slices.push({ sTime: t, driverSlot: 1, x: 1.45, y: 0, z: 10.80, timing: { splitSec: 106.875, sector: 0, lapIdx: 0 } });

      // Lap 2
      t += 21.100;
      slices.push({ sTime: t, driverSlot: 1, x: 50, y: 0, z: 100, timing: { splitSec: 21.100, sector: 1, lapIdx: 1 } });
      t += 32.400;
      slices.push({ sTime: t, driverSlot: 1, x: -50, y: 0, z: -100, timing: { splitSec: 53.500, sector: 2, lapIdx: 1 } });
      t += 46.500;
      slices.push({ sTime: t, driverSlot: 1, x: 1.45, y: 0, z: 10.80, timing: { splitSec: 100.000, sector: 0, lapIdx: 1 } });

      // Lap 3
      t += 20.800;
      slices.push({ sTime: t, driverSlot: 1, x: 50, y: 0, z: 100, timing: { splitSec: 20.800, sector: 1, lapIdx: 2 } });
      t += 32.100;
      slices.push({ sTime: t, driverSlot: 1, x: -50, y: 0, z: -100, timing: { splitSec: 52.900, sector: 2, lapIdx: 2 } });
      t += 46.200;
      slices.push({ sTime: t, driverSlot: 1, x: 1.45, y: 0, z: 10.80, timing: { splitSec: 99.100, sector: 0, lapIdx: 2 } });

      const tmpVcr = path.join(tempDir, 'timing_cross_val_test.vcr');
      fs.writeFileSync(tmpVcr, createSliceVcrBuffer({
        slices,
        drivers: [{ name: 'Samuel Lague', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' }],
      }));

      const traj = extractReplayTrajectory(tmpVcr, { driverSlot: 1 });
      expect(traj.laps).toBeDefined();
      expect(traj.laps?.length).toBe(3);

      for (let i = 0; i < 3; i++) {
        const vcrLap = traj.laps![i];
        const xmlLap = mockXmlLaps[i];
        expect(vcrLap.lapNumber).toBe(xmlLap.num);
        expect(vcrLap.lapTimeSec).toBeCloseTo(xmlLap.lapTime, 3);
        expect(vcrLap.s1Sec).toBeCloseTo(xmlLap.s1, 3);
        expect(vcrLap.s2Sec).toBeCloseTo(xmlLap.s2, 3);
        expect(vcrLap.s3Sec).toBeCloseTo(xmlLap.s3, 3);
      }

      // Lap 3 is the fastest lap (99.1s)
      expect(traj.laps![2].isBest).toBe(true);

      fs.unlinkSync(tmpVcr);
    });

    it('ignores aborted incomplete laps flushed at session end with negative splitSec and small distance', () => {
      const slices: MockSlice[] = [];
      let t = 0;
      // Lap 1 (valid flying lap, 100s)
      slices.push({ sTime: t, driverSlot: 1, x: 0, y: 0, z: 0 });
      t += 50;
      slices.push({ sTime: t, driverSlot: 1, x: 500, y: 0, z: 500, timing: { splitSec: 50.0, sector: 1, lapIdx: 0 } });
      t += 50;
      slices.push({ sTime: t, driverSlot: 1, x: 0, y: 0, z: 0, timing: { splitSec: 100.0, sector: 0, lapIdx: 0 } });

      // Session end flush event (e.g. car travels only 15m in 5 seconds and disconnects/ESCs)
      t += 5;
      slices.push({ sTime: t, driverSlot: 1, x: 15, y: 0, z: 0, timing: { splitSec: -1, sector: 0, lapIdx: 1 } });

      const tmpVcr = path.join(tempDir, 'aborted_lap_unit_test.vcr');
      fs.writeFileSync(tmpVcr, createSliceVcrBuffer({
        slices,
        drivers: [{ name: 'Test Driver', vehicleId: 'V1', team: 'Test Team', carNumber: '1' }],
      }));

      const traj = extractReplayTrajectory(tmpVcr, { driverSlot: 1 });
      expect(traj.laps).toBeDefined();
      // Should have only 1 valid completed lap, filtering out the aborted session-end flush
      expect(traj.laps!.length).toBe(1);
      expect(traj.laps![0].lapTimeSec).toBeCloseTo(100.0, 1);

      fs.unlinkSync(tmpVcr);
    });
  });

  // Test against real files if present
  const steamReplaysDir = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
  const realFile = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 1.Vcr');
  const hasRealFiles = fs.existsSync(realFile);

  describe.skipIf(!hasRealFiles || !runRealReplayTests)('real replay file tests', () => {
    it('parses real Laguna Seca replay in under 10ms', () => {
        const t0 = performance.now();
        const meta = parseReplayMetadata(realFile);
        const elapsed = performance.now() - t0;

        expect(elapsed).toBeLessThan(50);
        expect(meta.trackName).toBe('LagunaSeca_2026');
        expect(meta.eventInfo?.session).toBe('RACE');
        expect(meta.drivers.length).toBeGreaterThan(0);
      });

      const realFile2 = [
        path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 4.Vcr'),
        path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca Q1 2.Vcr'),
        path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 2.Vcr'),
      ].find(p => fs.existsSync(p));
      if (realFile2 && fs.existsSync(realFile2)) {
        it('extracts real Laguna Seca trajectory with dynamic speed, multi-lap detection, and sectors', () => {
          const traj = extractReplayTrajectory(realFile2, { maxPoints: 500 });
          expect(traj.pointsCount).toBeGreaterThan(100);
          expect(traj.driverName).toContain('Samuel');
          const maxSpeed = Math.max(...traj.points.map(p => p.speedKmh || 0));
          const maxThrottle = Math.max(...traj.points.map(p => p.throttle || 0));
          expect(maxSpeed).toBeGreaterThan(150); // reaching over 200 km/h
          expect(maxThrottle).toBeGreaterThan(50); // realistic throttle application
          expect(traj.bounds.spanX).toBeGreaterThan(200);

          // Lap detection and sectors
          expect(traj.laps).toBeDefined();
          expect(traj.laps?.length).toBeGreaterThan(1);
          expect(traj.currentLap).toBeDefined();
          expect(traj.sectors).toBeDefined();
          expect(traj.sectors?.s1Frame).toBeGreaterThan(0);
          expect(traj.sectors?.s2Frame).toBeGreaterThan(traj.sectors?.s1Frame || 0);

          // Switching to Lap 2
          const lap2Traj = extractReplayTrajectory(realFile2, { maxPoints: 500, lapNumber: 2 });
          expect(lap2Traj.currentLap).toBe(2);
          expect(lap2Traj.points.length).toBe(500);
        });
      }

      const imolaFile = path.join(steamReplaysDir, 'Autodromo Enzo e Dino Ferrari R1 8.Vcr');
      const imolaXmlFile = path.join(process.env.PROGRAMFILES_X86 || 'C:\\Program Files (x86)', 'Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results\\2026_09_04_14_15_58-09R1.xml');
      if (runRealReplayTests && fs.existsSync(imolaFile)) {
        it('detects all 16 laps independently in full 360MB+ race replay without truncation', () => {
          const traj = extractReplayTrajectory(imolaFile, {
            playerName: 'Samuel',
          });
          expect(traj.laps).toBeDefined();
          expect(traj.laps?.length).toBe(16);
          expect(traj.laps?.[0].lapTimeSec).toBeGreaterThan(100);
          expect(traj.laps?.[1].lapTimeSec).toBeCloseTo(102.16, 1);
          expect(traj.laps?.[12].lapTimeSec).toBeCloseTo(100.52, 1);
          expect(traj.laps?.[12].isBest).toBe(true);

          // Start/Finish line coordinate must be situated on the front pit straight (~ 1.45, 10.80),
          // not at the Tamburello regression (z ~ -319)
          const lap2 = extractReplayTrajectory(imolaFile, { playerName: 'Samuel', lapNumber: 2 });
          expect(lap2.points[0].x).toBeCloseTo(1.45, 0);
          expect(Math.abs(lap2.points[0].z - 10.80)).toBeLessThan(5);
          expect(lap2.points[0].z).toBeGreaterThan(0);
        });

        if (runRealReplayTests && fs.existsSync(imolaXmlFile)) {
          it('validates VCR extracted lap timings match official XML results for every lap', () => {
            const traj = extractReplayTrajectory(imolaFile, { playerName: 'Samuel' });
            expect(traj.laps?.length).toBe(16);

            const xmlContent = fs.readFileSync(imolaXmlFile, 'utf8');
            const samuelIdx = xmlContent.indexOf('<Name>Samuel Lague</Name>');
            expect(samuelIdx).toBeGreaterThan(-1);
            const driverEndIdx = xmlContent.indexOf('</Driver>', samuelIdx);
            const driverSection = xmlContent.slice(samuelIdx, driverEndIdx);
            const lapRegex = /<Lap\s+([^>]+)>([^<]*)<\/Lap>/g;
            const lapMatches = Array.from(driverSection.matchAll(lapRegex));
            expect(lapMatches.length).toBe(16);

            for (let i = 0; i < 16; i++) {
              const attrs = lapMatches[i][1];
              const text = lapMatches[i][2].trim();
              const xmlLapNum = parseInt(attrs.match(/num="(\d+)"/)?.[1] || '0', 10);
              const xmlLapTime = text !== '--.----' && text !== '' ? parseFloat(text) : null;
              const xmlS1 = parseFloat(attrs.match(/s1="([\d\.]+)"/)?.[1] || '0');
              const xmlS2 = parseFloat(attrs.match(/s2="([\d\.]+)"/)?.[1] || '0');
              const s3Match = attrs.match(/s3="([\d\.]+)"/);
              const xmlS3 = s3Match ? parseFloat(s3Match[1]) : null;

              const vcrLap = traj.laps?.[i];
              expect(vcrLap?.lapNumber).toBe(xmlLapNum);

              if (xmlLapTime !== null && vcrLap?.lapTimeSec) {
                expect(vcrLap.lapTimeSec).toBeCloseTo(xmlLapTime, 1);
              }
              if (vcrLap?.s1Sec && xmlS1 > 0) {
                expect(vcrLap.s1Sec).toBeCloseTo(xmlS1, 1);
              }
              if (vcrLap?.s2Sec && xmlS2 > 0) {
                expect(vcrLap.s2Sec).toBeCloseTo(xmlS2, 1);
              }
              if (vcrLap?.s3Sec && xmlS3 !== null) {
                expect(vcrLap.s3Sec).toBeCloseTo(xmlS3, 1);
              }
            }
          });
        }
      }

      const daytonaQ1File = path.join(steamReplaysDir, 'Daytona International Speedway Road Course Q1 6.Vcr');
      if (runRealReplayTests && fs.existsSync(daytonaQ1File)) {
        it('detects multiple distinct ~1:47-1:48 laps on Daytona Q1 replay instead of collapsing into single 11-minute lap', () => {
          // Autonomous extraction without any sessionLaps provided
          const traj = extractReplayTrajectory(daytonaQ1File, { maxPoints: 500 });
          expect(traj.laps).toBeDefined();
          const laps = traj.laps!;
          expect(laps.length).toBe(5);
          // Lap 1 is outlap from pit lane
          expect(laps[0].isOutlap).toBe(true);
          expect(laps[0].lapTimeSec).toBeGreaterThan(120);

          // Autonomous flying laps are ~1:47 - 1:48 (107s - 109s), matching official timing without relying on XML
          expect(laps[1].isOutlap).toBe(false);
          expect(laps[1].lapTimeSec).toBeCloseTo(108.9, 0); // ~1:48.9
          expect(laps[2].lapTimeSec).toBeCloseTo(108.0, 0); // ~1:48.0
          expect(laps[3].lapTimeSec).toBeCloseTo(107.3, 0); // ~1:47.3
          expect(laps[4].lapTimeSec).toBeCloseTo(107.1, 0); // ~1:47.1
          expect(laps[4].isBest).toBe(true);
        });
      }

      const daytonaR1File = path.join(steamReplaysDir, 'Daytona International Speedway Road Course R1 6.Vcr');
      if (runRealReplayTests && fs.existsSync(daytonaQ1File) && fs.existsSync(daytonaR1File)) {
        it('synchronizes lap start position between Race (rolling start) and Qualifying replays within < 2 meters', () => {
          const q1Traj = extractReplayTrajectory(daytonaQ1File, { maxPoints: 0, lapNumber: 2 });
          const r1Traj = extractReplayTrajectory(daytonaR1File, { maxPoints: 0, lapNumber: 2 });

          expect(q1Traj.points.length).toBeGreaterThan(0);
          expect(r1Traj.points.length).toBeGreaterThan(0);

          const q1Start = q1Traj.points[0];
          const r1Start = r1Traj.points[0];
          const distanceMeters = Math.hypot(q1Start.x - r1Start.x, q1Start.z - r1Start.z);

          // Before synchronization, laps were offset by 787+ meters due to rolling start formation lap!
          // Now, both Q1 and R1 flying laps begin at the exact physical Start/Finish line (< 2 meters deviation).
          expect(distanceMeters).toBeLessThan(2);
        });
      }

      const bahrainPaddockFile = path.join(steamReplaysDir, 'Bahrain Paddock Circuit R1 2.Vcr');
      const bahrainGpFile = [
        path.join(steamReplaysDir, 'Bahrain International Circuit Q1 1.Vcr'),
        path.join(steamReplaysDir, 'Bahrain International Circuit R1 1.Vcr'),
        path.join(steamReplaysDir, 'Bahrain International Circuit P1 14.Vcr'),
      ].find(p => fs.existsSync(p));
      if (runRealReplayTests && fs.existsSync(bahrainPaddockFile) && bahrainGpFile && fs.existsSync(bahrainGpFile)) {
        it('uses official simulation timing loop coordinates for Bahrain Paddock vs Grand Prix layouts', () => {
          const paddockTraj = extractReplayTrajectory(bahrainPaddockFile, { maxPoints: 0, lapNumber: 2 });
          const gpTraj = extractReplayTrajectory(bahrainGpFile, { maxPoints: 0, lapNumber: 2 });

          expect(paddockTraj.points.length).toBeGreaterThan(0);
          expect(gpTraj.points.length).toBeGreaterThan(0);

          // Paddock layout starts on the paddock straight (~ -218, -270)
          expect(paddockTraj.points[0].x).toBeCloseTo(-218.5, 0);
          expect(paddockTraj.points[0].z).toBeCloseTo(-270.5, 0);
        });
      }

      const spaR1File = path.join(steamReplaysDir, 'Circuit de Spa-Francorchamps R1 35.Vcr');
      if (runRealReplayTests && fs.existsSync(spaR1File)) {
        it('detects all 14+ racing laps in Spa race replay instead of collapsing into single 33-minute lap', () => {
          const traj = extractReplayTrajectory(spaR1File, { maxPoints: 500 });
          expect(traj.driverSlot).toBe(32);
          expect(traj.driverName).toContain('Samuel Lague');
          const laps = traj.laps!;
          expect(laps.length).toBeGreaterThanOrEqual(14);
          expect(laps[0].isOutlap).toBe(true);
          // Racing laps are ~2:09 - 2:22 (129s - 142s)
          expect(laps[1].lapTimeSec).toBeCloseTo(134.0, 0);
          expect(laps[2].lapTimeSec).toBeCloseTo(138.4, 0);
          expect(laps[3].lapTimeSec).toBeCloseTo(132.6, 0);
        });
      }

      it('gracefully handles replays without timing packets by producing a single continuous trajectory lap', () => {
        const slices: MockSlice[] = [];
        let t = 0;
        for (let i = 0; i < 20; i++) {
          t += 1.0;
          slices.push({
            sTime: t,
            driverSlot: 1,
            x: 0,
            y: 0,
            z: -100 + i * 5,
            pitLimiter: true,
            throttle: 40,
            brake: 0,
          });
        }

        const noTimingVcr = path.join(tempDir, 'no_timing_test.vcr');
        fs.writeFileSync(noTimingVcr, createSliceVcrBuffer({ slices }));
        const traj = extractReplayTrajectory(noTimingVcr, { driverSlot: 1 });
        expect(traj.laps!.length).toBe(1);
        expect(traj.laps![0].lapNumber).toBe(1);
        fs.unlinkSync(noTimingVcr);
      });

      it('notifies onProgress callback in chronological order across parsing stages', () => {
        const stages: string[] = [];
        const percents: number[] = [];
        extractReplayTrajectory(tempVcrPath, {
          driverSlot: 1,
          onProgress: (p) => {
            stages.push(p.stage);
            percents.push(p.percent);
          },
        });

        expect(stages).toContain('header');
        expect(stages).toContain('metadata');
        expect(stages).toContain('stream_init');
        expect(stages).toContain('stream_decoding');
        expect(stages).toContain('lap_analysis');
        expect(stages).toContain('downsampling');

        const firstHeader = stages.indexOf('header');
        const firstMeta = stages.indexOf('metadata');
        const firstStreamInit = stages.indexOf('stream_init');
        const firstDecode = stages.indexOf('stream_decoding');
        const firstLapAnalysis = stages.indexOf('lap_analysis');
        const firstDownsample = stages.indexOf('downsampling');

        expect(firstHeader).toBeLessThan(firstMeta);
        expect(firstMeta).toBeLessThan(firstStreamInit);
        expect(firstStreamInit).toBeLessThan(firstDecode);
        expect(firstDecode).toBeLessThan(firstLapAnalysis);
        expect(firstLapAnalysis).toBeLessThan(firstDownsample);
        expect(percents[percents.length - 1]).toBe(100);
      });
    });

});
