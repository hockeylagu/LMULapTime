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
  it('maps cardinal vehicle vectors to ISO forward and left velocity and yaw rate', () => {
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
    expect(Array.from(sample!.values.slice(0, 3))).toEqual([4, 2, -6]);
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
    expect(Array.from(sample!.values.slice(0, 2))).toEqual([-0.5, -0.10000000000000002]);
  });

  it('uses NaN for nonfinite inputs without converting missing wheel values to measured zero', () => {
    const slot = vehicleSlot();
    writeDouble(slot, 'elapsedTime', 1);
    slot.writeInt32LE(0, VEHICLE_TELEMETRY.offsets.lapNumber);
    writeDouble(slot, 'lapStartET', Number.NaN);
    writeDouble(slot, 'localVel', Number.NaN, 0);
    writeDouble(slot, 'localVel', Number.POSITIVE_INFINITY, 1);
    writeDouble(slot, 'localVel', Number.NEGATIVE_INFINITY, 2);
    writeDouble(slot, 'localRot', 0.3, 1);
    for (let corner = 0; corner < 4; corner++) for (const field of ['longitudinalPatchVel', 'longitudinalGroundVel']) {
      slot.writeDoubleLE(corner % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
        VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size + WHEEL.offsets[field]);
    }

    const sample = decodeLiveCaptureSample(slot);
    expect(sample?.lapStartSeconds).toBeNull();
    expect(Number.isNaN(sample!.values[0])).toBe(true);
    expect(Number.isNaN(sample!.values[1])).toBe(true);
    expect(sample!.values[2]).toBe(-0.3);
    expect(sample!.values).toHaveLength(11);
    expect(sample!.values.slice(3).every(Number.isNaN)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS).toHaveLength(11);
  });

  it('uses ISO component signs at all four distinct corners', () => {
    const slot = vehicleSlot(); writeDouble(slot, 'elapsedTime', 1);
    for (let corner = 0; corner < 4; corner++) {
      const at = VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size;
      for (const [field, value] of [['longitudinalPatchVel', -10 - corner], ['longitudinalGroundVel', 30 + corner]] as const) {
        slot.writeDoubleLE(value, at + WHEEL.offsets[field]);
      }
    }
    const values = decodeLiveCaptureSample(slot)!.values;
    expect(Array.from(values.slice(3, 7))).toEqual([10, 11, 12, 13]);
    expect(Array.from(values.slice(7, 11))).toEqual([-30, -31, -32, -33]);
    // A valid stationary zero is available, unlike nonfinite input.
    expect(decodeLiveCaptureSample(vehicleSlot())!.values.slice(3).every(value => value === 0)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS.every(channel => channel.verified)).toBe(true);
    expect(liveCaptureChannels(1).slice(3).every(channel => !channel.verified)).toBe(true);
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

  it('retains raw 16-byte terrain names and finite last-impact magnitude without inventing zeros', () => {
    const slot = vehicleSlot(); writeDouble(slot, 'elapsedTime', 100);
    writeDouble(slot, 'lastImpactET', 99.125); writeDouble(slot, 'lastImpactMagnitude', 8896.12345);
    for (let corner = 0; corner < 4; corner++) {
      const offset = VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size;
      slot.write(['RDRACEOLD,ROAD,', 'RMBLFLAT', '1234567890ABCDEF', ''][corner], offset + WHEEL.offsets.terrainName, 16, 'latin1');
    }
    const decoded = decodeLiveCaptureSample(slot)!;
    expect(decoded.terrainMaterials).toEqual(['RDRACEOLD,ROAD,', 'RMBLFLAT', '1234567890ABCDEF', '']);
    expect(decoded.impact).toEqual({ elapsedSeconds: 99.125, magnitude: 8896.12345 });
    writeDouble(slot, 'lastImpactMagnitude', Infinity);
    expect(decodeLiveCaptureSample(slot)?.impact?.magnitude).toBeNull();
    writeDouble(slot, 'lastImpactET', 101);
    expect(decodeLiveCaptureSample(slot)?.impact).toBeUndefined();
  });
});
