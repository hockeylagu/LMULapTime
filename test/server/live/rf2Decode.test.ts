import { describe, expect, it } from 'vitest';
import { decodePedalSlot, decodeScoring, readPedalFrame, readScoringFrame } from '../../../server/live/rf2Decode.js';
import { SCORING, SCORING_INFO, TELEMETRY } from '../../../server/live/rf2Layout.js';
import { scoringBuffer, source, telemetryBuffer } from './rf2Fixtures.js';
import type { ScoringVehicle } from './rf2Fixtures.js';

const FIELD: ScoringVehicle[] = [
  { id: 7, isPlayer: false, place: 1, totalLaps: 9, name: 'Other', className: 'Hyper' },
  { id: 12, isPlayer: true, place: 4, totalLaps: 8, name: 'Ferrari 296 GT3', className: 'GT3' },
];

describe('rF2 scoring decode', () => {
  it('finds the player and decodes the session header', () => {
    expect(decodeScoring(scoringBuffer(2, FIELD))).toEqual({
      trackName: 'Circuit de la Sarthe', sessionCode: 10, currentEt: 321.5, endEt: 3600, maxLaps: 2147483647, numVehicles: 2,
      inRealtime: true, gamePhase: 5,
      player: { id: 12, place: 4, totalLaps: 8, vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3' },
    });
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
    expect(decodePedalSlot(slot)).toEqual({ id: 12, sample: { t: 321.25, throttle: 0.75, brake: 1 } });
  });

  it('matches the player by id and remembers its slot', () => {
    const mapping = source(() => telemetryBuffer(4, slots));
    expect(readPedalFrame(mapping, 12, null, -1)).toEqual({
      status: 'ok', version: 4, value: { slot: 1, sample: { t: 321.25, throttle: 0.75, brake: 1 } },
    });
    expect(readPedalFrame(mapping, 12, 3, 1)).toMatchObject({ value: { slot: 1 } });
  });

  it('gives a null sample when the player is not in the buffer, and skips an unchanged frame', () => {
    const mapping = source(() => telemetryBuffer(4, slots));
    expect(readPedalFrame(mapping, 99, null, -1)).toMatchObject({ status: 'ok', value: { slot: -1, sample: null } });
    expect(readPedalFrame(mapping, 12, 4, 1)).toEqual({ status: 'unchanged' });
  });
});
