import type { LiveCaptureSample } from '../../../shared/types/liveCapture.js';
import { LIVE_CAPTURE_CHANNELS } from './channels.js';
import { VEHICLE_TELEMETRY, WHEEL } from '../rf2Layout.js';

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

  // The producer defines left/up/back in a left-handed frame; ISO is forward/left/up.
  values[0] = finiteOrNaN(-slot.readDoubleLE(at.localVel + 2 * 8));
  values[1] = finiteOrNaN(slot.readDoubleLE(at.localVel));
  // Axial vectors also change handedness: raw +Y yaws right.
  values[2] = finiteOrNaN(-slot.readDoubleLE(at.localRot + 8));

  for (let corner = 0; corner < 4; corner++) {
    const wheel = at.wheels + corner * WHEEL.size;
    // Wheel longitudinal is back-positive and must be negated.
    values[3 + corner] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalPatchVel));
    values[7 + corner] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalGroundVel));
  }

  const impactTime = slot.readDoubleLE(at.lastImpactET);
  const impactMagnitude = slot.readDoubleLE(at.lastImpactMagnitude);

  return {
    elapsedSeconds,
    lapNumber,
    lapStartSeconds: Number.isFinite(lapStart) && lapStart >= 0 ? lapStart : null,
    values,
    terrainMaterials: Array.from({ length: 4 }, (_, corner) => {
      const start = at.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName;
      let end = start;
      while (end < start + 16 && slot[end] !== 0) end++;
      return slot.toString('latin1', start, end);
    }),
    ...(Number.isFinite(impactTime) && impactTime > 0 && impactTime <= elapsedSeconds ? {
      impact: { elapsedSeconds: impactTime, magnitude: Number.isFinite(impactMagnitude) && impactMagnitude >= 0 ? impactMagnitude : null },
    } : {}),
  };
}
