// Copied from LMUTrackPipeline/shared/contract/renderingTypes.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The rendering profiles `rendering/index.json` carries (docs/PACKAGE_FORMAT.md, Rendering; docs/SCENE_PACKAGE.md states the formulas): the types of the camera,
 * sky and shading profiles as the file stores them. Per-layout parts of the sky are keyed by layout key in the file (`sky.sun.layouts`,
 * `sky.hosek.layoutAltitudeM`); a reader that wants a layout's own sun grid or altitude picks it by key.
 */
import type {Vec3} from './strict.js';

/** tone = saturate((1 - z)(1 - b·z)²), z = e^(-a·x), per exposed linear component x. */
export interface SceneryToneCurve { a: number; b: number }

/** The exposure values, white balance and tone curve of one weather state. */
export interface SceneryCameraLook {
  /**
   * T of the exposure law: exposure = T · B^(1 - s) / L^s kept inside [minExposure, maxExposure], s the type's adaptationScale and
   * L the metered mean luminance on the camera's scale (the scene's over sceneLuminanceScale).
   */
  targetExposure: number;
  /** B of the exposure law: the light/dark border, as a multiple of the target. */
  lightDarkBorder: number;
  minExposure: number;
  maxExposure: number;
  whiteBalanceK: number;
  toneCurve: SceneryToneCurve;
}

/** One time-of-day profile of a camera type: the clear look, and the overcast look it blends to with the weather. */
export interface SceneryCameraProfile extends SceneryCameraLook {
  /** The profile's knot of direct-sun strength (atmosphere/timeOfDay.ts), not a sun elevation. */
  sunTarget: number;
  /** Exponent of the clear to overcast blend factor. */
  weatherLerpPower: number;
  overcast: SceneryCameraLook;
}

/** external: car-mounted views outside the cockpit; onboard: the cockpit; tv: trackside cameras. */
export type SceneryCameraType = 'external' | 'onboard' | 'tv';

/** The post-processing of one camera type. */
export interface SceneryCameraTypeProfile {
  /** Metered screen area, as fractions of the frame from the top left. */
  meteringWindow: { x: number; y: number; width: number; height: number };
  /** The exponent s of the metered luminance in the exposure law. */
  adaptationScale: number;
  /** Rate per second of the clear to overcast profile blend. */
  weatherBlendRate: number;
  /** By sun elevation, ascending. */
  profiles: SceneryCameraProfile[];
  /** Sample radius and count, the occlusion's strength scale, and the grey a fully occluded spot darkens to. */
  ambientOcclusion: { radiusM: number; samples: number; scale: number; colour: number };
}

/**
 * The replay camera's exposure, white balance, tone curve and ambient occlusion per camera type, and the output encode: the
 * package's catalog `camera` (the pipeline's docs/SCENE_PACKAGE.md is the authority).
 */
export interface SceneryCamera {
  /** Output encode rgb^(1 / outputGamma). */
  outputGamma: number;
  /** The scene luminance the exposure is divided by in the tone pass. */
  sceneLuminanceScale: number;
  types: Record<SceneryCameraType, SceneryCameraTypeProfile>;
}

/**
 * The analytic sky and the haze: the package's catalog `sky` (the pipeline's docs/SCENE_PACKAGE.md "Sky and atmosphere" has the
 * formulas). C is the cloud cover, S the precipitation term and p = airPollution·(1 − cloudyDamping·C) the effective pollution.
 */
export interface ScenerySky {
  /** Scales of the Perez coefficients a, b, c, d, e. */
  perezScale: [number, number, number, number, number];
  /** Multipliers of the a–d scales by sun elevation, ascending. */
  perezMultipliers: { sunElevationDeg: number; abcd: [number, number, number, number] }[];
  pollution: { cloudyDamping: number };
  /** clamp(base + (overcast + storm)·C + pollution·p², min, max). */
  turbidity: { base: number; overcast: number; storm: number; pollution: number; min: number; max: number };
  /** Air mass multiplier clear + (pollution − clear)·p². */
  airMass: { clear: number; pollution: number };
  fog: SceneryFog;
  sun: ScenerySun;
  /** The sky dome's Hosek-Wilkie model; `layoutAltitudeM` has one altitude per layout. */
  hosek: SceneryHosekSky;
  /** The sky dome's own haze toward the horizon. */
  haze: ScenerySkyHaze;
  colourProfiles: ScenerySkyColourProfiles;
  /** The cloud field the replay's cloud cells and drifts place. */
  clouds: SceneryClouds;
}

