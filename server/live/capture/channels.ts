import { LIVE_CAPTURE_NORMALIZATION_VERSION } from '../../../shared/types/liveCapture.js';

export interface LiveCaptureChannel {
  name: string;
  unit: string;
  sourceField: string;
  frame: 'iso8855-vehicle' | 'iso8855-wheel';
  verified: boolean;
}

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
  ];
}

export const LIVE_CAPTURE_CHANNELS = liveCaptureChannels(LIVE_CAPTURE_NORMALIZATION_VERSION);
