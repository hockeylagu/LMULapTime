import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseReplayMetadata, extractReplayTrajectory, mapVehicleIdToModel } from '../../server/replayParser';

function createMockVcrBuffer(): Buffer {
  const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
  const headerBuf = Buffer.from(headerText, 'ascii'); // 45 bytes
  const irsrBuf = Buffer.from('IRSR', 'ascii'); // 4 bytes
  const verBuf = Buffer.alloc(4);
  verBuf.writeUInt32LE(0x80000008, 0); // 4 bytes

  // Frames block: 3 frames for car slot 1
  const frames: Buffer[] = [];
  const coords = [
    { x: 100.0, y: 10.0, z: 200.0, rotY: 1.57 },
    { x: 120.0, y: 10.2, z: 215.0, rotY: 1.60 },
    { x: 145.0, y: 10.5, z: 230.0, rotY: 1.65 },
  ];

  for (const c of coords) {
    const frame = Buffer.alloc(70);
    frame[0] = 1; // slot 1
    frame[1] = 0x41;
    frame[2] = 0x10;
    frame[3] = 0x04;
    // live inputs (info1) at offset 4 (steer, throttle, inPit)
    frame.writeUInt32LE(0 | (30 << 11) | (150 << 18), 4);
    // x, y, z at 46, 50, 54
    frame.writeFloatLE(c.x, 46);
    frame.writeFloatLE(c.y, 50);
    frame.writeFloatLE(c.z, 54);
    // rotY at 62
    frame.writeFloatLE(c.rotY, 62);
    frames.push(frame);
  }

  const framesBuf = Buffer.concat(frames);

  // Metadata block
  const eventJson = JSON.stringify({
    eventTitle: 'LMGT3 Fixed',
    eventType: 'daily',
    splitNo: 2,
    session: 'PRACTICE',
  });

  function makeStr4(str: string): Buffer {
    const sBuf = Buffer.from(str, 'utf8');
    const lBuf = Buffer.alloc(4);
    lBuf.writeUInt32LE(sBuf.length, 0);
    return Buffer.concat([lBuf, sBuf]);
  }

  const metaParts: Buffer[] = [
    makeStr4(eventJson),
    makeStr4('MOCK.SCN'),
    makeStr4('MOCK.AIW'),
    makeStr4('Mock_Track_2026'),
    makeStr4('1.00'),
    makeStr4('hash_abc123'),
    makeStr4('C:\\Tracks\\Mock_Track'),
  ];

  // Drivers string region:
  const driverStrings = [
    'Samuel Lague',
    '21_26_AFCO95641716',
    'Vista AF Corsa',
    '21',
    'Test Rival',
    '32_26_WRT_83524148',
    'Team WRT',
    '32',
  ];

  const driverParts: Buffer[] = [];
  for (const s of driverStrings) {
    driverParts.push(Buffer.from(s, 'utf8'));
    driverParts.push(Buffer.from([0])); // null delimiter
  }

  const driverBuf = Buffer.concat(driverParts);
  metaParts.push(driverBuf);

  // Trailer (28 bytes)
  const trailer = Buffer.alloc(28);
  trailer.writeUInt32LE(3, 4); // timeSliceCount = 3
  trailer.writeUInt32LE(15, 8); // totalEvents = 15
  trailer.writeFloatLE(10.0, 12); // startTime
  trailer.writeFloatLE(100.5, 16); // endTime

  metaParts.push(trailer);
  const metadataBuf = Buffer.concat(metaParts);

  // Offset to metadata: header (45) + irsr (4) + ver (4) + offset (4) = 57 + framesBuf.length
  const metaOffset = 57 + framesBuf.length;
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(metaOffset, 0);

  return Buffer.concat([
    headerBuf,
    irsrBuf,
    verBuf,
    offsetBuf,
    framesBuf,
    metadataBuf,
  ]);
}