/** The Hosek-Wilkie (2012) CIE XYZ sky: its datasets per channel X, Y, Z and the inputs the app cannot derive (atmosphere/hosekSky.ts). */
export interface SceneryHosekSky {
  /** Ground albedo the model is cooked at, 0 to 1. */
  albedo: number;
  /** Scale height of the isothermal atmosphere: the sky's luminance dims by exp(−altitudeM / scaleHeightM). */
  scaleHeightM: number;
  /** Each layout's altitude, in metres, keyed by layout key. */
  layoutAltitudeM: Record<string, number>;
  /**
   * The sky is a cube of `size` around the eye, moved by `yOffset` along y; each point is coloured for its direction from the
   * cube's own centre. Only the ratio of the two matters.
   */
  box: { size: number; yOffset: number };
  /** CIE XYZ to the scene's linear RGB by rows: rgb[i] = Σ xyzToRgb[i][j]·xyz[j]. */
  xyzToRgb: [Vec3, Vec3, Vec3];
  /** Per channel: albedo 0 then 1, turbidity 1–10, six Bézier control points, nine coefficients A–I (1080 values). */
  coefficients: [number[], number[], number[]];
  /** Per channel: albedo 0 then 1, turbidity 1–10, six Bézier control points (120 values). */
  radiances: [number[], number[], number[]];
}

/**
 * The dome's haze: depth = base + overcast·C + pollution·p; intensity = lerp(dawn·hazeDawnScale, base·hazeBaseScale, D) +
 * overcast·C·hazeCloudyScale; the haze colour is the fog colour's adjusted horizon colour times
 * saturate(lerp(sunrise, base, D)·lerp(1, pollution, p)·lerp(1, overcast, C)·lerp(1, storm, S)).
 */
export interface ScenerySkyHaze {
  depth: { base: number; overcast: number; pollution: number };
  intensity: { base: number; dawn: number; overcast: number };
  luminance: { sunrise: number; base: number; pollution: number; overcast: number; storm: number };
}

/** A sky colour look: per-channel gains applied in proportion to the sky's saturation, and the scale of cos γ from the sun. */
export interface ScenerySkyColourLook { gain: Vec3; sunProximity: number }

/** The sky's time-of-day colour profiles, ascending by `sunTarget` (the camera profiles' knots and position rule). */
export interface ScenerySkyColourProfiles {
  weatherBlendRate: number;
  profiles: { sunTarget: number; weatherLerpPower: number; clear: ScenerySkyColourLook; overcast: ScenerySkyColourLook }[];
}

/**
 * The direct sun's radiance before cloud occlusion, sampled by base cloud coverage and sun elevation. The catalog's `sky.sun`
 * carries one `grid` per layout in `layouts`, keyed by layout key.
 */
export interface ScenerySun {
  /** States the radiance unit once (linear RGB, a midday sun near 100). */
  unit: string;
  /** Sample elevations, ascending. */
  sunElevationDeg: number[];
  /** Sample base coverages, ascending, 0 to 1. */
  cloudCoverage: number[];
  /**
   * Per layout, `grid[i][j]` is the RGB at `cloudCoverage[i]` and `sunElevationDeg[j]`, all positive. Between elevations the log of each
   * channel is linear in the relative air mass, between coverages the RGB is linear; outside the grid the nearest end applies.
   */
  layouts: Record<string, [number, number, number][][]>;
}

/** The exponential distance haze, its colour from the sky's horizon, its tint toward the sun and its height term. */
export interface SceneryFog {
  /** Clear day: clamp(base·hazeBaseScale + pollution·airPollution, min, max), per metre. */
  density: { base: number; overcast: number; storm: number; sunrise: number; pollution: number; min: number; max: number };
  colour: {
    horizonSampleElevationDeg: number;
    horizonSampleCount: number;
    horizonFovDeg: number;
    pollutionOffset: [number, number, number];
    override: { base: number; overcast: number; storm: number };
    luminance: { base: number; sunrise: number; overcast: number; storm: number };
    sunElevationRampDeg: number;
    sunElevationRampOffset: number;
  };
  sunInfluence: number;
  height: { max: number; scalar: number; exponent: number; scalarMin: number; scalarMax: number; exponentMin: number };
}

/** How a reflection cube mip is read: by a LOD bias on the sampled mip, or at an explicit LOD. */
export type SceneryReflectionLod = 'bias' | 'explicit';

/** One convolved reflection-cube mip: its specular power (a number, or INF for the mirror mip), the source mip it reads and its sample directions. */
export interface SceneryConvolutionKernel { specularPower: string; sourceLod: number; samples: Vec3[] }

