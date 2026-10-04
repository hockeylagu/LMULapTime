import { normalizeCarClass } from './paceCategory.js';

export interface VehicleSize {
  readonly lengthM: number;
  readonly widthM: number;
}

/** Approximate visual envelopes, not measured dimensions or class regulation limits. */
export const DEFAULT_CLASS_VEHICLE_SIZES: Readonly<Record<string, VehicleSize>> = {
  LMH: { lengthM: 5, widthM: 2 },
  LMGT3: { lengthM: 4.8, widthM: 2.05 },
  GTE: { lengthM: 4.8, widthM: 2.05 },
  LMP2wec: { lengthM: 4.7, widthM: 1.9 },
  LMP2elms: { lengthM: 4.7, widthM: 1.9 },
  LMP3: { lengthM: 4.65, widthM: 1.9 },
};

/** A neutral visual size when class identity is unavailable; never substitute another car. */
export const UNKNOWN_VEHICLE_SIZE: VehicleSize = { lengthM: 4.8, widthM: 2 };

export function defaultVehicleSize(carClass?: string): VehicleSize {
  return DEFAULT_CLASS_VEHICLE_SIZES[normalizeCarClass(carClass)] ?? UNKNOWN_VEHICLE_SIZE;
}
