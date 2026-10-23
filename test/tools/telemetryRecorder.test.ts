import { describe, expect, it } from 'vitest';
import {
  looksLikeName,
  detectCalibration,
  round,
  sanitizeFileName,
  decodeScoringInfo,
  decodeScoringVehicle,
  decodeWheel,
  decodeTelemetryVehicle,
  formatMetaRecord,
  formatScoringRecord,
  tryReadCoherent,
} from '../../tools/telemetryRecorder.js';
import { SCORING_BUFFER, SCORING_INFO, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL } from '../../server/live/rf2Layout.js';
import type { MappedBuffer } from '../../server/live/sharedMemory.js';

describe('telemetryRecorder tools', () => {
  describe('looksLikeName', () => {
    it('accepts zero-padded ASCII strings', () => {
      const buf = Buffer.alloc(32);
      buf.write('Driver Name', 0, 'ascii');
      expect(looksLikeName(buf, 0, 32)).toBe(true);
    });

    it('rejects strings with non-zero trailing padding', () => {
      const buf = Buffer.alloc(32, 1);
      buf.write('Driver Name\0', 0, 'ascii');
      expect(looksLikeName(buf, 0, 32)).toBe(false);
    });

    it('rejects non-printable ASCII or control characters', () => {
      const buf = Buffer.alloc(32);
      buf.write('Driver\x01Name', 0, 'ascii');
      expect(looksLikeName(buf, 0, 32)).toBe(false);
    });

    it('rejects empty or unterminated strings', () => {
      const empty = Buffer.alloc(32);
      expect(looksLikeName(empty, 0, 32)).toBe(false);

      const full = Buffer.alloc(32, 65);
      expect(looksLikeName(full, 0, 32)).toBe(false);
    });
  });

  describe('detectCalibration', () => {
    it('detects offset and stride from matching candidate vehicles', () => {
      const stride = 584;
      const offset = 560;
      const buf = Buffer.alloc(SCORING_BUFFER.size);

      for (let i = 0; i < 3; i++) {
        const base = offset + i * stride;
        buf.writeInt32LE(i, base);
        buf.write(`Driver ${i}`, base + 4, 'ascii');
        buf.write(`Car ${i}`, base + 36, 'ascii');
      }

      const cal = detectCalibration(
        buf,
        100_000,
        [{ offset: 4, length: 32 }, { offset: 36, length: 64 }],
        300,
        2000,
        584,
      );

      expect(cal).toEqual({
        offset,
        stride,
        sampleCount: 3,
      });
    });

    it('falls back to fallbackStride when only one vehicle is detected', () => {
      const offset = 560;
      const buf = Buffer.alloc(SCORING_BUFFER.size);
      buf.writeInt32LE(1, offset);
      buf.write('Driver Solo', offset + 4, 'ascii');
      buf.write('Car Solo', offset + 36, 'ascii');

      const cal = detectCalibration(
        buf,
        100_000,
        [{ offset: 4, length: 32 }, { offset: 36, length: 64 }],
        300,
        2000,
        584,
      );

      expect(cal).toEqual({
        offset,
        stride: 584,
        sampleCount: 1,
      });
    });

    it('returns null when no candidates match', () => {
      const buf = Buffer.alloc(1000);
      const cal = detectCalibration(
        buf,
        100_000,
        [{ offset: 4, length: 32 }, { offset: 36, length: 64 }],
        300,
        2000,
        584,
      );
      expect(cal).toBeNull();
    });
  });

  describe('utility functions', () => {
    it('round handles decimals and non-finites accurately', () => {
      expect(round(12.34567, 3)).toBe(12.346);
      expect(round(12.340001, 2)).toBe(12.34);
      expect(round(Number.NaN, 3)).toBe(0);
      expect(round(Infinity, 3)).toBe(0);
    });

    it('sanitizeFileName replaces invalid characters with dashes', () => {
      expect(sanitizeFileName('Bahrain: International / Circuit*')).toBe('Bahrain--International---Circuit-');
    });
  });

  describe('decoding and formatting', () => {
    it('decodes ScoringInfo correctly from Buffer', () => {
      const buf = Buffer.alloc(SCORING_INFO.size);
      buf.write('Monza', SCORING_INFO.offsets.trackName, 'utf8');
      buf.writeInt32LE(2, SCORING_INFO.offsets.session);
      buf.writeDoubleLE(123.456, SCORING_INFO.offsets.currentET);
      buf.writeInt32LE(15, SCORING_INFO.offsets.numVehicles);
      buf.writeUInt8(5, SCORING_INFO.offsets.gamePhase);
      buf.writeDoubleLE(24.5, SCORING_INFO.offsets.trackTemp);

      const info = decodeScoringInfo(buf, 0);
      expect(info.trackName).toBe('Monza');
      expect(info.session).toBe(2);
      expect(info.currentEt).toBeCloseTo(123.456);
      expect(info.numVehicles).toBe(15);
      expect(info.gamePhase).toBe(5);
      expect(info.trackTemp).toBeCloseTo(24.5);
    });

    it('decodes scoring vehicle and wheel fields accurately', () => {
      const vehBuf = Buffer.alloc(VEHICLE_SCORING.size);
      vehBuf.writeInt32LE(42, VEHICLE_SCORING.offsets.id);
      vehBuf.write('Alice', VEHICLE_SCORING.offsets.driverName, 'utf8');
      vehBuf.writeUInt8(1, VEHICLE_SCORING.offsets.isPlayer);
      vehBuf.writeDoubleLE(1500.5, VEHICLE_SCORING.offsets.lapDist);

      const v = decodeScoringVehicle(vehBuf, 0);
      expect(v.id).toBe(42);
      expect(v.driver).toBe('Alice');
      expect(v.isPlayer).toBe(true);
      expect(v.lapDist).toBeCloseTo(1500.5);

      const wheelBuf = Buffer.alloc(WHEEL.size);
      wheelBuf.write('RUMBLE', WHEEL.offsets.terrainName, 'utf8');
      wheelBuf.writeDoubleLE(273.15 + 50.0, WHEEL.offsets.brakeTemp);
      const w = decodeWheel(wheelBuf, 0);
      expect(w.terrain).toBe('RUMBLE');
      expect(w.brakeTempC).toBeCloseTo(50.0);
    });

    it('decodes telemetry vehicle and computes Euler angles and speed', () => {
      const telBuf = Buffer.alloc(VEHICLE_TELEMETRY.size);
      telBuf.writeInt32LE(7, VEHICLE_TELEMETRY.offsets.id);
      telBuf.writeDoubleLE(10.0, VEHICLE_TELEMETRY.offsets.localVel); // vx
      telBuf.writeDoubleLE(0.0, VEHICLE_TELEMETRY.offsets.localVel + 8); // vy
      telBuf.writeDoubleLE(0.0, VEHICLE_TELEMETRY.offsets.localVel + 16); // vz

      // Set orientation matrix to identity
      telBuf.writeDoubleLE(1.0, VEHICLE_TELEMETRY.offsets.ori);
      telBuf.writeDoubleLE(1.0, VEHICLE_TELEMETRY.offsets.ori + 32);
      telBuf.writeDoubleLE(1.0, VEHICLE_TELEMETRY.offsets.ori + 64);

      const tv = decodeTelemetryVehicle(telBuf, 0);
      expect(tv.id).toBe(7);
      expect(tv.speedKmh).toBeCloseTo(36.0); // 10 m/s * 3.6
      expect(tv.yaw).toBeCloseTo(0.0);
    });

    it('formats records adhering to the expected JSON schema', () => {
      const info = {
        trackName: 'Spa',
        session: 1,
        currentEt: 50.123,
        endEt: 3600,
        maxLaps: 20,
        lapDist: 7004.1,
        numVehicles: 1,
        gamePhase: 5,
        yellowFlagState: 0,
        startLight: 0,
        numRedLights: 0,
        inRealtime: 1,
        playerName: 'Bob',
        plrFileName: 'bob.plr',
        ambientTemp: 20.0,
        trackTemp: 25.0,
        raining: 0.0,
        wind: { x: 0, y: 0, z: 0 },
        minPathWetness: 0,
        maxPathWetness: 0,
        avgPathWetness: 0,
      };

      const meta = JSON.parse(formatMetaRecord(info, 'Spa', { offset: 16, stride: 1888, sampleCount: 1 }, { offset: 560, stride: 584, sampleCount: 1 }));
      expect(meta.t).toBe('meta');
      expect(meta.track).toBe('Spa');
      expect(meta.scoringVehicleOffset).toBe(560);

      const sco = JSON.parse(formatScoringRecord(info, []));
      expect(sco.t).toBe('sco');
      expect(sco.et).toBe(50.123);
      expect(sco.veh).toEqual([]);
    });
  });

  describe('tryReadCoherent', () => {
    it('returns ok when begin and end versions match', () => {
      const mockBuf = Buffer.alloc(100);
      mockBuf.writeInt32LE(42, 10);
      const mockMapped: MappedBuffer = {
        size: 100,
        readU32: offset => (offset === 0 || offset === 4 ? 5 : 0),
        read: (offset, length) => mockBuf.subarray(offset, offset + length),
        readInto: (offset, target, targetOffset, length) => { mockBuf.copy(target, targetOffset, offset, offset + length); },
        close: () => {},
      };

      const res = tryReadCoherent(
        mockMapped,
        0,
        4,
        buf => buf.readInt32LE(10),
        0,
        100,
      );

      expect(res).toEqual({ ok: true, value: 42, version: 5 });
    });

    it('retries and returns false when versions mismatch', () => {
      let call = 0;
      const mockMapped: MappedBuffer = {
        size: 100,
        readU32: offset => {
          call++;
          return offset === 0 ? call : call + 1; // always mismatched
        },
        read: () => Buffer.alloc(100),
        readInto: () => {},
        close: () => {},
      };

      const res = tryReadCoherent(
        mockMapped,
        0,
        4,
        () => true,
        0,
        100,
        4,
      );

      expect(res).toEqual({ ok: false });
    });
  });
});
