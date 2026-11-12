import { createHash } from 'node:crypto';
import { resolveShadowSplits } from '../../../shared/packageContract/index.js';
import type { SceneryClouds, SceneryCloudsFile } from '../../../shared/types/scenes/clouds.js';
import type { SceneryCamera, SceneryCameraTypeProfile, SceneryHosekSky, SceneryShading, ScenerySky, ScenerySun } from '../../../shared/types/scenes/scenery.js';

/** A synthetic camera type: two time-of-day profiles with different curves, so interpolation shows. */
function cameraType(window: SceneryCameraTypeProfile['meteringWindow'], adaptationScale: number, targets: [number, number]): SceneryCameraTypeProfile {
  return {
    meteringWindow: window, adaptationScale, weatherBlendRate: 0.25,
    profiles: [
      { sunTarget: 0, targetExposure: targets[0], lightDarkBorder: 1.5, minExposure: 0, maxExposure: 4, whiteBalanceK: 7000, toneCurve: { a: 2.5, b: 0.6 }, weatherLerpPower: 1,
        overcast: { targetExposure: targets[0] * 1.5, lightDarkBorder: 2, minExposure: 0.1, maxExposure: 5, whiteBalanceK: 7500, toneCurve: { a: 2, b: 0.5 } } },
      { sunTarget: 60, targetExposure: targets[1], lightDarkBorder: 1.25, minExposure: 0, maxExposure: 1, whiteBalanceK: 6500, toneCurve: { a: 3, b: 0.7 }, weatherLerpPower: 1,
        overcast: { targetExposure: targets[1] * 1.5, lightDarkBorder: 2, minExposure: 0.1, maxExposure: 2, whiteBalanceK: 7200, toneCurve: { a: 2.4, b: 0.6 } } },
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
      centre: { along: 'viewForward', at: 'sliceMidpoint', firstSliceStartsAt: 'nearM' },
      orientation: { followsView: false, u: 'horizontalAcrossSun', v: 'sunVerticalPlane' },
      cameras: {
        chase: { nearM: 0.1, farM: 300, splitRatio: 0.9, count: 3, splitsM: [20, 80, 300] },
        cockpit: { nearM: 0.01, farM: 200, splitRatio: 0.9, count: 2, splitsM: [30, 200] },
        tv: { nearM: 1, farM: 500, splitRatio: null, count: null, splitsM: null },
      },
    },
    sunVisibility: { occlusion: { bias: 0.01, curve: 'sqrt', dryMax: 1, wetMax: 0.5 }, view: { fovRad: 0.4, near: 1, far: 1000, resolution: 8, refreshFrames: 10, readFrame: 5 }, horizon: { limit: 0, gain: 5 } },
  };
}

/**
 * A synthetic cloud field: a 2 × 2 lower layer and one upper cell, a `thick` type (a flat 2 km sheet, one opaque material) on codes
 * 0 to 7, a `thin` one (two materials, one half as opaque) on 8 to 14, and a clear code 15. The opacity map is a 2 × 2 texture of full value.
 */
