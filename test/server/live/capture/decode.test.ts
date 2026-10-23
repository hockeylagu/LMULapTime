import { describe, expect, it } from 'vitest';
import { LIVE_CAPTURE_CHANNELS, liveCaptureChannels } from '../../../../server/live/capture/channels.js';
import { LIVE_CAPTURE_ROW_CAPACITY, LiveCaptureRows, writeLiveCaptureRow } from '../../../../server/live/capture/decode.js';
import { VEHICLE_TELEMETRY, WHEEL } from '../../../../server/live/rf2Layout.js';
import { LIVE_CAPTURE_SAMPLE_WIDTH } from '../../../../shared/types/liveCapture.js';

function vehicleSlot(): Buffer {
  return Buffer.alloc(VEHICLE_TELEMETRY.size);
}

function writeDouble(slot: Buffer, field: string, value: number, element = 0): void {
  slot.writeDoubleLE(value, VEHICLE_TELEMETRY.offsets[field] + element * 8);
}

/** One written row, read back by field; null when the slot was refused. */
function decodeRow(slot: Buffer) {
  const row = new Float64Array(LIVE_CAPTURE_SAMPLE_WIDTH);
  if (!writeLiveCaptureRow(slot, row, 0)) return null;
  return { elapsedSeconds: row[0], lapNumber: row[1], lapStartSeconds: Number.isNaN(row[2]) ? null : row[2], values: row.subarray(3) };
}

describe('writeLiveCaptureRow', () => {
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

    const sample = decodeRow(slot);
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

    const sample = decodeRow(slot);
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

    const sample = decodeRow(slot);
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
    const values = decodeRow(slot)!.values;
    expect(Array.from(values.slice(3, 7))).toEqual([10, 11, 12, 13]);
    expect(Array.from(values.slice(7, 11))).toEqual([-30, -31, -32, -33]);
    // A valid stationary zero is available, unlike nonfinite input.
    expect(decodeRow(vehicleSlot())!.values.slice(3).every((value: number) => value === 0)).toBe(true);
    expect(LIVE_CAPTURE_CHANNELS.every(channel => channel.verified)).toBe(true);
    expect(liveCaptureChannels(1).slice(3).every(channel => !channel.verified)).toBe(true);
    expect(() => liveCaptureChannels(999)).toThrow('Unsupported');
  });

  it('rejects invalid elapsed time and truncated slots', () => {
    const slot = vehicleSlot();
    slot.writeInt32LE(0, VEHICLE_TELEMETRY.offsets.lapNumber);
    for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      writeDouble(slot, 'elapsedTime', elapsed);
      expect(decodeRow(slot)).toBeNull();
    }
    writeDouble(slot, 'elapsedTime', 1);
    expect(decodeRow(slot.subarray(0, VEHICLE_TELEMETRY.size - 1))).toBeNull();
  });

});

describe('LiveCaptureRows', () => {
  function terrainSlot(): Buffer {
    const slot = vehicleSlot(); writeDouble(slot, 'elapsedTime', 100);
    writeDouble(slot, 'lastImpactET', 99.125); writeDouble(slot, 'lastImpactMagnitude', 8896.12345);
    for (let corner = 0; corner < 4; corner++) {
      const offset = VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size;
      slot.write(['RDRACEOLD,ROAD,', 'RMBLFLAT', '1234567890ABCDEF', ''][corner], offset + WHEEL.offsets.terrainName, 16, 'latin1');
    }
    return slot;
  }

  it('retains raw 16-byte terrain names and finite last-impact magnitude without inventing zeros', () => {
    const slot = terrainSlot();
    const rows = new LiveCaptureRows();
    rows.add(slot, false);
    expect(rows.take()?.sparse).toEqual([{ row: 0, terrainMaterials: ['RDRACEOLD,ROAD,', 'RMBLFLAT', '1234567890ABCDEF', ''],
      impact: { elapsedSeconds: 99.125, magnitude: 8896.12345 } }]);
    writeDouble(slot, 'lastImpactMagnitude', Infinity);
    rows.add(slot, false);
    expect(rows.take()?.sparse).toEqual([{ row: 0, impact: { elapsedSeconds: 99.125, magnitude: null } }]);
    writeDouble(slot, 'lastImpactET', 101);
    rows.add(slot, false);
    expect(rows.take()?.sparse).toEqual([]);
  });

  it('sends terrain and impact only when their raw values change, and both again on a checkpoint', () => {
    const slot = terrainSlot();
    const rows = new LiveCaptureRows();
    rows.add(slot, false);
    rows.add(slot, false);
    slot.fill(0, VEHICLE_TELEMETRY.offsets.wheels + WHEEL.offsets.terrainName, VEHICLE_TELEMETRY.offsets.wheels + WHEEL.offsets.terrainName + 16);
    slot.write('GRVL', VEHICLE_TELEMETRY.offsets.wheels + WHEEL.offsets.terrainName, 16, 'latin1');
    rows.add(slot, false);
    rows.add(slot, true);
    expect(rows.take()?.sparse.map(change => [change.row, change.terrainMaterials?.[0], change.impact?.elapsedSeconds])).toEqual([
      [0, 'RDRACEOLD,ROAD,', 99.125], [2, 'GRVL', undefined], [3, 'GRVL', 99.125],
    ]);
    rows.reset();
    rows.add(slot, false);
    expect(rows.take()?.sparse).toEqual([expect.objectContaining({ row: 0, terrainMaterials: expect.any(Array) as unknown })]);
  });

  it('holds at most its capacity, then hands over rows it no longer writes to', () => {
    const slot = vehicleSlot();
    const rows = new LiveCaptureRows();
    expect(rows.take()).toBeNull();
    for (let index = 0; index <= LIVE_CAPTURE_ROW_CAPACITY; index++) {
      writeDouble(slot, 'elapsedTime', index);
      rows.add(slot, false);
    }
    expect(rows.full).toBe(true);
    const batch = rows.take()!;
    expect(batch.rows).toHaveLength(LIVE_CAPTURE_ROW_CAPACITY * LIVE_CAPTURE_SAMPLE_WIDTH);
    expect(batch.rows[(LIVE_CAPTURE_ROW_CAPACITY - 1) * LIVE_CAPTURE_SAMPLE_WIDTH]).toBe(LIVE_CAPTURE_ROW_CAPACITY - 1);
    rows.add(slot, false);
    expect(batch.rows[0]).toBe(0);
    expect(rows.full).toBe(false);
    writeDouble(slot, 'elapsedTime', Number.NaN);
    rows.add(slot, false);
    expect(rows.take()?.rows).toHaveLength(LIVE_CAPTURE_SAMPLE_WIDTH);
  });
});
