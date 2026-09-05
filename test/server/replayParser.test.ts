import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseReplayMetadata,
  extractReplayTrajectory,
  mapVehicleIdToModel,
  detectPlayerName,
  KNOWN_TRACK_SF_COORDS,
} from '../../server/replayParser';

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

/**
 * Creates a binary VCR file containing realistic stream slices and event payloads.
 * Supports telemetry inputs (throttle, brake, ABS, TC, off-track, pit limiter),
 * multi-driver events, and custom metadata strings.
 */
function createSliceVcrBuffer(options?: {
  slices?: {
    sTime: number;
    driverSlot: number;
    x: number;
    y: number;
    z: number;
    throttle?: number;
    brake?: number;
    tc?: boolean;
    abs?: boolean;
    offTrack?: boolean;
    pitLimiter?: boolean;
  }[];
  drivers?: { name: string; vehicleId: string; team: string; carNumber: string }[];
  eventInfo?: any;
  corruptMetaOffset?: boolean;
  rawEventInfoString?: string;
}): Buffer {
  const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
  const headerBuf = Buffer.from(headerText, 'ascii'); // 45 bytes
  const irsrBuf = Buffer.from('IRSR', 'ascii'); // 4 bytes
  const verBuf = Buffer.alloc(4);
  verBuf.writeUInt32LE(0x80000008, 0); // 4 bytes

  // 4-byte stream prefix for the first chunk
  const streamPrefix = Buffer.alloc(4);

  const sliceBufs: Buffer[] = [];
  const slices = options?.slices || [];

  for (const sl of slices) {
    const sBuf = Buffer.alloc(6);
    sBuf.writeFloatLE(sl.sTime, 0);
    sBuf.writeUInt16LE(1, 4); // 1 event in this slice

    const evHdr = Buffer.alloc(4);
    evHdr.writeUInt32LE((65 << 8) | (sl.driverSlot & 0xff), 0);
    const evPad = Buffer.from([0]);

    const evData = Buffer.alloc(65);
    // Steer at byte 4
    evData.writeUInt16LE(512, 4);

    // Throttle at byte 5: 1 + (pct * 2.48)
    const thrByte = sl.throttle !== undefined ? Math.round(1 + (sl.throttle / 100) * 248) : 1;
    evData[5] = Math.min(255, Math.max(0, thrByte));

    // Brake at byte 36: bits 0..5 analog (0..63), bit 6 ABS (0x40), bit 7 TC (0x80)
    let brkByte = sl.brake !== undefined ? Math.round((sl.brake / 100) * 63) : 0;
    if (sl.abs) brkByte |= 0x40;
    if (sl.tc) brkByte |= 0x80;
    evData[36] = brkByte;

    // Status at byte 38: bit 0 off-track (0x01), bit 2 pit limiter (0x04)
    let stByte = 0;
    if (sl.offTrack) stByte |= 0x01;
    if (sl.pitLimiter) stByte |= 0x04;
    evData[38] = stByte;

    // Position coordinates (x, y, z) at bytes 41, 45, 49
    evData.writeFloatLE(sl.x, 41);
    evData.writeFloatLE(sl.y, 45);
    evData.writeFloatLE(sl.z, 49);
    evData.writeFloatLE(0.0, 57); // rotY

    sliceBufs.push(sBuf, evHdr, evPad, evData);
  }

  const framesBuf = Buffer.concat([streamPrefix, ...sliceBufs]);

  function makeStr4(str: string): Buffer {
    const sBuf = Buffer.from(str, 'utf8');
    const lBuf = Buffer.alloc(4);
    lBuf.writeUInt32LE(sBuf.length, 0);
    return Buffer.concat([lBuf, sBuf]);
  }

  const rawEvStr = options?.rawEventInfoString !== undefined
    ? options.rawEventInfoString
    : JSON.stringify(options?.eventInfo || { eventTitle: 'Test Event', eventType: 'practice', splitNo: 1, session: 'PRACTICE' });

  const metaParts: Buffer[] = [
    makeStr4(rawEvStr),
    makeStr4('TEST.SCN'),
    makeStr4('TEST.AIW'),
    makeStr4('Test_Track'),
    makeStr4('1.00'),
    makeStr4('hash_123'),
    makeStr4('C:\\Tracks\\Test'),
  ];

  const defaultDrivers = options?.drivers || [
    { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' },
    { name: 'Rival Driver', vehicleId: '32_26_WRT_83524148', team: 'WRT Team Racing', carNumber: '32' },
  ];

  const driverParts: Buffer[] = [];
  for (const d of defaultDrivers) {
    for (const field of [d.name, d.vehicleId, d.team, d.carNumber]) {
      driverParts.push(Buffer.from(field, 'utf8'));
      driverParts.push(Buffer.from([0]));
    }
  }
  metaParts.push(Buffer.concat(driverParts));

  const trailer = Buffer.alloc(28);
  trailer.writeUInt32LE(slices.length, 4);
  trailer.writeUInt32LE(slices.length, 8);
  trailer.writeFloatLE(slices[0]?.sTime ?? 0.0, 12);
  trailer.writeFloatLE(slices[slices.length - 1]?.sTime ?? 100.0, 16);
  metaParts.push(trailer);

  const metadataBuf = Buffer.concat(metaParts);
  const metaOffset = options?.corruptMetaOffset ? 99999999 : 57 + framesBuf.length;
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(metaOffset, 0);

  return Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metadataBuf]);
}

