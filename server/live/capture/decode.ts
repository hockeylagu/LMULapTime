import type { LiveCaptureSample } from '../../../shared/types/liveCapture.js';
import { LIVE_CAPTURE_CHANNELS } from './channels.js';
import { VEHICLE_TELEMETRY } from '../rf2Layout.js';

const SAMPLE_VALUE_COUNT = LIVE_CAPTURE_CHANNELS.length;

function finiteOrNaN(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Decode one coherent rF2 telemetry vehicle slot into the normalized live-capture schema. */
export function decodeLiveCaptureSample(slot: Buffer): LiveCaptureSample | null {
  if (slot.length < VEHICLE_TELEMETRY.size) return null;

  const at = VEHICLE_TELEMETRY.offsets;
  const elapsedSeconds = slot.readDoubleLE(at.elapsedTime);
  if (!Number.isFinite(elapsedSeconds)) return null;

  const lapNumber = slot.readInt32LE(at.lapNumber);
  const lapStart = slot.readDoubleLE(at.lapStartET);
  const values = new Float64Array(SAMPLE_VALUE_COUNT);
  values.fill(Number.NaN);

  // ISO 8855 vehicle axes are forward, left, up. LMU local axes are right, up, back.
  values[0] = finiteOrNaN(-slot.readDoubleLE(at.localVel + 2 * 8));
  values[1] = finiteOrNaN(-slot.readDoubleLE(at.localVel));
  values[2] = finiteOrNaN(slot.readDoubleLE(at.localVel + 8));

  // Angular velocity is an axial vector; this mapping is the same proper rotation as velocity.
  values[3] = finiteOrNaN(-slot.readDoubleLE(at.localRot + 2 * 8));
  values[4] = finiteOrNaN(-slot.readDoubleLE(at.localRot));
  values[5] = finiteOrNaN(slot.readDoubleLE(at.localRot + 8));

  return {
    elapsedSeconds,
    lapNumber,
    lapStartSeconds: Number.isFinite(lapStart) && lapStart >= 0 ? lapStart : null,
    values,
  };
}
