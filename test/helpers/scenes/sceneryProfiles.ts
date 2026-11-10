import type { SceneryCamera, SceneryCameraTypeProfile, SceneryHosekSky, SceneryShading, ScenerySky, ScenerySun } from '../../../shared/types/scenes/scenery.js';

/** A synthetic camera type: two time-of-day profiles with different curves, so interpolation shows. */
function cameraType(window: SceneryCameraTypeProfile['meteringWindow'], adaptationScale: number, targets: [number, number]): SceneryCameraTypeProfile {
  return {
    meteringWindow: window, adaptationScale, weatherBlendRate: 0.25,
    profiles: [
      { sunTarget: 0, targetExposure: targets[0], whiteBalanceK: 7000, toneCurve: { a: 2.5, b: 0.6 }, weatherLerpPower: 1, overcast: { targetExposure: targets[0] * 1.5, whiteBalanceK: 7500, toneCurve: { a: 2, b: 0.5 } } },
      { sunTarget: 60, targetExposure: targets[1], whiteBalanceK: 6500, toneCurve: { a: 3, b: 0.7 }, weatherLerpPower: 1, overcast: { targetExposure: targets[1] * 1.5, whiteBalanceK: 7200, toneCurve: { a: 2.4, b: 0.6 } } },
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

/** Synthetic shading parameters: a mirror kernel and one blurred kernel of three directions. */
export function testShading(): SceneryShading {
  return {
    sunGlint: { cosineThreshold: 0.999, roughnessCutoff: 0.2, smoothSpecularScale: 0.4 },
    smallEdge: { detectorScale: 5, edgeScale: 4, limitMin: 0.5, limitMax: 100 },
    carPaintReflection: { roughnessCutoff: 0.2, lodScale: 6, clearCoatLod: 'bias', baseCoatLod: 'explicit' },
    convolution: { kernels: [{ specularPower: 'INF', sourceLod: 0, samples: [[0, 1, 0]] }, { specularPower: '32', sourceLod: 2, samples: [[0, 1, 0], [0.6, 0.8, 0], [0, 0.8, 0.6]] }] },
    sceneryReflection: { lodScale: 7, lod: 'explicit', dielectricF0: 0.08, families: ['ROAD', 'STANDARD'] },
    // 2 × 2: scale rises with N·V, bias falls with roughness.
    integrationMap: { width: 2, height: 2, encoding: 'unorm8', scale: [10, 200, 20, 150], bias: [250, 40, 100, 20] },
    shadows: {
      atlas: { count: 2, sizePx: 64, tilePx: 32, cascadeTiles: [[0, 0, 0], [0, 32, 0], [1, 0, 0]] },
      select: { method: 'firstContainingTile', halfExtent: 0.49 },
      filter: { hardwarePcf: true, texelSize: 1 / 64, scale: 0.25, taps: [{ offset: [-0.5, 0.5], weight: 2 }, { offset: [0.5, -0.5], weight: 2 }] },
      normalOffset: { scale: 0.05, by: 'normalShadowInfluence' },
      texelSnap: true,
      fit: { shape: 'square', widthPerSplit: 1.1 },
      fade: { endsAtFar: true, lengthOfLastSpan: 0.75 },
      cameras: {
        chase: { nearM: 0.1, farM: 300, splitRatio: 0.9, count: 3, splitsM: [20, 80, 300] },
        cockpit: { nearM: 0.01, farM: 200, splitRatio: 0.9, count: 2, splitsM: [30, 200] },
        tv: { nearM: 1, farM: 500, splitRatio: null, count: null, splitsM: null },
      },
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
    sun: testSun(),
    // Linear sRGB primaries (D65), a fifth albedo, a 8 km scale height at sea level; one bluish sky distribution at every turbidity.
    hosek: {
      albedo: 0.2, scaleHeightM: 8000, altitudeM: 0,
      xyzToRgb: [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]],
      ...testHosekDatasets([TEST_HOSEK_DISTRIBUTION, TEST_HOSEK_DISTRIBUTION, TEST_HOSEK_DISTRIBUTION], [9, 10, 13]),
    },
    haze: {
      depth: { base: 0.2, overcast: 0.3, pollution: 0.1 }, intensity: { base: 1, dawn: 2, overcast: 0.5 },
      luminance: { sunrise: 0.4, base: 0.8, pollution: 0.9, overcast: 0.6, storm: 0.5 },
    },
    // Two colour looks along the direct sun's strength: neutral for a weak sun, a cooler saturated sky for a strong one.
    colourProfiles: {
      weatherBlendRate: 0.25,
      profiles: [
        { sunTarget: 0, weatherLerpPower: 1, clear: { gain: [1, 1, 1], sunProximity: 0.8 }, overcast: { gain: [1, 1, 1], sunProximity: 1 } },
        { sunTarget: 200, weatherLerpPower: 1, clear: { gain: [1, 0.8, 0.6], sunProximity: 1 }, overcast: { gain: [0.9, 0.9, 0.9], sunProximity: 1 } },
      ],
    },
  };
}

/** A synthetic sun grid: a warm low sun, a near-white high sun, half as bright under full cover. */
export function testSun(): ScenerySun {
  const clear: [number, number, number][] = [[20, 12, 5], [80, 78, 65], [100, 104, 95]];
  return { unit: 'test radiance', sunElevationDeg: [3, 30, 90], cloudCoverage: [0, 1], grid: [clear, clear.map(([r, g, b]) => [r / 2, g / 2, b / 2])] };
}

/** A synthetic Hosek-Wilkie A–I with a strong glow around the sun (not the published data). */
export const TEST_HOSEK_DISTRIBUTION = [-1.07, -0.17, 1.11, 3.67, -4.25, 0.88, 0.16, 1.95, 0.69];

/** Hosek-Wilkie datasets (albedo × turbidity × control point) holding one distribution and radiance per channel everywhere. */
export function testHosekDatasets(distributions: number[][], radiances: number[]): Pick<SceneryHosekSky, 'coefficients' | 'radiances'> {
  const channel = (values: number[]) => Array.from({ length: values.length * 6 * 10 * 2 }, (_, i) => values[i % values.length]);
  return {
    coefficients: distributions.map(channel) as SceneryHosekSky['coefficients'],
    radiances: radiances.map(value => channel([value])) as SceneryHosekSky['radiances'],
  };
}

/**
 * The catalog's form of a sky: the sun grid under `layouts` by layout key instead of the layout's own `grid`, and the layout's
 * altitude under the sky model's `layoutAltitudeM`.
 */
export function catalogSky(sky: ScenerySky, layoutKeys: string[]) {
  const { grid, ...sun } = sky.sun, { altitudeM, ...hosek } = sky.hosek;
  return {
    ...sky,
    hosek: { ...hosek, layoutAltitudeM: Object.fromEntries(layoutKeys.map(key => [key, altitudeM])) },
    sun: { ...sun, layouts: Object.fromEntries(layoutKeys.map(key => [key, grid])) },
  };
}

/** The daylight's haze weights and height scalars, for daylight fixtures. */
export const TEST_HAZE_WEIGHTS = { hazeCloudyScale: 1, hazeStormScale: 1, hazeDawnScale: 1, fogHeightAltitudeScalar: 1, fogHeightExponentScalar: 1 };