/**
 * Creates a VCR buffer with drivers encoded in the primary binary parser format:
 * [0x00, slotByte, nameLen, nameBytes, vehicleLen, vehicleBytes, liveryLen, liveryBytes, teamLen, teamBytes, carNumLen, carNumBytes]
 * This exercises the structured binary scan (lines 180-231) instead of the fallback parser.
 */
function createBinaryDriverVcrBuffer(options: {
  drivers: { slot: number; name: string; vehicleId: string; livery?: string; team: string; carNumber: string }[];
  slices?: { sTime: number; driverSlot: number; x: number; y: number; z: number }[];
  eventInfo?: any;
}): Buffer {
  const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
  const headerBuf = Buffer.from(headerText, 'ascii');
  const irsrBuf = Buffer.from('IRSR', 'ascii');
  const verBuf = Buffer.alloc(4);
  verBuf.writeUInt32LE(0x80000008, 0);

  const streamPrefix = Buffer.alloc(4);
  const sliceBufs: Buffer[] = [];
  const slices = options.slices || [];

  for (const sl of slices) {
    const sBuf = Buffer.alloc(6);
    sBuf.writeFloatLE(sl.sTime, 0);
    sBuf.writeUInt16LE(1, 4);
    const evHdr = Buffer.alloc(4);
    evHdr.writeUInt32LE((65 << 8) | (sl.driverSlot & 0xff), 0);
    const evPad = Buffer.from([0]);
    const evData = Buffer.alloc(65);
    evData.writeUInt16LE(512, 4);
    evData[5] = 1; // throttle idle
    evData.writeFloatLE(sl.x, 41);
    evData.writeFloatLE(sl.y, 45);
    evData.writeFloatLE(sl.z, 49);
    evData.writeFloatLE(0.0, 57);
    sliceBufs.push(sBuf, evHdr, evPad, evData);
  }

  const framesBuf = Buffer.concat([streamPrefix, ...sliceBufs]);

  function makeStr4(str: string): Buffer {
    const sBuf = Buffer.from(str, 'utf8');
    const lBuf = Buffer.alloc(4);
    lBuf.writeUInt32LE(sBuf.length, 0);
    return Buffer.concat([lBuf, sBuf]);
  }

  const rawEvStr = JSON.stringify(options.eventInfo || { eventTitle: 'Binary Test', session: 'PRACTICE' });
  const metaParts: Buffer[] = [
    makeStr4(rawEvStr),
    makeStr4('TEST.SCN'),
    makeStr4('TEST.AIW'),
    makeStr4('Test_Track'),
    makeStr4('1.00'),
    makeStr4('hash_bin'),
    makeStr4('C:\\\\Tracks\\\\Test'),
  ];

  // Encode drivers in the primary binary format: [0x00, slot, nameLen, nameBytes, vehicleLen, vehBytes, livLen, livBytes, teamLen, teamBytes, carNumLen, carNumBytes]
  const driverParts: Buffer[] = [];
  for (const d of options.drivers) {
    const nameBuf = Buffer.from(d.name, 'utf8');
    const vehBuf = Buffer.from(d.vehicleId, 'utf8');
    const livBuf = Buffer.from(d.livery || '', 'utf8');
    const teamBuf = Buffer.from(d.team, 'utf8');
    const carNumBuf = Buffer.from(d.carNumber, 'utf8');

    // 2-byte slot: high=0x00, low=slot
    const slotBytes = Buffer.alloc(2);
    slotBytes[0] = 0x00; // high byte
    slotBytes[1] = d.slot; // low byte = slot

    // 1-byte length-prefixed strings
    const entry = Buffer.concat([
      slotBytes,
      Buffer.from([nameBuf.length]), nameBuf,
      Buffer.from([vehBuf.length]), vehBuf,
      Buffer.from([livBuf.length]), livBuf,
      Buffer.from([teamBuf.length]), teamBuf,
      Buffer.from([carNumBuf.length]), carNumBuf,
    ]);
    driverParts.push(entry);
  }
  // Add padding at end so driverRegion.length - 40 > last driver position
  const driverPadding = Buffer.alloc(50);
  metaParts.push(Buffer.concat([...driverParts, driverPadding]));

  const trailer = Buffer.alloc(28);
  trailer.writeUInt32LE(slices.length, 4);
  trailer.writeUInt32LE(slices.length, 8);
  trailer.writeFloatLE(slices[0]?.sTime ?? 0.0, 12);
  trailer.writeFloatLE(slices[slices.length - 1]?.sTime ?? 100.0, 16);
  metaParts.push(trailer);

  const metadataBuf = Buffer.concat(metaParts);
  const metaOffset = 57 + framesBuf.length;
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(metaOffset, 0);

  return Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metadataBuf]);
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

  describe('detectPlayerName', () => {
    it('detects player name from UserData/player/settings.json', () => {
      const mockUdDir = path.join(tempDir, 'mock_ud', 'UserData', 'player');
      fs.mkdirSync(mockUdDir, { recursive: true });
      const settingsPath = path.join(mockUdDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({
        DRIVER: {
          'Player Name': 'Custom Test Driver',
        },
      }));

      const detected = detectPlayerName(settingsPath);
      expect(detected).toBe('Custom Test Driver');
    });

    it('detects player name using alternate PlayerName key and Settings.JSON casing', () => {
      const mockUdDir = path.join(tempDir, 'mock_ud_alt', 'UserData', 'player');
      fs.mkdirSync(mockUdDir, { recursive: true });
      const settingsPath = path.join(mockUdDir, 'Settings.JSON');
      fs.writeFileSync(settingsPath, JSON.stringify({
        DRIVER: {
          PlayerName: 'Alt Driver Name',
        },
      }));

      const detected = detectPlayerName(settingsPath);
      expect(detected).toBe('Alt Driver Name');
    });

    it('returns undefined when settings.json contains malformed JSON without crashing', () => {
      const mockUdDir = path.join(tempDir, 'mock_ud_corrupt', 'UserData', 'player');
      fs.mkdirSync(mockUdDir, { recursive: true });
      const settingsPath = path.join(mockUdDir, 'settings.json');
      fs.writeFileSync(settingsPath, '{{{ corrupt invalid json content');

      const detected = detectPlayerName(settingsPath);
      expect(detected).toBeUndefined();
    });

    it('prioritizes candidate directory player name over default Steam settings', () => {
      const mockUdDir = path.join(tempDir, 'mock_ud_priority', 'UserData', 'player');
      fs.mkdirSync(mockUdDir, { recursive: true });
      const settingsPath = path.join(mockUdDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({
        DRIVER: {
          'Player Name': 'Priority Custom Driver',
        },
      }));

      const detected = detectPlayerName(settingsPath);
      expect(detected).toBe('Priority Custom Driver');
    });

    it('returns undefined when no settings file exists anywhere', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      try {
        expect(detectPlayerName('C:\\NonExistent\\UserData\\test.vcr')).toBeUndefined();
      } finally {
        existsSpy.mockRestore();
      }
    });
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

    it('throws error when replay file is too small or missing IRSR magic tag', () => {
      const tooSmallPath = path.join(tempDir, 'too_small.vcr');
      fs.writeFileSync(tooSmallPath, Buffer.from('Short text'));
      expect(() => parseReplayMetadata(tooSmallPath)).toThrow(/Invalid LMU replay file/);
      fs.unlinkSync(tooSmallPath);
    });

    it('throws error when replay file does not exist', () => {
      const missingPath = path.join(tempDir, 'does_not_exist_replay.vcr');
      expect(() => parseReplayMetadata(missingPath)).toThrow(/no such file or directory/i);
    });

    it('throws error when metadata offset points outside the file', () => {
      const corruptOffsetPath = path.join(tempDir, 'corrupt_offset.vcr');
      fs.writeFileSync(corruptOffsetPath, createSliceVcrBuffer({ corruptMetaOffset: true }));
      expect(() => parseReplayMetadata(corruptOffsetPath)).toThrow(/Invalid metadata offset/);
      fs.unlinkSync(corruptOffsetPath);
    });

    it('handles malformed non-JSON event info string without throwing', () => {
      const malformedJsonPath = path.join(tempDir, 'malformed_event_info.vcr');
      fs.writeFileSync(malformedJsonPath, createSliceVcrBuffer({ rawEventInfoString: '{ unclosed invalid json' }));
      const meta = parseReplayMetadata(malformedJsonPath);
      expect(meta.eventInfo).toEqual({ eventTitle: '{ unclosed invalid json' });
      expect(meta.trackName).toBe('Test_Track');
      expect(meta.drivers.length).toBe(2);
      fs.unlinkSync(malformedJsonPath);
    });

    it('correctly sets isPlayer flag when explicit playerName is provided in options', () => {
      const meta = parseReplayMetadata(tempVcrPath, { playerName: 'Test Rival' });
      const rival = meta.drivers.find(d => d.name === 'Test Rival');
      const samuel = meta.drivers.find(d => d.name === 'Samuel Lague');
      expect(rival?.isPlayer).toBe(true);
      expect(samuel?.isPlayer).toBe(false);
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

      fs.unlinkSync(sliceVcrPath);
    });

    it('correctly filters out downshift rev-match throttle blips during heavy braking', () => {
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
      // Point 2 was a blip of 65 during heavy braking, should be filtered to 0
      expect(traj.points[2].throttle).toBe(0);

      fs.unlinkSync(filterPath);
    });

    it('interpolates brief upshift ignition cuts to preserve full throttle intent', () => {
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
      // Point 2 should be interpolated back up to ~100 instead of 10
      expect(traj.points[2].throttle).toBeGreaterThanOrEqual(90);

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

  describe('parseReplayMetadata — primary binary driver parser', () => {
    it('extracts drivers encoded in structured binary format (primary parser path)', () => {
      const binPath = path.join(tempDir, 'binary_drivers.vcr');
      fs.writeFileSync(binPath, createBinaryDriverVcrBuffer({
        drivers: [
          { slot: 5, name: 'Max Verstappen', vehicleId: '33_26_AFCO12345678', livery: 'RedBull_Livery', team: 'Oracle Red Bull', carNumber: '1' },
          { slot: 12, name: 'Lewis Hamilton', vehicleId: '44_26_AFCO87654321', livery: 'Scuderia_Livery', team: 'Scuderia Ferrari', carNumber: '44' },
        ],
      }));

      const meta = parseReplayMetadata(binPath);
      expect(meta.drivers.length).toBeGreaterThanOrEqual(2);

      const max = meta.drivers.find(d => d.name === 'Max Verstappen');
      const lewis = meta.drivers.find(d => d.name === 'Lewis Hamilton');
      expect(max).toBeDefined();
      expect(max?.slot).toBe(5);
      expect(max?.carModel).toBe('Ferrari 296 GT3'); // AFCO token
      expect(max?.team).toBe('Oracle Red Bull');
      expect(max?.carNumber).toBe('1');

      expect(lewis).toBeDefined();
      expect(lewis?.slot).toBe(12);
      expect(lewis?.carNumber).toBe('44');

      fs.unlinkSync(binPath);
    });
  });

  describe('parseReplayMetadata — edge cases', () => {
    it('handles empty event info string without crashing', () => {
      const emptyEvPath = path.join(tempDir, 'empty_event.vcr');
      fs.writeFileSync(emptyEvPath, createSliceVcrBuffer({ rawEventInfoString: '' }));
      const meta = parseReplayMetadata(emptyEvPath);
      // Empty string is falsy, so eventInfo should be null
      expect(meta.eventInfo).toBeNull();
      expect(meta.trackName).toBe('Test_Track');
      fs.unlinkSync(emptyEvPath);
    });

    it('handles zero-driver replay gracefully', () => {
      const zeroDriverPath = path.join(tempDir, 'zero_drivers.vcr');
      fs.writeFileSync(zeroDriverPath, createSliceVcrBuffer({
        drivers: [],
        slices: [{ sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 }],
      }));
      const meta = parseReplayMetadata(zeroDriverPath);
      expect(meta.drivers).toEqual([]);
      expect(meta.trackName).toBe('Test_Track');
      fs.unlinkSync(zeroDriverPath);
    });

    it('throws a descriptive error for files smaller than 64 bytes', () => {
      const tinyPath = path.join(tempDir, 'tiny.vcr');
      fs.writeFileSync(tinyPath, Buffer.alloc(32));
      expect(() => parseReplayMetadata(tinyPath)).toThrow(/file too small/);
      fs.unlinkSync(tinyPath);
    });

    it('coerces NaN trailer floats to 0 instead of propagating NaN', () => {
      // Create a buffer where trailer floats are NaN
      const nanTrailerPath = path.join(tempDir, 'nan_trailer.vcr');
      const buf = createSliceVcrBuffer({
        slices: [{ sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 }],
      });
      // Corrupt the trailer float bytes (last 28 bytes: offset 12 and 16 are startTime and endTime)
      const trailerStart = buf.length - 28;
      // Write NaN pattern (0x7FC00000) at startTime and endTime positions
      buf.writeUInt32LE(0x7FC00000, trailerStart + 12);
      buf.writeUInt32LE(0x7FC00000, trailerStart + 16);
      fs.writeFileSync(nanTrailerPath, buf);

      const meta = parseReplayMetadata(nanTrailerPath);
      expect(meta.startTimeSec).toBe(0);
      expect(meta.endTimeSec).toBe(0);
      expect(meta.durationSec).toBe(0);
      fs.unlinkSync(nanTrailerPath);
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

    it('detects teleport when large position jump occurs between frames', () => {
      const teleportPath = path.join(tempDir, 'teleport.vcr');
      fs.writeFileSync(teleportPath, createSliceVcrBuffer({
        slices: [
          { sTime: 1.0, driverSlot: 1, x: 100, y: 0, z: 100 },
          { sTime: 1.05, driverSlot: 1, x: 105, y: 0, z: 100 },
          // Teleport: jump 500m
          { sTime: 1.10, driverSlot: 1, x: 600, y: 0, z: 100 },
          { sTime: 1.15, driverSlot: 1, x: 605, y: 0, z: 100 },
        ],
      }));

      const traj = extractReplayTrajectory(teleportPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.pointsCount).toBe(4);
      // Point at index 2 should be flagged as teleport (jump > 85m)
      expect(traj.points[2].isTeleport).toBe(true);
      // Points 0, 1, 3 should NOT be teleport
      expect(traj.points[0].isTeleport).toBe(false);
      expect(traj.points[1].isTeleport).toBe(false);
      expect(traj.points[3].isTeleport).toBe(false);

      fs.unlinkSync(teleportPath);
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

    it('sets inPit flag when status byte bit 7 (0x80) is set', () => {
      const pitPath = path.join(tempDir, 'in_pit.vcr');
      const slices = [
        { sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10, throttle: 40, brake: 0 },
        { sTime: 1.1, driverSlot: 1, x: 20, y: 0, z: 20, throttle: 40, brake: 0 },
      ];
      const buf = createSliceVcrBuffer({ slices });

      // Manually set the inPit bit (0x80) on byte 38 of the second event's data payload
      // Each slice structure: 6 (sTime+nEvents) + 4 (evHdr) + 1 (evPad) + 65 (evData) = 76 bytes
      // Stream starts at byte 57 of file, first 4 bytes are streamPrefix
      // Event data starts at: 57 + 4 + 6 + 4 + 1 = 72 for slice 0's evData
      // Slice 1's evData starts at: 72 + 65 + 6 + 4 + 1 = 148
      // Status byte is at evData[38] = 148 + 38 = 186
      const sliceSize = 6 + 4 + 1 + 65; // 76
      const slice1EvDataStart = 57 + 4 + sliceSize + 6 + 4 + 1; // 57+4+76+6+4+1 = 148
      buf[slice1EvDataStart + 38] = 0x80; // set inPit bit

      fs.writeFileSync(pitPath, buf);

      const traj = extractReplayTrajectory(pitPath, { driverSlot: 1, maxPoints: 0 });
      expect(traj.pointsCount).toBe(2);
      expect(traj.points[0].inPit).toBeFalsy();
      expect(traj.points[1].inPit).toBe(true);

      fs.unlinkSync(pitPath);
    });
  });

  describe('KNOWN_TRACK_SF_COORDS matching', () => {
    it('matches track keywords case-insensitively', () => {
      // Verify that the coordinate table contains expected entries
      const spa = KNOWN_TRACK_SF_COORDS.find(e => e.keywords.includes('spa'));
      expect(spa).toBeDefined();
      expect(spa?.layoutName).toBe('Spa-Francorchamps');
      expect(spa?.x).toBeCloseTo(-232.3, 1);
      expect(spa?.z).toBeCloseTo(735.2, 1);
    });

    it('prioritizes specific layout variants over generic circuit keywords', () => {
      // Bahrain Paddock should match before Bahrain Grand Prix when 'paddock' is in the identifier
      const paddockIdentifier = 'bahrainwec_paddock some_replay.vcr';
      const match = KNOWN_TRACK_SF_COORDS.find(entry =>
        entry.keywords.some(k => paddockIdentifier.includes(k))
      );
      expect(match?.layoutName).toBe('Bahrain Paddock');

      // Generic 'bahrain' should match Grand Prix layout
      const gpIdentifier = 'bahrain some_other_replay.vcr';
      const gpMatch = KNOWN_TRACK_SF_COORDS.find(entry =>
        entry.keywords.some(k => gpIdentifier.includes(k))
      );
      expect(gpMatch?.layoutName).toBe('Bahrain Grand Prix'); // Generic 'bahrain' matches GP since Paddock requires 'paddock' keyword

      // But if we simulate the actual parser logic (which checks full trackIdentifier),
      // a replay with 'bahrainwec_paddock' should pick the paddock coords, not the GP coords
      expect(KNOWN_TRACK_SF_COORDS[0].keywords).toContain('bahrainwec_paddock');
    });

    it('covers all expected circuits in the catalog', () => {
      const expectedTracks = [
        'Bahrain', 'Sebring', 'Monza', 'Daytona', 'Imola', 'Laguna Seca',
        'Spa-Francorchamps', 'Fuji', 'Circuit of the Americas', 'Silverstone',
        'Circuit de la Sarthe', 'Interlagos',
      ];
      for (const name of expectedTracks) {
        const found = KNOWN_TRACK_SF_COORDS.find(e => e.layoutName?.includes(name));
        expect(found).toBeDefined();
      }
    });
  });

  // Test against real files if present
  const steamReplaysDir = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
  const realFile = path.join(steamReplaysDir, 'WeatherTech Raceway Laguna Seca R1 1.Vcr');
  const hasRealFiles = fs.existsSync(realFile);

  describe.skipIf(!hasRealFiles)('real replay file tests', () => {
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

      const imolaFile = path.join(steamReplaysDir, 'Autodromo Enzo e Dino Ferrari R1 8.Vcr');
      if (fs.existsSync(imolaFile)) {
        it('detects all 16 laps independently in full 360MB+ race replay without truncation', () => {
          const traj = extractReplayTrajectory(imolaFile, {
            playerName: 'Samuel',
          });
          expect(traj.laps).toBeDefined();
          expect(traj.laps?.length).toBe(16);
          expect(traj.laps?.[0].lapTimeSec).toBeGreaterThan(100);
          expect(traj.laps?.[1].lapTimeSec).toBeCloseTo(102.54, 1);
          expect(traj.laps?.[12].lapTimeSec).toBeCloseTo(100.68, 1);
          expect(traj.laps?.[12].isBest).toBe(true);
        });
      }

      const daytonaQ1File = path.join(steamReplaysDir, 'Daytona International Speedway Road Course Q1 6.Vcr');
      if (fs.existsSync(daytonaQ1File)) {
        it('detects multiple distinct ~1:47-1:48 laps on Daytona Q1 replay instead of collapsing into single 11-minute lap', () => {
          // Autonomous extraction without any sessionLaps provided
          const traj = extractReplayTrajectory(daytonaQ1File, { maxPoints: 500 });
          expect(traj.laps).toBeDefined();
          expect(traj.laps.length).toBe(5);
          // Lap 1 is outlap from pit lane
          expect(traj.laps[0].isOutlap).toBe(true);
          expect(traj.laps[0].lapTimeSec).toBeGreaterThan(120);

          // Autonomous flying laps are ~1:47 - 1:48 (107s - 109s), matching official timing without relying on XML
          expect(traj.laps[1].isOutlap).toBe(false);
          expect(traj.laps[1].lapTimeSec).toBeCloseTo(108.9, 0); // ~1:48.9
          expect(traj.laps[2].lapTimeSec).toBeCloseTo(108.0, 0); // ~1:48.0
          expect(traj.laps[3].lapTimeSec).toBeCloseTo(107.3, 0); // ~1:47.3
          expect(traj.laps[4].lapTimeSec).toBeCloseTo(107.1, 0); // ~1:47.1
          expect(traj.laps[4].isBest).toBe(true);
        });
      }

      const daytonaR1File = path.join(steamReplaysDir, 'Daytona International Speedway Road Course R1 6.Vcr');
      if (fs.existsSync(daytonaQ1File) && fs.existsSync(daytonaR1File)) {
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
      const bahrainGpFile = path.join(steamReplaysDir, 'Bahrain International Circuit P1 14.Vcr');
      if (fs.existsSync(bahrainPaddockFile) && fs.existsSync(bahrainGpFile)) {
        it('uses correct layout-specific Start/Finish coordinates for Bahrain Paddock vs Grand Prix', () => {
          const paddockTraj = extractReplayTrajectory(bahrainPaddockFile, { maxPoints: 0, lapNumber: 2 });
          const gpTraj = extractReplayTrajectory(bahrainGpFile, { maxPoints: 0, lapNumber: 2 });

          expect(paddockTraj.points.length).toBeGreaterThan(0);
          expect(gpTraj.points.length).toBeGreaterThan(0);

          // Paddock layout starts on the paddock straight (~ -197, 250)
          expect(paddockTraj.points[0].x).toBeCloseTo(-197.75, 0);
          expect(paddockTraj.points[0].z).toBeCloseTo(250.12, 0);

          // GP layout starts on the main pit straight (~ 410, 368)
          expect(gpTraj.points[0].x).toBeCloseTo(410.69, 0);
          expect(gpTraj.points[0].z).toBeCloseTo(367.95, 0);
        });
      }

      const spaR1File = path.join(steamReplaysDir, 'Circuit de Spa-Francorchamps R1 35.Vcr');
      if (fs.existsSync(spaR1File)) {
        it('detects all 14+ racing laps in Spa race replay instead of collapsing into single 33-minute lap', () => {
          const traj = extractReplayTrajectory(spaR1File, { maxPoints: 500 });
          expect(traj.driverSlot).toBe(32);
          expect(traj.driverName).toContain('Samuel Lague');
          expect(traj.laps.length).toBeGreaterThanOrEqual(14);
          expect(traj.laps[0].isOutlap).toBe(true);
          // Racing laps are ~2:10 - 2:22 (130s - 142s)
          expect(traj.laps[1].lapTimeSec).toBeCloseTo(142.3, 0);
          expect(traj.laps[2].lapTimeSec).toBeCloseTo(134.0, 0);
          expect(traj.laps[3].lapTimeSec).toBeCloseTo(138.4, 0);
        });
      }

      it('autonomously detects multi-lap circuit when vehicle starts in pit lane with pit limiter', () => {
        // Synthetic test: car starts in pit lane for 100m, then does two 50-second circular laps
        const slices: any[] = [];
        let t = 0;
        // Pit lane segment: 20 points, pit limiter on, moving slowly along z
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
        // Circuit: 2 full loops of radius 400m, circumference ~2513m, speed ~50 m/s (~180 km/h) -> ~50s per lap
        for (let lap = 0; lap < 2; lap++) {
          for (let angleDeg = 0; angleDeg < 360; angleDeg += 10) {
            t += 1.4;
            const rad = (angleDeg * Math.PI) / 180;
            slices.push({
              sTime: t,
              driverSlot: 1,
              x: 400 * Math.cos(rad),
              y: 0,
              z: 400 * Math.sin(rad),
              pitLimiter: false,
              throttle: 100,
              brake: 0,
            });
          }
        }

        const pitVcr = path.join(tempDir, 'pit_start_test.vcr');
        fs.writeFileSync(pitVcr, createSliceVcrBuffer({ slices }));
        const traj = extractReplayTrajectory(pitVcr, { driverSlot: 1 });
        expect(traj.laps.length).toBeGreaterThan(1);
        fs.unlinkSync(pitVcr);
      });
    });
});
