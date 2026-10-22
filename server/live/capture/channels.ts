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
  return [
  ...(['forward', 'left', 'up'] as const).map((axis, i) => ({
    name: `velocity_${axis}_mps`, unit: 'm/s', sourceField: `localVel.${['z', 'x', 'y'][i]}`,
    frame: 'iso8855-vehicle' as const, verified: true,
  })),
  ...(['roll', 'pitch', 'yaw'] as const).map((axis, i) => ({
    name: `${axis}_rate_radps`, unit: 'rad/s', sourceField: `localRot.${['z', 'x', 'y'][i]}`,
    frame: 'iso8855-vehicle' as const, verified: true,
  })),
  ...['fl', 'fr', 'rl', 'rr'].flatMap(corner => [
    { name: `${corner}_patch_lateral_mps`, unit: 'm/s', sourceField: 'lateralPatchVel', frame: 'iso8855-wheel' as const, verified: wheelsVerified },
    { name: `${corner}_patch_longitudinal_mps`, unit: 'm/s', sourceField: 'longitudinalPatchVel', frame: 'iso8855-wheel' as const, verified: wheelsVerified },
  ]),
  ...['fl', 'fr', 'rl', 'rr'].flatMap(corner => [
    { name: `${corner}_ground_lateral_mps`, unit: 'm/s', sourceField: 'lateralGroundVel', frame: 'iso8855-wheel' as const, verified: wheelsVerified },
    { name: `${corner}_ground_longitudinal_mps`, unit: 'm/s', sourceField: 'longitudinalGroundVel', frame: 'iso8855-wheel' as const, verified: wheelsVerified },
  ]),
  ...(normalizationVersion >= 3 ? ['fl', 'fr', 'rl', 'rr'].map(corner => ({
    name: `${corner}_tyre_vertical_deflection_m`, unit: 'm', sourceField: 'verticalTireDeflection',
    frame: 'iso8855-wheel' as const, verified: true,
  })) : []),
  ];
}

export const LIVE_CAPTURE_CHANNELS = liveCaptureChannels(LIVE_CAPTURE_NORMALIZATION_VERSION);
