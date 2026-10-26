import { describe, expect, it } from 'vitest';
import { decodePedalSlot, decodeScoring, readPedalFrame, readScoringFrame } from '../../../server/live/rf2Decode.js';
import { LiveCaptureRows } from '../../../server/live/capture/decode.js';
import { LIVE_CAPTURE_SAMPLE_WIDTH } from '../../../shared/types/liveCapture.js';
import { SCORING, SCORING_INFO, TELEMETRY, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL } from '../../../server/live/rf2Layout.js';
import { scoringBuffer, source, telemetryBuffer } from './rf2Fixtures.js';
import type { ScoringVehicle } from './rf2Fixtures.js';

const FIELD: ScoringVehicle[] = [
  { id: 7, isPlayer: false, place: 1, totalLaps: 9, name: 'Other', className: 'Hyper' },
  { id: 12, isPlayer: true, place: 4, totalLaps: 8, name: 'Ferrari 296 GT3', className: 'GT3' },
];

describe('rF2 scoring decode', () => {
  it('preserves all 16 upgrade-pack bytes as opaque player hex, including zero and high-bit bytes', () => {
    const buffer = scoringBuffer(2, FIELD);
    const rawHex = '004280ff000102030405060708090a0b';
    Buffer.from(rawHex, 'hex').copy(buffer, SCORING.vehicles + VEHICLE_SCORING.size + VEHICLE_SCORING.offsets.upgradePack);
    const decoded = decodeScoring(buffer);
    expect(decoded.player?.upgradePackHex).toBe(rawHex);
    expect(decoded.leader?.upgradePackHex).toBe('00000000000000000000000000000000');
  });
  it('resolves the player class leader independently from the overall Hypercar leader', () => {
    const field = [...FIELD, { id: 13, isPlayer: false, place: 2, totalLaps: 8, name: 'Class leader', className: 'GT3' }];
    expect(decodeScoring(scoringBuffer(2, field))).toMatchObject({
      leader: { id: 7, vehicleClass: 'Hyper' }, classLeader: { id: 13, vehicleClass: 'GT3' }, playerClassPlace: 2,
    });
  });
  it('groups canonical class aliases and does not mix LMP2 WEC with ELMS', () => {
    const player = { ...FIELD[1], className: 'LMP2 (ELMS)' };
    const wec = { ...FIELD[0], id: 18, place: 2, className: 'LMP2 (WEC)' };
    const elms = { ...FIELD[0], id: 19, place: 3, className: 'LMP2_ELMS' };
    expect(decodeScoring(scoringBuffer(2, [FIELD[0], wec, elms, player]))).toMatchObject({
      leader: { id: 7 }, classLeader: { id: 19 }, playerClassPlace: 2,
    });
  });
  it('checks finish status across the whole field and leaves truncated fields unknown', () => {
    const finished = FIELD.map(vehicle => ({ ...vehicle, bytes: { finishStatus: 1 } }));
    expect(decodeScoring(scoringBuffer(2, finished)).allDriversFinished).toBe(true);
    expect(decodeScoring(scoringBuffer(2, [finished[0], { ...finished[1], bytes: { finishStatus: 0 } }])).allDriversFinished).toBe(false);
    expect(decodeScoring(scoringBuffer(2, [finished[0], { ...finished[1], bytes: { finishStatus: 3 } }])).allDriversFinished).toBe(true);
    const truncated = scoringBuffer(2, finished).subarray(0, SCORING.vehicles + SCORING.vehicleStride);
    expect(decodeScoring(truncated).allDriversFinished).toBeNull();
  });
  it('finds the player and decodes the session header', () => {
    expect(decodeScoring(scoringBuffer(2, FIELD))).toEqual({
      trackName: 'Circuit de la Sarthe', sessionCode: 10, currentEt: 321.5, endEt: 3600, numVehicles: 2,
      playerClassPlace: 1,
      allDriversFinished: false,
      inRealtime: true, gamePhase: 5, trackLength: 13_626, trackTempC: 31.5, raining: 0, avgPathWetness: 0, maxPathWetness: 0,
      player: expect.objectContaining({ id: 12, place: 4, totalLaps: 8, vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3' }),
      leader: expect.objectContaining({ id: 7, place: 1, totalLaps: 9 }),
      classLeader: expect.objectContaining({ id: 12, place: 4, vehicleClass: 'GT3' }),
    });
  });

  it('decodes the weather and every timing field of the player and the leader', () => {
    const player: ScoringVehicle = {
      ...FIELD[1],
      doubles: {
        lapDist: 4321.5, lastLapTime: 228.9, bestLapTime: 227.5, lastSector1: 35.9, lastSector2: 126.2, bestSector1: 35.5, bestSector2: 125.9,
        curSector1: 36.1, curSector2: 126.7, lapStartET: 301.25, timeIntoLap: 20.5, estimatedLapTime: 229.5,
      },
      floats: { bestLapSector1: 35.5, bestLapSector2: 125.5 },
      bytes: { sector: 2, finishStatus: 1, countLapFlag: 1, inPits: 1 },
      lapsBehindLeader: 2,
    };
    const decoded = decodeScoring(scoringBuffer(2, [FIELD[0], player], { trackTemp: 47.25, raining: 0.4, avgPathWetness: 1.5, lapDist: 13_626.5 }));
    expect(decoded).toMatchObject({ trackLength: 13_626.5, trackTempC: 47.25, raining: 0.4, avgPathWetness: 1 });
    expect(decoded.player).toEqual({
      upgradePackHex: '00000000000000000000000000000000',
      id: 12, place: 4, totalLaps: 8, vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3',
      pitStops: 0,
      lapDist: 4321.5, sector: 2, lastLapTime: 228.9, bestLapTime: 227.5, lastSector1: 35.9, lastSector2: 126.2,
      bestSector1: 35.5, bestSector2: 125.9, curSector1: 36.1, curSector2: 126.7, bestLapSector1: 35.5, bestLapSector2: 125.5,
      lapStartEt: 301.25, timeIntoLap: 20.5, estimatedLapTime: 229.5, inPits: true, countLapFlag: 1, lapsBehindLeader: 2, finishStatus: 1,
    });
    expect(decoded.leader).toMatchObject({ id: 7, place: 1, inPits: false, countLapFlag: 2 });
  });

  it('has no player when none is flagged, and ignores vehicles beyond the count', () => {
    expect(decodeScoring(scoringBuffer(2, FIELD.map(v => ({ ...v, isPlayer: false })))).player).toBeNull();
    const buffer = scoringBuffer(2, FIELD);
    buffer.writeInt32LE(1, SCORING.info + SCORING_INFO.offsets.numVehicles);
    expect(decodeScoring(buffer).player).toBeNull();
  });

  it('reads a coherent frame, copying only the header and the listed vehicles', () => {
    const mapping = source(() => scoringBuffer(2, FIELD));
    const result = readScoringFrame(mapping, null);
    expect(result).toMatchObject({ status: 'ok', version: 2, value: { player: { id: 12 } } });
    expect(mapping.copies).toBe(2);
  });

  it('skips a frame whose counter has not moved', () => {
    const mapping = source(() => scoringBuffer(2, FIELD));
    expect(readScoringFrame(mapping, 2)).toEqual({ status: 'unchanged' });
    expect(mapping.copies).toBe(0);
  });

  it('retries a read caught while the writer is mid-update and succeeds once it finishes', () => {
    const midUpdate = scoringBuffer(2, FIELD);
    midUpdate.writeUInt32LE(3, SCORING.versionBegin);
    let current = midUpdate;
    // The writer finishes (counters both 3) before the second attempt.
    const mapping = source(() => current, reads => { if (reads === 2) current = scoringBuffer(3, FIELD, { phase: 8 }); });
    expect(readScoringFrame(mapping, 1)).toMatchObject({ status: 'ok', version: 3, value: { gamePhase: 8 } });
  });

  it('gives up after three torn attempts', () => {
    const torn = scoringBuffer(2, FIELD);
    torn.writeUInt32LE(3, SCORING.versionBegin);
    const mapping = source(() => torn);
    expect(readScoringFrame(mapping, 1)).toEqual({ status: 'torn' });
    expect(mapping.reads).toBe(6);
    expect(mapping.copies).toBe(0);
  });

  it('rejects a copy the writer changed underneath', () => {
    let current = scoringBuffer(2, FIELD);
    const mapping = source(() => current, reads => { if (reads === 3) current = scoringBuffer(3, FIELD); });
    // Attempt 1: begin 2, end 2, copy, then begin reads 3 -> retry; attempt 2 reads 3 throughout.
    expect(readScoringFrame(mapping, null)).toMatchObject({ status: 'ok', version: 3 });
  });

  it('keeps retained scoring independent of reused storage and ignores stale slots when the field shrinks', () => {
    let current = scoringBuffer(2, FIELD);
    const mapping = source(() => current);
    const first = readScoringFrame(mapping, null);
    current = scoringBuffer(3, [{ ...FIELD[0], bytes: { finishStatus: 1 } }]);
    expect(readScoringFrame(mapping, 2)).toMatchObject({ status: 'ok', value: { player: null, allDriversFinished: true } });
    expect(first).toMatchObject({ status: 'ok', value: { player: { id: 12 }, allDriversFinished: false } });
    current = scoringBuffer(4, []);
    expect(readScoringFrame(mapping, 3)).toMatchObject({ status: 'ok', value: { player: null, leader: null, allDriversFinished: null } });
  });

  it('copies changing frames into fixed scratch buffers without allocating mapping snapshots', () => {
    const scoring = scoringBuffer(2, FIELD);
    const telemetry = telemetryBuffer(2, [{ id: 12, et: 100, throttle: 0.5, brake: 0 }]);
    const destinations = new Set<Buffer>();
    const mapping = (buffer: Buffer) => ({
      readU32: (offset: number) => buffer.readUInt32LE(offset),
      read: (): Buffer => { throw new Error('Allocating read on polling path'); },
      readInto: (offset: number, target: Buffer, targetOffset: number, length: number) => {
        destinations.add(target);
        buffer.copy(target, targetOffset, offset, offset + length);
      },
    });
    const scoringSource = mapping(scoring);
    const telemetrySource = mapping(telemetry);
    for (let version = 2; version <= 4; version++) {
      scoring.writeUInt32LE(version, SCORING.versionBegin);
      scoring.writeUInt32LE(version, SCORING.versionEnd);
      telemetry.writeUInt32LE(version, TELEMETRY.versionBegin);
      telemetry.writeUInt32LE(version, TELEMETRY.versionEnd);
      expect(readScoringFrame(scoringSource, version - 1).status).toBe('ok');
      expect(readPedalFrame(telemetrySource, 12, version - 1, 0).status).toBe('ok');
    }
    expect(destinations.size).toBe(2);
  });
});

describe('rF2 pedal decode', () => {
  const slots = [
    { id: 7, et: 100, throttle: 0.2, brake: 0 },
    { id: 12, et: 321.25, throttle: 0.75, brake: 1.5 },
  ];

  it('decodes one slot, clamping the pedals to 0..1', () => {
    const buffer = telemetryBuffer(4, slots);
    const slot = buffer.subarray(TELEMETRY.vehicles + TELEMETRY.vehicleStride, TELEMETRY.vehicles + 2 * TELEMETRY.vehicleStride);
    expect(decodePedalSlot(slot)).toEqual({
      id: 12, sample: { t: 321.25, throttle: 0.75, brake: 1 }, tyreSurfaceAvgC: null,
      car: { fuelLiters: 0, fuelCapacityLiters: 0, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false, wheels: Array(4).fill({ flat: false, detached: false }), lastImpactEt: 0, tread: [0, 0, 0, 0], compound: '' },
    });
  });

  it('averages the 12 tyre surface temperatures and converts Kelvin to Celsius, null when the game reports none', () => {
    const decoded = (tyreKelvin?: number): number | null => {
      const buffer = telemetryBuffer(4, [{ id: 12, et: 1, throttle: 0, brake: 0, tyreKelvin }]);
      return decodePedalSlot(buffer.subarray(TELEMETRY.vehicles, TELEMETRY.vehicles + TELEMETRY.vehicleStride)).tyreSurfaceAvgC;
    };
    expect(decoded(353.65)).toBe(80.5);
    expect(decoded(undefined)).toBeNull();
  });

  it('reads the car: fuel and capacity in litres, dents, lost parts, flat or lost wheels, the last impact, tread and the front compound', () => {
    const buffer = telemetryBuffer(4, [{ id: 12, et: 1, throttle: 0, brake: 0 }]);
    const base = TELEMETRY.vehicles;
    const at = VEHICLE_TELEMETRY.offsets;
    buffer.writeDoubleLE(32.2, base + at.fuel);
    buffer.writeDoubleLE(117, base + at.fuelCapacity);
    buffer.writeUInt8(2, base + at.dentSeverity + 5);
    buffer.writeUInt8(1, base + at.detached);
    buffer.writeUInt8(1, base + at.wheels + 2 * WHEEL.size + WHEEL.offsets.flat);
    buffer.writeUInt8(1, base + at.wheels + 3 * WHEEL.size + WHEEL.offsets.detached);
    buffer.writeDoubleLE(812.5, base + at.lastImpactET);
    buffer.write('Medium', base + at.frontTireCompoundName, 'utf8');
    [0.98, 0.9431234, 1.2, 0.95].forEach((tread, index) => buffer.writeDoubleLE(tread, base + at.wheels + index * WHEEL.size + WHEEL.offsets.wear));
    expect(decodePedalSlot(buffer.subarray(base, base + TELEMETRY.vehicleStride)).car).toEqual({
      fuelLiters: 32.2, fuelCapacityLiters: 117, dentSeverity: [0, 0, 0, 0, 0, 2, 0, 0], detached: true,
      wheels: [{ flat: false, detached: false }, { flat: false, detached: false }, { flat: true, detached: false }, { flat: false, detached: true }],
      lastImpactEt: 812.5, tread: [0.98, 0.9431234, 1, 0.95], compound: 'Medium',
    });
  });

  it('matches the player by id and remembers its slot', () => {
    const mapping = source(() => telemetryBuffer(4, slots));
    expect(readPedalFrame(mapping, 12, null, -1)).toEqual({
      status: 'ok', version: 4, value: { slot: 1, sample: { t: 321.25, throttle: 0.75, brake: 1 }, tyreSurfaceAvgC: null, car: expect.objectContaining({ fuelLiters: 0 }) },
    });
    expect(readPedalFrame(mapping, 12, 3, 1)).toMatchObject({ value: { slot: 1 } });
  });

  it('gives a null sample when the player is not in the buffer, and skips an unchanged frame', () => {
    const mapping = source(() => telemetryBuffer(4, slots));
    expect(readPedalFrame(mapping, 99, null, -1)).toMatchObject({ status: 'ok', value: { slot: -1, sample: null } });
    expect(readPedalFrame(mapping, 12, 4, 1)).toEqual({ status: 'unchanged' });
  });

  it('finds a moved player before or after its old hint, including an out-of-range hint', () => {
    let current = telemetryBuffer(4, slots);
    const mapping = source(() => current);
    expect(readPedalFrame(mapping, 12, null, 1)).toMatchObject({ value: { slot: 1 } });
    current = telemetryBuffer(5, [slots[1], slots[0]]);
    expect(readPedalFrame(mapping, 12, 4, 1)).toMatchObject({ value: { slot: 0 } });
    current = telemetryBuffer(6, slots);
    expect(readPedalFrame(mapping, 12, 5, 0)).toMatchObject({ value: { slot: 1 } });
    expect(readPedalFrame(mapping, 12, null, 128)).toMatchObject({ value: { slot: 1 } });
  });

  it('retains independent samples and capture rows when its copy storage is reused', () => {
    let current = telemetryBuffer(4, slots);
    const mapping = source(() => current);
    const rows = new LiveCaptureRows();
    const first = readPedalFrame(mapping, 12, null, 1, rows, false);
    current = telemetryBuffer(5, [{ ...slots[1], et: 400, throttle: 0.25 }]);
    current.writeDoubleLE(-88, TELEMETRY.vehicles + VEHICLE_TELEMETRY.offsets.localVel + 16);
    const second = readPedalFrame(mapping, 12, 4, 1, rows, true);
    expect(first).toMatchObject({ value: { sample: { t: 321.25, throttle: 0.75 }, car: null } });
    expect(second).toMatchObject({ value: { sample: { t: 400, throttle: 0.25 }, car: { fuelLiters: 0 } } });
    const batch = rows.take()!;
    const width = LIVE_CAPTURE_SAMPLE_WIDTH;
    expect([batch.rows[0], batch.rows[3], batch.rows[width], batch.rows[width + 3]]).toEqual([321.25, -0, 400, 88]);
    // The checkpoint (car cadence) carries the sparse state again.
    expect(batch.sparse.map(change => change.row)).toEqual([0, 1]);
  });

  it('keeps scratch buffers isolated between mappings', () => {
    const first = source(() => telemetryBuffer(4, slots));
    const second = source(() => telemetryBuffer(5, [{ ...slots[1], et: 999 }]));
    expect(readPedalFrame(first, 12, null, 1)).toMatchObject({ value: { sample: { t: 321.25 } } });
    expect(readPedalFrame(second, 12, null, 0)).toMatchObject({ value: { sample: { t: 999 } } });
    expect(readPedalFrame(first, 12, null, 1)).toMatchObject({ value: { sample: { t: 321.25 } } });
  });

  it('rejects torn telemetry copies before decoding and retries the updated slot', () => {
    let current = telemetryBuffer(4, slots);
    const mapping = source(() => current, reads => {
      // begin/end, vehicle count and hinted ID have been read; the copy is already done.
      if (reads === 4) current = telemetryBuffer(5, [{ ...slots[1], et: 999 }]);
    });
    const rows = new LiveCaptureRows();
    expect(readPedalFrame(mapping, 12, null, 1, rows)).toMatchObject({ status: 'ok', version: 5,
      value: { slot: 0, sample: { t: 999 } } });
    expect(mapping.copies).toBe(2);
    expect(Array.from(rows.take()!.rows.subarray(0, 1))).toEqual([999]);
  });
});
