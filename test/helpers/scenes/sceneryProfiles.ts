import type { SceneryCamera, SceneryCameraTypeProfile, ScenerySky } from '../../../shared/types/scenes/scenery.js';

/** A synthetic camera type: two time-of-day profiles with different curves, so interpolation shows. */
function cameraType(window: SceneryCameraTypeProfile['meteringWindow'], adaptationScale: number, targets: [number, number]): SceneryCameraTypeProfile {
  return {
    meteringWindow: window, adaptationScale, weatherBlendRate: 0.25,
    profiles: [
      { sunElevationDeg: 0, targetExposure: targets[0], whiteBalanceK: 7000, toneCurve: { a: 2.5, b: 0.6 }, weatherLerpPower: 1, overcast: { targetExposure: targets[0] * 1.5, whiteBalanceK: 7500, toneCurve: { a: 2, b: 0.5 } } },
      { sunElevationDeg: 60, targetExposure: targets[1], whiteBalanceK: 6500, toneCurve: { a: 3, b: 0.7 }, weatherLerpPower: 1, overcast: { targetExposure: targets[1] * 1.5, whiteBalanceK: 7200, toneCurve: { a: 2.4, b: 0.6 } } },
    ],
    ambientOcclusion: { radiusM: 0.4, samples: 8, scale: 2, colour: 0.4 },
  };
}

/** Synthetic package camera and sky profiles for tests (not game values). */
export function testCamera(): SceneryCamera {
  return {
    outputGamma: 2.2, sceneLuminanceScale: 2,
    types: {
      external: cameraType({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 0.4, [0.4, 0.2]),
      onboard: cameraType({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 0.4, [0.35, 0.18]),
      tv: cameraType({ x: 0.1, y: 0, width: 0.8, height: 0.9 }, 0.6, [0.3, 0.15]),
    },
  };
}

export function testSky(): ScenerySky {
  return {
    perezScale: [1, 0.5, 0.5, 2, 1],
    perezMultipliers: [{ sunElevationDeg: 0, abcd: [1, 1, 1, 1] }, { sunElevationDeg: 20, abcd: [0.8, 0.8, 0.4, 1] }, { sunElevationDeg: 90, abcd: [1, 1, 1, 1] }],
    pollution: { cloudyDamping: 0.5 },
    turbidity: { base: 2, overcast: 1, storm: 1, pollution: 2, min: 1.5, max: 6 },
    airMass: { clear: 1, pollution: 1.2 },
    fog: {
      density: { base: 0.0002, overcast: 0.0001, storm: 0.001, sunrise: 0.0001, pollution: 0.0004, min: 0.00002, max: 0.02 },
      colour: {
        horizonSampleElevationDeg: 5, horizonSampleCount: 6, horizonFovDeg: 30, pollutionOffset: [0.2, 0.05, 0],
        override: { base: 0.2, overcast: 0.5, storm: 0.4 }, luminance: { base: 0.5, sunrise: 0.2, overcast: 0.3, storm: 0.8 },
        sunElevationRampDeg: 30, sunElevationRampOffset: 0.4,
      },
      sunInfluence: 0.05,
      height: { max: 0.5, scalar: 0.002, exponent: 1.5, scalarMin: 0.0001, scalarMax: 0.02, exponentMin: 0.05 },
    },
  };
}

/** The daylight's haze weights and height scalars, for daylight fixtures. */
export const TEST_HAZE_WEIGHTS = { hazeCloudyScale: 1, hazeStormScale: 1, hazeDawnScale: 1, fogHeightAltitudeScalar: 1, fogHeightExponentScalar: 1 };
