import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseReplayMetadata,
  mapVehicleIdToModel,
  detectPlayerName,
  downsampleReplayTrajectory,
} from '../../server/replay/replayParser.js';
import { ReplayEventInfo, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../server/core/types.js';
import { createMockVcrBuffer, createSliceVcrBuffer } from '../utils/mockVcr.js';

/**
 * Creates a VCR buffer with drivers encoded in the primary binary parser format:
 * [0x00, slotByte, nameLen, nameBytes, vehicleLen, vehicleBytes, liveryLen, liveryBytes, teamLen, teamBytes, carNumLen, carNumBytes]
 */
function createBinaryDriverVcrBuffer(options: {
  drivers: { slot: number; name: string; vehicleId: string; livery?: string; team: string; carNumber: string }[];
  slices?: { sTime: number; driverSlot: number; x: number; y: number; z: number }[];
  eventInfo?: ReplayEventInfo;
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
    evHdr.writeUInt32LE((9 << 17) | (65 << 8) | (sl.driverSlot & 0xff), 0);
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

describe('replayParser - metadata, player detection & downsampling', () => {
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_temp_meta');
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
      expect(mapVehicleIdToModel('8_26_GCHAL79481284')).toBe('McLaren 720S GT3 Evo');
      expect(mapVehicleIdToModel('61_26_IRON57024276')).toBe('Lamborghini Huracan GT3 Evo2');
      expect(mapVehicleIdToModel('50_26_499P_123456')).toBe('Ferrari 499P');
      expect(mapVehicleIdToModel('101_26_WTR51729170')).toBe('Cadillac V-Series.R');
      expect(mapVehicleIdToModel('93_26_PEUG27100541')).toBe('Peugeot 9X8');
      expect(mapVehicleIdToModel('007_26_THO73564855')).toBe('Aston Martin Valkyrie LMH');
      expect(mapVehicleIdToModel('10_VECTOR_C18BEE4')).toBe('Oreca 07 LMP2');
      expect(mapVehicleIdToModel('4_25_DKR_E8E7FBE8C')).toBe('Oreca 07 LMP2');
      expect(mapVehicleIdToModel('777_DSTATI5BFA7EF3')).toBe('Aston Martin Vantage AMR');
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
      expect(samuel?.carClass).toBe('LMGT3');
      expect(samuel?.team).toBe('Vista AF Corsa');
      expect(samuel?.carNumber).toBe('21');
      expect(meta.carClass).toBe('LMGT3');
      expect(meta.carModel).toBe('Ferrari 296 GT3');
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
      expect(max?.carModel).toBe('Ferrari 296 GT3');
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
      const nanTrailerPath = path.join(tempDir, 'nan_trailer.vcr');
      const buf = createSliceVcrBuffer({
        slices: [{ sTime: 1.0, driverSlot: 1, x: 10, y: 0, z: 10 }],
      });
      const trailerStart = buf.length - 28;
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

  describe('downsampleReplayTrajectory', () => {
    function buildFullTrajectory(pointCount: number): ReplayTrajectoryData {
      const points: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < pointCount; i++) {
        points.push({ x: i, y: 0, z: i * 2, speedKmh: i, throttle: 100, brake: 0 });
      }
      return {
        replayName: 'Full_Res.Vcr',
        pointsCount: points.length,
        currentLap: 1,
        laps: [{ lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
        sectors: { s1Frame: Math.floor(pointCount / 3), s2Frame: Math.floor((2 * pointCount) / 3) },
        bounds: { minX: 0, maxX: pointCount, minZ: 0, maxZ: pointCount * 2, spanX: pointCount, spanZ: pointCount * 2 },
        points,
        maxPoints: 0,
        isFullResolution: true,
      };
    }

    it('returns the same object untouched when maxPoints is 0 or covers all points', () => {
      const full = buildFullTrajectory(500);
      expect(downsampleReplayTrajectory(full, 0)).toBe(full);
      expect(downsampleReplayTrajectory(full, undefined)).toBe(full);
      expect(downsampleReplayTrajectory(full, 1000)).toBe(full);
    });

    it('decimates points to at most maxPoints and rescales sector frames proportionally', () => {
      const full = buildFullTrajectory(1000);
      const result = downsampleReplayTrajectory(full, 100);

      expect(result).not.toBe(full);
      expect(result.points.length).toBe(100);
      expect(result.pointsCount).toBe(100);
      expect(result.maxPoints).toBe(100);
      expect(result.isFullResolution).toBe(false);
      expect(result.sectors?.s1Frame).toBeCloseTo(33, 0);
      expect(result.sectors?.s2Frame).toBeCloseTo(67, 0);
      expect(result.points[0].x).toBe(0);
      expect(result.points[result.points.length - 1].x).toBeLessThan(1000);
    });

    it('does not mutate the original full-resolution trajectory', () => {
      const full = buildFullTrajectory(300);
      const originalPointsLength = full.points.length;
      downsampleReplayTrajectory(full, 50);
      expect(full.points.length).toBe(originalPointsLength);
      expect(full.pointsCount).toBe(originalPointsLength);
    });
  });
});
