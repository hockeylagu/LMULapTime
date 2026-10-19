import { describe, expect, it } from 'vitest';
import { LIVE_CAPTURE_CHANNELS, liveCaptureChannels } from '../../../../server/live/capture/channels.js';
import { decodeLiveCaptureSample } from '../../../../server/live/capture/decode.js';
import { VEHICLE_TELEMETRY, WHEEL } from '../../../../server/live/rf2Layout.js';

function vehicleSlot(): Buffer {
  return Buffer.alloc(VEHICLE_TELEMETRY.size);
}

function writeDouble(slot: Buffer, field: string, value: number, element = 0): void {
  slot.writeDoubleLE(value, VEHICLE_TELEMETRY.offsets[field] + element * 8);
}

describe('decodeLiveCaptureSample', () => {
  it('maps cardinal vehicle vectors to ISO forward, left and up axes', () => {
    const slot = vehicleSlot();
    writeDouble(slot, 'elapsedTime', 42.125);
    slot.writeInt32LE(3, VEHICLE_TELEMETRY.offsets.lapNumber);
    writeDouble(slot, 'lapStartET', 12.5);
    writeDouble(slot, 'localVel', 2, 0);
    writeDouble(slot, 'localVel', 3, 1);
    writeDouble(slot, 'localVel', -4, 2);
    writeDouble(slot, 'localRot', -5, 0);
    writeDouble(slot, 'localRot', 6, 1);
    writeDouble(slot, 'localRot', 7, 2);

    const sample = decodeLiveCaptureSample(slot);
    expect(sample).not.toBeNull();
    expect(sample).toMatchObject({ elapsedSeconds: 42.125, lapNumber: 3, lapStartSeconds: 12.5 });
    expect(Array.from(sample!.values.slice(0, 6))).toEqual([4, 2, 3, 7, 5, -6]);
  });

  it('preserves negative values and the exact float64 input precision', () => {
    const slot = vehicleSlot();
    writeDouble(slot, 'elapsedTime', 0.10000000000000002);
    slot.writeInt32LE(-1, VEHICLE_TELEMETRY.offsets.lapNumber);
    writeDouble(slot, 'lapStartET', -1);
    writeDouble(slot, 'localVel', -0.10000000000000002, 0);
    writeDouble(slot, 'localVel', -0.25, 1);
    writeDouble(slot, 'localVel', 0.5, 2);

    const sample = decodeLiveCaptureSample(slot);
    expect(sample?.elapsedSeconds).toBe(0.10000000000000002);
    expect(sample?.lapNumber).toBe(-1);
    expect(sample?.lapStartSeconds).toBeNull();
    expect(Array.from(sample!.values.slice(0, 3))).toEqual([-0.5, -0.10000000000000002, -0.25]);
  });

  it('uses NaN for nonfinite inputs without converting missing wheel values to measured zero', () => {
    const slot = vehicleSlot();
    writeDouble(slot, 'elapsedTime', 1);
    slot.writeInt32LE(0, VEHICLE_TELEMETRY.offsets.lapNumber);
    writeDouble(slot, 'lapStartET', Number.NaN);
    writeDouble(slot, 'localVel', Number.NaN, 0);
    writeDouble(slot, 'localVel', Number.POSITIVE_INFINITY, 1);
    writeDouble(slot, 'localVel', Number.NEGATIVE_INFINITY, 2);
    writeDouble(slot, 'localRot', 0.1, 0);
    writeDouble(slot, 'localRot', Number.NaN, 1);
    writeDouble(slot, 'localRot', -0.3, 2);
    for (let corner = 0; corner < 4; corner++) for (const field of ['lateralPatchVel', 'longitudinalPatchVel',
      'lateralGroundVel', 'longitudinalGroundVel', 'camber', 'toe']) {
      slot.writeDoubleLE(corner % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
        VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size + WHEEL.offsets[field]);
    }

    const sample = decodeLiveCaptureSample(slot);
    expect(sample?.lapStartSeconds).toBeNull();
    expect(Number.isNaN(sample!.values[0])).toBe(true);
    expect(Number.isNaN(sample!.values[1])).toBe(true);
    expect(Number.isNaN(sample!.values[2])).toBe(true);
    expect(Array.from(sample!.values.slice(3, 6))).toEqual([-0.3, -0.1, Number.NaN]);
    expect(sample!.values).toHaveLength(30);
    expect(sample!.values.slice(6).every(Number.isNaN)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS).toHaveLength(30);
  });

  it('uses ISO component signs, outward-positive camber and inward-positive dynamic toe at all four distinct corners', () => {
    const slot = vehicleSlot(); writeDouble(slot, 'elapsedTime', 1);
    for (let corner = 0; corner < 4; corner++) {
      const at = VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size;
      for (const [field, value] of [['lateralPatchVel', corner + 1], ['longitudinalPatchVel', -10 - corner],
        ['lateralGroundVel', -20 - corner], ['longitudinalGroundVel', 30 + corner],
        ['camber', -0.01 * (corner + 1)], ['toe', 0.02 * (corner + 1)]] as const) slot.writeDoubleLE(value, at + WHEEL.offsets[field]);
    }
    const values = decodeLiveCaptureSample(slot)!.values;
    expect(Array.from(values.slice(6, 14))).toEqual([1, 10, 2, 11, 3, 12, 4, 13]);
    expect(Array.from(values.slice(14, 22))).toEqual([-20, -30, -21, -31, -22, -32, -23, -33]);
    expect(Array.from(values.slice(22, 26))).toEqual([-0.01, -0.02, -0.03, -0.04]);
    expect(Array.from(values.slice(26))).toEqual([0.02, -0.04, 0.06, -0.08]);
    // A valid stationary zero is available, unlike nonfinite input.
    expect(decodeLiveCaptureSample(vehicleSlot())!.values.slice(6).every(value => value === 0)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS.every(channel => channel.verified)).toBe(true);
    expect(liveCaptureChannels(1).slice(6).every(channel => !channel.verified)).toBe(true);
    expect(() => liveCaptureChannels(999)).toThrow('Unsupported');
  });

  it('rejects invalid elapsed time and truncated slots', () => {
    const slot = vehicleSlot();
    slot.writeInt32LE(0, VEHICLE_TELEMETRY.offsets.lapNumber);
    for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      writeDouble(slot, 'elapsedTime', elapsed);
      expect(decodeLiveCaptureSample(slot)).toBeNull();
    }
    writeDouble(slot, 'elapsedTime', 1);
    expect(decodeLiveCaptureSample(slot.subarray(0, VEHICLE_TELEMETRY.size - 1))).toBeNull();
  });
});