/** The catalog's shading parameters (the pipeline's docs/SCENE_PACKAGE.md "Shading"), shared by every layout. */
export interface SceneryShading {
  /** The sun's glint on smooth surfaces: the view-to-reflection cosine it starts at, the roughness it stops at, its specular scale. */
  sunGlint: { cosineThreshold: number; roughnessCutoff: number; smoothSpecularScale: number };
  /** Small-edge highlight detection: its detector and edge scales and the limits of the result. */
  smallEdge: { detectorScale: number; edgeScale: number; limitMin: number; limitMax: number };
  /** Car paint reflections: the roughness the sharp reflection stops at, the roughness-to-LOD scale, how each coat reads its mip. */
  carPaintReflection: { roughnessCutoff: number; lodScale: number; clearCoatLod: SceneryReflectionLod; baseCoatLod: SceneryReflectionLod };
  /** The reflection cube's convolution, one kernel per convolved mip. */
  convolution: { kernels: SceneryConvolutionKernel[] };
  /**
   * Scenery reflections: the convolved cube read at `lodScale` × roughness (no sharp cube), the dielectric F0 of the specular level, and
   * the shader families that read it.
   */
  sceneryReflection: { lodScale: number; lod: SceneryReflectionLod; dielectricF0: number; families: string[] };
  /** The split-sum table: 8-bit (scale, bias) per texel, row-major, N·V along a row (128 texels), roughness 0 at row 0. */
  integrationMap: { width: number; height: number; encoding: 'unorm8'; scale: number[]; bias: number[] };
  /** The cascaded sun shadow: atlas layout, cascade choice, filter, normal offset, fit, fade and the split planes per camera type. */
  shadows: SceneryShadows;
  /** How the clouds toward the sun dim its light. */
  sunVisibility: ScenerySunVisibility;
}

/** The split planes of one camera type; `splitRatio`, `count` and `splitsM` are null together where the package has no set. */
export interface SceneryShadowCamera {
  nearM: number;
  farM: number;
  splitRatio: number | null;
  count: number | null;
  /** The far edge of each cascade, metres, ascending; the last is `farM`. */
  splitsM: number[] | null;
}

/** The pipeline's docs/SCENE_PACKAGE.md "Shadows". */
export interface SceneryShadows {
  /** `cascadeTiles[i]` is [atlas, x, y] of cascade i, in texels. */
  atlas: { count: number; sizePx: number; tilePx: number; cascadeTiles: Array<[number, number, number]> };
  /** The first cascade whose tile holds the point: max(|u − 0.5|) ≤ halfExtent. */
  select: { method: 'firstContainingTile'; halfExtent: number };
  /** shadow = Σ weight · compare(uv + offset · texelSize) · scale. */
  filter: { hardwarePcf: boolean; texelSize: number; scale: number; taps: Array<{ offset: [number, number]; weight: number }> };
  /** The position moves along the normal by `scale` times the material's normal shadow influence. */
  normalOffset: { scale: number; by: 'normalShadowInfluence' };
  /** Cascade origins land on texel k + 0.5. */
  texelSnap: boolean;
  /** Cascade i is a square of side widthPerSplit · split_i; the last is widthPerSplit · (far − split_N−2). */
  fit: { shape: 'square'; widthPerSplit: number };
  /** fade = saturate(viewDepth · w − z) with 1 / w = lengthOfLastSpan · (far − split_N−2), reaching zero at far. */
  fade: { endsAtFar: boolean; lengthOfLastSpan: number };
  /** Cascade i is centred at eye + forward · (split_i−1 + split_i) / 2: forward unflattened, split_−1 the camera set's `nearM`. */
  centre: { along: 'viewForward'; at: 'sliceMidpoint'; firstSliceStartsAt: 'nearM' };
  /**
   * The squares' axes are the same for every cascade and do not turn with the view: u = −normalize(L × up), L the light's travel
   * direction; v = u × L (its sign is not established). The position along the light is not constrained.
   */
  orientation: { followsView: false; u: 'horizontalAcrossSun'; v: 'sunVerticalPlane' };
  cameras: { chase: SceneryShadowCamera; cockpit: SceneryShadowCamera; tv: SceneryShadowCamera };
}


/**
 * A cloud map as `rendering/index.json` states it: its decoded mip levels (8-bit, row-major, channels interleaved, largest first, down to one pixel) are the
 * file `rendering/<sha256>.bin`, `mipByteLengths[i]` bytes for level `i`. `channels` is present for light maps only.
 */
export interface CloudMapFile {width: number; height: number; sha256: string; byteLength: number; mipByteLengths: number[]}

/** One cloud layer: cells per grid side, its cell count, the cell spacing and base height (m), the jitter and the drift rate inputs. */
export interface SceneryCloudLayer {
  cells: number; instances: number; spacingM: number; heightM: number; jitter: number;
  /** The layer drifts by (wind m/s + windOffsetMs) / divisorM cells per second; the replay carries the drift itself. */
  drift: { windOffsetMs: number; divisorM: number };
}