describe('replayParser', () => {
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_temp');
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

  describe('mapVehicleIdToModel', () => {
    it('correctly maps known vehicle skin tokens to friendly model names', () => {
      expect(mapVehicleIdToModel('21_26_AFCO95641716')).toBe('Ferrari 296 GT3');
      expect(mapVehicleIdToModel('32_26_WRT_83524148')).toBe('BMW M4 GT3');
      expect(mapVehicleIdToModel('397_25_MUSTANG')).toBe('Ford Mustang GT3');
      expect(mapVehicleIdToModel('23_26_THOR59931582')).toBe('Aston Martin Vantage GT3');
      expect(mapVehicleIdToModel('91_26_MANT18218509')).toBe('Porsche 911 GT3 R');
      expect(mapVehicleIdToModel('58_26_GARA17941687')).toBe('McLaren 720S GT3 Evo');
      expect(mapVehicleIdToModel('61_26_IRON57024276')).toBe('Lamborghini Huracan GT3 Evo2');
      expect(mapVehicleIdToModel('50_26_499P_123456')).toBe('Ferrari 499P');
      expect(mapVehicleIdToModel('992S_PC')).toBe('Porsche 992 (Safety Car)');
    });

    it('handles empty or unknown IDs gracefully', () => {
      expect(mapVehicleIdToModel('')).toBe('Unknown Vehicle');
      expect(mapVehicleIdToModel(undefined)).toBe('Unknown Vehicle');
      expect(mapVehicleIdToModel('CustomMod_Vehicle_X')).toBe('CustomMod_Vehicle_X');
    });
  });

  describe('parseReplayMetadata', () => {
    it('parses mock replay metadata accurately', () => {
      const meta = parseReplayMetadata(tempVcrPath);
      expect(meta.filename).toBe('Test_Replay_P1.Vcr');
      expect(meta.eventInfo).toEqual({
        eventTitle: 'LMGT3 Fixed',
        eventType: 'daily',
        splitNo: 2,
        session: 'PRACTICE',
      });
      expect(meta.scn).toBe('MOCK.SCN');
      expect(meta.aiw).toBe('MOCK.AIW');
      expect(meta.trackName).toBe('Mock_Track_2026');
      expect(meta.trackVersion).toBe('1.00');
      expect(meta.timeSliceCount).toBe(3);
      expect(meta.totalEvents).toBe(15);
      expect(meta.durationSec).toBeCloseTo(90.5, 1);
      expect(meta.drivers.length).toBeGreaterThanOrEqual(1);

      const samuel = meta.drivers.find(d => d.name === 'Samuel Lague');
      expect(samuel).toBeDefined();
      expect(samuel?.carModel).toBe('Ferrari 296 GT3');
      expect(samuel?.team).toBe('Vista AF Corsa');
      expect(samuel?.carNumber).toBe('21');
    });

    it('throws error for invalid files', () => {
      const invalidPath = path.join(tempDir, 'invalid.vcr');
      fs.writeFileSync(invalidPath, Buffer.from('NOT A REPLAY FILE AT ALL'));
      expect(() => parseReplayMetadata(invalidPath)).toThrow(/Invalid LMU replay file/);
      fs.unlinkSync(invalidPath);
    });
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
  });

  // Test against real files if present
  const steamReplaysDir = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
  const realFile = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 1.Vcr');

  if (fs.existsSync(realFile)) {
    describe('real replay file tests', () => {
      it('parses real Laguna Seca replay in under 10ms', () => {
        const t0 = performance.now();
        const meta = parseReplayMetadata(realFile);
        const elapsed = performance.now() - t0;

        expect(elapsed).toBeLessThan(50);
        expect(meta.trackName).toBe('LagunaSeca_2026');
        expect(meta.eventInfo?.session).toBe('RACE');
        expect(meta.drivers.length).toBeGreaterThan(0);
      });

      const realFile2 = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 2.Vcr');
      if (fs.existsSync(realFile2)) {
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
    });
  }
});
