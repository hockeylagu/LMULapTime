import { describe, expect, it } from 'vitest';
import { LIVE_CAPTURE_CHANNELS } from '../../../../server/live/capture/channels.js';
import { decodeLiveCaptureSample } from '../../../../server/live/capture/decode.js';
import { VEHICLE_TELEMETRY } from '../../../../server/live/rf2Layout.js';

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
    expect(Array.from(sample!.values.slice(0, 6))).toEqual([4, -2, 3, -7, 5, 6]);
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
    expect(Array.from(sample!.values.slice(0, 3))).toEqual([-0.5, 0.10000000000000002, -0.25]);
  });

  it('uses NaN for nonfinite channel inputs and leaves every wheel value unavailable', () => {
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

    const sample = decodeLiveCaptureSample(slot);
    expect(sample?.lapStartSeconds).toBeNull();
    expect(Number.isNaN(sample!.values[0])).toBe(true);
    expect(Number.isNaN(sample!.values[1])).toBe(true);
    expect(Number.isNaN(sample!.values[2])).toBe(true);
    expect(Array.from(sample!.values.slice(3, 6))).toEqual([0.3, -0.1, Number.NaN]);
    expect(sample!.values).toHaveLength(30);
    expect(sample!.values.slice(6).every(Number.isNaN)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS).toHaveLength(30);
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
