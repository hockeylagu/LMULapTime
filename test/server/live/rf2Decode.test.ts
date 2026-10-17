import { describe, expect, it } from 'vitest';
import { decodePedalSlot, decodeScoring, readPedalFrame, readScoringFrame } from '../../../server/live/rf2Decode.js';
import { SCORING, SCORING_INFO, TELEMETRY, VEHICLE_TELEMETRY, WHEEL } from '../../../server/live/rf2Layout.js';
import { scoringBuffer, source, telemetryBuffer } from './rf2Fixtures.js';
import type { ScoringVehicle } from './rf2Fixtures.js';

const FIELD: ScoringVehicle[] = [
  { id: 7, isPlayer: false, place: 1, totalLaps: 9, name: 'Other', className: 'Hyper' },
  { id: 12, isPlayer: true, place: 4, totalLaps: 8, name: 'Ferrari 296 GT3', className: 'GT3' },
];

describe('rF2 scoring decode', () => {
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
      inRealtime: true, gamePhase: 5, trackLength: 13_626, trackTempC: 31.5, raining: 0, avgPathWetness: 0,
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
      car: { fuelLiters: 0, fuelCapacityLiters: 0, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false, wheels: Array(4).fill({ flat: false, detached: false }), compound: '' },
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

  it('reads the car: fuel and capacity in litres, dents, lost parts, flat or lost wheels and the front compound', () => {
    const buffer = telemetryBuffer(4, [{ id: 12, et: 1, throttle: 0, brake: 0 }]);
    const base = TELEMETRY.vehicles;
    const at = VEHICLE_TELEMETRY.offsets;
    buffer.writeDoubleLE(32.2, base + at.fuel);
    buffer.writeDoubleLE(117, base + at.fuelCapacity);
    buffer.writeUInt8(2, base + at.dentSeverity + 5);
    buffer.writeUInt8(1, base + at.detached);
    buffer.writeUInt8(1, base + at.wheels + 2 * WHEEL.size + WHEEL.offsets.flat);
    buffer.writeUInt8(1, base + at.wheels + 3 * WHEEL.size + WHEEL.offsets.detached);
    buffer.write('Medium', base + at.frontTireCompoundName, 'utf8');
    expect(decodePedalSlot(buffer.subarray(base, base + TELEMETRY.vehicleStride)).car).toEqual({
      fuelLiters: 32.2, fuelCapacityLiters: 117, dentSeverity: [0, 0, 0, 0, 0, 2, 0, 0], detached: true,
      wheels: [{ flat: false, detached: false }, { flat: false, detached: false }, { flat: true, detached: false }, { flat: false, detached: true }],
      compound: 'Medium',
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
});