export function testClouds(): SceneryClouds {
  const frame = (x: number, y: number, z: number) => [x, y, z, x, y, z, x, y, z, x, y, z];
  const flat = { positions: [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    normals: frame(0, -1, 0), tangents: frame(1, 0, 0), binormals: frame(0, 0, 1), triangles: [0, 1, 2, 2, 3, 0] };
  const light: SceneryClouds['types'][string]['materials'][number]['light'] = { uv: { scale: [1, 1], offset: [0, 0] },
    albedo: { max: [1, 1, 1], min: [0.8, 0.85, 0.9], randomMax: 0, randomMin: 0.2 }, ambient: { scalar: 2, occlusion: 1 },
    backlight: { narrowScalar: 4, narrowPower: 2048, wideScalar: 2, widePower: 8, base: 0.1 }, diffuse: { clear: 2, overcast: 1, depthScale: 1 } };
  const material = (name: string, scalar: number) => ({ name, opacity: { scalar, visibility: 1, randomRange: 0 }, cloudMap: 'full', light, sideMap: 'side', endMap: 'end' });
  const level = (bytes: number[]) => Uint8Array.from(bytes);
  return {
    layers: {
      lower: { cells: 2, instances: 4, spacingM: 1000, heightM: 2000, jitter: 0, drift: { windOffsetMs: 10, divisorM: 10000 } },
      upper: { cells: 2, instances: 1, spacingM: 2000, heightM: 4000, jitter: 0, drift: { windOffsetMs: 20, divisorM: 20000 } },
    },
    cells: [[0, -1, -1, 1], [0, -0.5, -1.5, 0], [1, -1, -1, 1], [1, -1.5, -0.5, 0], [0, -1, -1, 0]],
    lowerCells: 4,
    codes: [...new Array<string>(8).fill('thick'), ...new Array<string>(7).fill('thin'), 'clear'],
    types: {
      thick: { darkness: 1, sideMesh: 'flat', centreLineMesh: 'flat', pushNearCentre: false, heightOffsetM: 0, materials: [material('thick', 1)] },
      thin: { darkness: 0.5, sideMesh: 'flat', centreLineMesh: 'flat', pushNearCentre: true, heightOffsetM: 0, materials: [material('thinA', 1), material('thinB', 0.5)] },
      clear: { darkness: 0, sideMesh: null, centreLineMesh: null, pushNearCentre: false, heightOffsetM: 0, materials: [] },
    },
    height: { perCellM: 0, perCodeM: 0 },
    placement: { gridScale: 1, endMargin: 0.1, fadeGain: 10, pushRadius: 0, push: 0, edgePitchRad: 0, edgeDrop: 0, riseDrop: 0.5, centreLineYawRad: 0, centreLinePitchRad: 0, centreLineRollRad: 0 },
    coverage: { falloff: 0.5, approachPerS: 0.1 },
    alpha: { gain: 2, powerFrom: 4, powerTo: 1 },
    averagedInputs: { variant: 'mean', red: 0.5, green: 0.5, jitter: 0, startAgeCells: 0.1 },
    meshes: { flat },
    maps: { full: { width: 2, height: 2, mips: [level([255, 255, 255, 255]), level([255])] } },
    lightMaps: {
      full: { width: 1, height: 1, channels: 1, mips: [level([255])] },
      side: { width: 1, height: 1, channels: 3, mips: [level([255, 128, 64])] },
      end: { width: 1, height: 1, channels: 3, mips: [level([32, 128, 255])] },
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
      albedo: 0.2, scaleHeightM: 8000, altitudeM: 0, box: { size: 1000, yOffset: -20 },
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
    clouds: testClouds(),
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

/**
 * The cascaded shadow block the package contract accepts (six cascade tiles, splits that follow the split scheme), for the package files: `testShading().shadows`
 * is shaped for the viewer tests and is not a valid published block.
 */
export function packageShadows(): SceneryShading['shadows'] {
  const shadows = testShading().shadows, camera = (nearM: number, farM: number, splitRatio: number, count: number) => ({ nearM, farM, splitRatio, count, splitsM: resolveShadowSplits(nearM, farM, splitRatio, count) });
  return { ...shadows, atlas: { ...shadows.atlas, cascadeTiles: [[0, 0, 0], [0, 32, 0], [1, 0, 0], [1, 32, 0], [0, 0, 32], [0, 32, 32]] },
    cameras: { chase: camera(0.1, 300, 0.9, 3), cockpit: camera(0.01, 200, 0.9, 2), tv: shadows.cameras.tv } };
}

/** The cloud field in the package's form: each map names the file `rendering/<sha256>.bin` of its mips (largest first, concatenated), whose bytes are returned by hash. */
export function packageClouds(clouds: SceneryClouds): { clouds: SceneryCloudsFile; files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  const file = (mips: Uint8Array[]) => {
    const bytes = Buffer.concat(mips), sha256 = createHash('sha256').update(bytes).digest('hex');
    files.set(sha256, bytes);
    return { sha256, byteLength: bytes.length, mipByteLengths: mips.map(mip => mip.length) };
  };
  return { files, clouds: {
    ...clouds,
    maps: Object.fromEntries(Object.entries(clouds.maps).map(([key, map]) => [key, { width: map.width, height: map.height, ...file(map.mips) }])),
    lightMaps: Object.fromEntries(Object.entries(clouds.lightMaps).map(([key, map]) => [key, { width: map.width, height: map.height, channels: map.channels, ...file(map.mips) }])),
  } };
}