/** How a cloud material is lit (the pipeline's docs/SCENE_PACKAGE.md "Clouds" states the formula). */
export interface SceneryCloudLight {
  uv: { scale: [number, number]; offset: [number, number] };
  /** The cloud's own colour runs from `min` to `max` with its lit density; `randomMin` and `randomMax` darken each by the cloud's random. */
  albedo: { max: [number, number, number]; min: [number, number, number]; randomMax: number; randomMin: number };
  ambient: { scalar: number; occlusion: number };
  /** Light scattered toward the eye when looking at the sun through the cloud, and the share of light every part gets. */
  backlight: { narrowScalar: number; narrowPower: number; wideScalar: number; widePower: number; base: number };
  /** The sun's weight under a clear and an overcast sky, and the scale on the light's depth component. */
  diffuse: { clear: number; overcast: number; depthScale: number };
}

export interface SceneryCloudMaterial {
  name: string;
  opacity: { scalar: number; visibility: number; randomRange: number };
  /** Key of the material's opacity map in `maps` and of its density map in `lightMaps`. */
  cloudMap: string;
  light: SceneryCloudLight;
  /** Keys of `lightMaps`: how lit the cloud is from the right, the left and the top (red, green, blue), and from the bottom, the back and the front. */
  sideMap: string; endMap: string;
}

export interface SceneryCloudType {
  /** The type's weight in the cloud coverage, 0 for a clear cell. */
  darkness: number;
  /** Keys of `meshes` for a side cell and a centre-line cell; null when the type draws nothing. */
  sideMesh: string | null; centreLineMesh: string | null;
  pushNearCentre: boolean;
  heightOffsetM: number;
  materials: SceneryCloudMaterial[];
}

/** A sheet model; `normals`, `tangents` and `binormals` are the unit vertex frame the light maps are read in. */
export interface SceneryCloudMesh { positions: number[]; uvs: number[]; normals: number[]; tangents: number[]; binormals: number[]; triangles: number[] }

/** The sky's cloud field: two layers of cloud sheets on a grid of cells around the eye; the replay gives each cell's code and the layer drifts. */
export interface SceneryClouds {
  layers: { lower: SceneryCloudLayer; upper: SceneryCloudLayer };
  /** Per cell: [phase offset, grid a, grid b, centre line 1/0]; the first `lowerCells` are the lower layer. */
  cells: [number, number, number, number][];
  lowerCells: number;
  /** Cell code (0–15) to a key of `types`. */
  codes: string[];
  types: Record<string, SceneryCloudType>;
  height: { perCellM: number; perCodeM: number };
  placement: {
    gridScale: number; endMargin: number; fadeGain: number; pushRadius: number; push: number; edgePitchRad: number; edgeDrop: number; riseDrop: number;
    centreLineYawRad: number; centreLinePitchRad: number; centreLineRollRad: number;
  };
  coverage: { falloff: number; approachPerS: number };
  /** alpha = saturate(gain·s)·map^lerp(powerFrom, powerTo, s)·scalar, s = visibility·fade·(1 − randomRange·red). */
  alpha: { gain: number; powerFrom: number; powerTo: number };
  /** Inputs the replay does not carry, as averages: every material of a type counts equally, the per-cloud values and the start age. */
  averagedInputs: { variant: 'mean'; red: number; green: number; jitter: number; startAgeCells: number };
  meshes: Record<string, SceneryCloudMesh>;
  /** Opacity maps: 8-bit row-major levels from `width` × `height` down, base64. */
  maps: Record<string, CloudMapFile>;
  /** Maps that light a cloud: 8-bit row-major levels, `channels` values per texel (1 density, 3 a side or end map), base64. */
  lightMaps: Record<string, CloudMapFile & {channels: 1 | 3}>;
}

/**
 * How clouds hide the sun: occlusion = curve(saturate((bias + Σ alpha) / resolution²))·lerp(dryMax, wetMax, rain) over a square view
 * of the clouds toward the sun; visibility = (1 − occlusion)·clamp((sun height − limit)·gain, 0, 1), 0 at or below the limit.
 */
export interface ScenerySunVisibility {
  occlusion: { bias: number; curve: 'sqrt'; dryMax: number; wetMax: number };
  view: { fovRad: number; near: number; far: number; resolution: number; refreshFrames: number; readFrame: number };
  horizon: { limit: number; gain: number };
}

/** `rendering/index.json`. */
export interface RenderingProfiles {camera: SceneryCamera; sky: ScenerySky; shading: SceneryShading}
