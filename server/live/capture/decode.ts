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
  values.fill(Number.NaN);

  // The producer defines left/up/back in a left-handed frame; ISO is forward/left/up.
  values[0] = finiteOrNaN(-slot.readDoubleLE(at.localVel + 2 * 8));
  values[1] = finiteOrNaN(slot.readDoubleLE(at.localVel));
  values[2] = finiteOrNaN(slot.readDoubleLE(at.localVel + 8));

  // Axial vectors also change handedness: raw +X pitches up, +Y yaws right, +Z rolls right.
  values[3] = finiteOrNaN(slot.readDoubleLE(at.localRot + 2 * 8));
  values[4] = finiteOrNaN(-slot.readDoubleLE(at.localRot));
  values[5] = finiteOrNaN(-slot.readDoubleLE(at.localRot + 8));

  for (let corner = 0; corner < 4; corner++) {
    const wheel = at.wheels + corner * WHEEL.size;
    // Wheel lateral is already left-positive; longitudinal is back-positive and must be negated.
    values[6 + corner * 2] = finiteOrNaN(slot.readDoubleLE(wheel + WHEEL.offsets.lateralPatchVel));
    values[7 + corner * 2] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalPatchVel));
    values[14 + corner * 2] = finiteOrNaN(slot.readDoubleLE(wheel + WHEEL.offsets.lateralGroundVel));
    values[15 + corner * 2] = finiteOrNaN(-slot.readDoubleLE(wheel + WHEEL.offsets.longitudinalGroundVel));
    // ISO camber is outward-positive on BOTH sides, matching the producer (not a signed roll angle).
    values[22 + corner] = finiteOrNaN(slot.readDoubleLE(wheel + WHEEL.offsets.camber));
    // Current wheel orientation includes steering. ISO toe-in is positive: rightward points inward
    // at a left wheel and outward at a right wheel. This is not the static garage alignment setting.
    values[26 + corner] = finiteOrNaN(slot.readDoubleLE(wheel + WHEEL.offsets.toe) * (corner % 2 === 0 ? 1 : -1));
    // A compression distance, not suspension travel or a vector-axis component; retain metres/sign.
    values[30 + corner] = finiteOrNaN(slot.readDoubleLE(wheel + WHEEL.offsets.verticalTireDeflection));
  }

  const impactTime = slot.readDoubleLE(at.lastImpactET);
  const impactMagnitude = slot.readDoubleLE(at.lastImpactMagnitude);

  return {
    elapsedSeconds,
    lapNumber,
    lapStartSeconds: Number.isFinite(lapStart) && lapStart >= 0 ? lapStart : null,
    values,
    terrainMaterials: Array.from({ length: 4 }, (_, corner) => {
      const field = slot.subarray(at.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName,
        at.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName + 16);
      const end = field.indexOf(0);
      return field.toString('latin1', 0, end < 0 ? field.length : end);
    }),
    ...(Number.isFinite(impactTime) && impactTime > 0 && impactTime <= elapsedSeconds ? {
      impact: { elapsedSeconds: impactTime, magnitude: Number.isFinite(impactMagnitude) && impactMagnitude >= 0 ? impactMagnitude : null },
    } : {}),
  };
}
