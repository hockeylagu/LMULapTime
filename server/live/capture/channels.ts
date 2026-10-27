import { LIVE_CAPTURE_NORMALIZATION_VERSION } from '../../../shared/types/liveCapture.js';

export interface LiveCaptureChannel {
  name: string;
  unit: string;
  sourceField: string;
  /** `raw`: a source value stored as the game reports it, with no ISO frame (its meaning is not yet validated). */
  frame: 'iso8855-vehicle' | 'iso8855-wheel' | 'raw';
  verified: boolean;
}

/**
 * Version 4: raw hybrid values for validating the live deployment advice. Stored as the game reports them (zero on a
 * car without a hybrid system); `verified` here only means the column is stored, not that the meaning is confirmed.
 */
const HYBRID_CHANNELS: readonly LiveCaptureChannel[] = [
  { name: 'battery_charge_fraction', unit: 'fraction', sourceField: 'batteryChargeFraction', frame: 'raw', verified: true },
  { name: 'soc_raw', unit: 'raw', sourceField: 'soc', frame: 'raw', verified: true },
  { name: 'motor_map', unit: 'index', sourceField: 'motorMap', frame: 'raw', verified: true },
  { name: 'motor_map_max', unit: 'index', sourceField: 'motorMapMax', frame: 'raw', verified: true },
  { name: 'electric_motor_state', unit: 'enum', sourceField: 'electricBoostMotorState', frame: 'raw', verified: true },
  { name: 'regen_raw', unit: 'raw', sourceField: 'regen', frame: 'raw', verified: true },
];

/** Per-recording catalog: old recordings must not acquire verification for values they never captured. */
export function liveCaptureChannels(normalizationVersion: number): readonly LiveCaptureChannel[] {
  if (!Number.isInteger(normalizationVersion) || normalizationVersion < 1 || normalizationVersion > LIVE_CAPTURE_NORMALIZATION_VERSION) {
    throw new Error(`Unsupported live capture normalization version ${normalizationVersion}`);
  }
  const wheelsVerified = normalizationVersion >= 2;
  // Only channels the app reads; dropped source fields and their conventions are listed in docs/LIVE_CAPTURE_FORMAT.md.
  return [
    { name: 'velocity_forward_mps', unit: 'm/s', sourceField: 'localVel.z', frame: 'iso8855-vehicle', verified: true },
    { name: 'velocity_left_mps', unit: 'm/s', sourceField: 'localVel.x', frame: 'iso8855-vehicle', verified: true },
    { name: 'yaw_rate_radps', unit: 'rad/s', sourceField: 'localRot.y', frame: 'iso8855-vehicle', verified: true },
    ...(['patch', 'ground'] as const).flatMap(kind => ['fl', 'fr', 'rl', 'rr'].map(corner => ({
      name: `${corner}_${kind}_longitudinal_mps`, unit: 'm/s', sourceField: `longitudinal${kind === 'patch' ? 'Patch' : 'Ground'}Vel`,
      frame: 'iso8855-wheel' as const, verified: wheelsVerified,
    }))),
    ...(normalizationVersion >= 4 ? HYBRID_CHANNELS : []),
  ];
}

export const LIVE_CAPTURE_CHANNELS = liveCaptureChannels(LIVE_CAPTURE_NORMALIZATION_VERSION);
