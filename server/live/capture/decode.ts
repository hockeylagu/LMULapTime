import { LIVE_CAPTURE_SAMPLE_WIDTH } from '../../../shared/types/liveCapture.js';
import type { LiveCaptureSampleBatch, LiveCaptureSparseRow } from '../../../shared/types/liveCapture.js';
import { VEHICLE_TELEMETRY, WHEEL } from '../rf2Layout.js';

/** Rows held before the reader must post them: half a second at 50 Hz. Scoring changes post them sooner. */
export const LIVE_CAPTURE_ROW_CAPACITY = 25;
const TERRAIN_NAME_BYTES = 16;

function finiteOrNaN(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN;
}

function terrainOffset(corner: number): number {
  return VEHICLE_TELEMETRY.offsets.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName;
}

/**
 * Writes one coherent rF2 telemetry vehicle slot as a normalized capture row at `offset`:
 * session seconds, lap number, lap-start seconds, then the channels. False (nothing written) without a session time.
 */
export function writeLiveCaptureRow(slot: Buffer, rows: Float64Array, offset: number): boolean {
  if (slot.length < VEHICLE_TELEMETRY.size) return false;
  const at = VEHICLE_TELEMETRY.offsets;
  const elapsedSeconds = slot.readDoubleLE(at.elapsedTime);
  if (!Number.isFinite(elapsedSeconds)) return false;
  const lapStart = slot.readDoubleLE(at.lapStartET);
  rows[offset] = elapsedSeconds;
  rows[offset + 1] = slot.readInt32LE(at.lapNumber);
  rows[offset + 2] = Number.isFinite(lapStart) && lapStart >= 0 ? lapStart : Number.NaN;
  const values = offset + 3;

  // The producer defines left/up/back in a left-handed frame; ISO is forward/left/up.
  rows[values] = finiteOrNaN(-slot.readDoubleLE(at.localVel + 2 * 8));
  rows[values + 1] = finiteOrNaN(slot.readDoubleLE(at.localVel));
  // Axial vectors also change handedness: raw +Y yaws right.
  rows[values + 2] = finiteOrNaN(-slot.readDoubleLE(at.localRot + 8));

  for (let corner = 0; corner < 4; corner++) {
    const wheel = at.wheels + corner * WHEEL.size;
    // Wheel longitudinal is back-positive and must be negated.
    rows[values + 3 + corner] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalPatchVel));
    rows[values + 7 + corner] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalGroundVel));
  }
  // Raw hybrid values (catalog version 4), in the channel order of channels.ts; not interpreted here.
  rows[values + 11] = finiteOrNaN(slot.readDoubleLE(at.batteryChargeFraction));
  rows[values + 12] = finiteOrNaN(slot.readFloatLE(at.soc));
  rows[values + 13] = slot.readUInt8(at.motorMap);
  rows[values + 14] = slot.readUInt8(at.motorMapMax);
  rows[values + 15] = slot.readUInt8(at.electricBoostMotorState);
  rows[values + 16] = finiteOrNaN(slot.readFloatLE(at.regen));
  return true;
}

/** The four raw per-corner material names, up to their terminator. */
export function readTerrainMaterials(slot: Buffer): string[] {
  const names: string[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const start = terrainOffset(corner);
    let end = start;
    while (end < start + TERRAIN_NAME_BYTES && slot[end] !== 0) end++;
    names.push(slot.toString('latin1', start, end));
  }
  return names;
}

/**
 * The reader's pending capture rows. Terrain names and the last impact are compared on their raw source
 * values and decoded only for a row where they change, or on a checkpoint (the car cadence), which gives
 * a new recording its initial state even when a session transition kept the same values.
 */
export class LiveCaptureRows {
  private rows = new Float64Array(LIVE_CAPTURE_ROW_CAPACITY * LIVE_CAPTURE_SAMPLE_WIDTH);
  private count = 0;
  private sparse: LiveCaptureSparseRow[] = [];
  private readonly terrain = Buffer.alloc(4 * TERRAIN_NAME_BYTES);
  private terrainKnown = false;
  private impactKnown = false;
  private impactTime = Number.NaN;
  private impactMagnitude: number | null = null;

  public get full(): boolean {
    return this.count >= LIVE_CAPTURE_ROW_CAPACITY;
  }

  /** Appends one coherent slot; a slot without a session time, or a full batch, adds nothing. */
  public add(slot: Buffer, checkpoint: boolean): void {
    if (this.full || !writeLiveCaptureRow(slot, this.rows, this.count * LIVE_CAPTURE_SAMPLE_WIDTH)) return;
    const row = this.count++;
    let terrainChanged = !this.terrainKnown;
    for (let corner = 0; corner < 4 && !terrainChanged; corner++) {
      const start = terrainOffset(corner);
      terrainChanged = slot.compare(this.terrain, corner * TERRAIN_NAME_BYTES, (corner + 1) * TERRAIN_NAME_BYTES,
        start, start + TERRAIN_NAME_BYTES) !== 0;
    }
    if (terrainChanged) {
      for (let corner = 0; corner < 4; corner++) {
        const start = terrainOffset(corner);
        slot.copy(this.terrain, corner * TERRAIN_NAME_BYTES, start, start + TERRAIN_NAME_BYTES);
      }
      this.terrainKnown = true;
    }

    const at = VEHICLE_TELEMETRY.offsets;
    const elapsedSeconds = this.rows[row * LIVE_CAPTURE_SAMPLE_WIDTH];
    const time = slot.readDoubleLE(at.lastImpactET);
    const rawMagnitude = slot.readDoubleLE(at.lastImpactMagnitude);
    const known = Number.isFinite(time) && time > 0 && time <= elapsedSeconds;
    const magnitude = known && Number.isFinite(rawMagnitude) && rawMagnitude >= 0 ? rawMagnitude : null;
    const impactChanged = known !== this.impactKnown
      || (known && (time !== this.impactTime || magnitude !== this.impactMagnitude));
    this.impactKnown = known;
    this.impactTime = known ? time : Number.NaN;
    this.impactMagnitude = magnitude;

    const terrainMaterials = checkpoint || terrainChanged ? readTerrainMaterials(slot) : undefined;
    const impact = known && (checkpoint || impactChanged) ? { elapsedSeconds: time, magnitude } : undefined;
    if (terrainMaterials || impact) this.sparse.push({ row, ...(terrainMaterials ? { terrainMaterials } : {}), ...(impact ? { impact } : {}) });
  }

  /** The pending rows as a batch that owns its storage (it can be transferred), or null when there are none. */
  public take(): LiveCaptureSampleBatch | null {
    if (this.count === 0) return null;
    const batch = { rows: this.rows.subarray(0, this.count * LIVE_CAPTURE_SAMPLE_WIDTH), sparse: this.sparse };
    this.rows = new Float64Array(LIVE_CAPTURE_ROW_CAPACITY * LIVE_CAPTURE_SAMPLE_WIDTH);
    this.count = 0;
    this.sparse = [];
    return batch;
  }

  /** A new mapping: pending rows are dropped and the next row carries its terrain and impact. */
  public reset(): void {
    this.count = 0;
    this.sparse = [];
    this.terrainKnown = false;
    this.impactKnown = false;
    this.impactTime = Number.NaN;
    this.impactMagnitude = null;
  }
}
