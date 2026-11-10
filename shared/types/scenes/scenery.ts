/**
 * Scenery layout of package schema 7 (one catalog row per layout plus the catalog's shared chunking and streaming; the pipeline's docs/SCENE_PACKAGE.md is the authority).
 * The horizon chunk is always resident; sector chunks are loaded by lap distance around the replay car.
 */
export type Vec3 = [number, number, number];

export interface SceneryBounds { min: Vec3; max: Vec3 }

export interface SceneryChunkingParameters {
  sectorLengthM: number;
  minSectorLengthM: number;
  maxSectorTriangles: number;
  horizonDistanceM: number;
  skylineHeightM: number;
  skylineMinDistanceM: number;
  terrainScaleExtentM: number;
  pitBandM: number;
}

/** The resident-set rule published with the layout (sceneBudgets.json `streaming`). */
export interface SceneryStreaming {
  residentBehindM: number;
  residentAheadM: number;
  freeCameraRadiusM: number;
}

export type ScenerySessionId = 'race' | 'qualify' | 'practice1' | 'practice2';

/** The sun at a session start, from the venue's location, date, timezone, DSTRange and schedule. */
export interface ScenerySessionDaylight {
  id: ScenerySessionId;
  /** Local clock time, `HH:MM`. */
  localTime: string;
  /** Negative after sunset. */
  sunElevationDeg: number;
  /** Degrees clockwise from true north. Older packages omit it. */
  sunBearingDeg?: number;
}

/**
 * The venue's daylight. No sun bearing: how geographic north lies in the scene axes is not decoded. Brightness and exposure are not
 * authored by the game data; the viewer calibrates them.
 */
export interface SceneryDaylight {
  /** Race date, `YYYY-MM-DD`. */
  date: string;
  /** race, qualify, practice1, practice2, in that order. */
  sessions: ScenerySessionDaylight[];
  /** Air pollution: raises the sky's turbidity, the haze and its warm tint (the catalog `sky`). */
  airPollution: number;
  /** Weights of the haze density terms: clear day, overcast, storm and dawn. */
  hazeBaseScale: number;
  hazeCloudyScale: number;
  hazeStormScale: number;
  hazeDawnScale: number;
  /** Scales of the height haze's altitude rate and exponent. */
  fogHeightAltitudeScalar: number;
  fogHeightExponentScalar: number;
  /** The track's location and its local offset from UTC on the race date (daylight saving included). */
  latitudeDeg: number;
  longitudeDeg: number;
  utcOffsetHours: number;
}

/** tone = saturate((1 - z)(1 - b·z)²), z = e^(-a·x), per exposed linear component x. */
export interface SceneryToneCurve { a: number; b: number }

/** The exposure target, white balance and tone curve of one weather state. */
export interface SceneryCameraLook {
  /** T of the exposure law: exposure = C · T / L^adaptationScale, L the metered luminance. */
  targetExposure: number;
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
  /** The sky dome's Hosek-Wilkie model; the catalog's `layoutAltitudeM` map, the loader attaches each layout its own `altitudeM`. */
  hosek: SceneryHosekSky;
  /** The sky dome's own haze toward the horizon. */
  haze: ScenerySkyHaze;
  colourProfiles: ScenerySkyColourProfiles;
}

/** The Hosek-Wilkie (2012) CIE XYZ sky: its datasets per channel X, Y, Z and the inputs the app cannot derive (atmosphere/hosekSky.ts). */
export interface SceneryHosekSky {
  /** Ground albedo the model is cooked at, 0 to 1. */
  albedo: number;
  /** Scale height of the isothermal atmosphere: the sky's luminance dims by exp(−altitudeM / scaleHeightM). */
  scaleHeightM: number;
  /** The layout's altitude, in metres. */
  altitudeM: number;
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
 * carries `layouts` keyed by layout key; the loader attaches each layout its own `grid`.
 */
export interface ScenerySun {
  /** States the radiance unit once (linear RGB, a midday sun near 100). */
  unit: string;
  /** Sample elevations, ascending. */
  sunElevationDeg: number[];
  /** Sample base coverages, ascending, 0 to 1. */
  cloudCoverage: number[];
  /**
   * `grid[i][j]` is the RGB at `cloudCoverage[i]` and `sunElevationDeg[j]`, all positive. Between elevations the log of each
   * channel is linear in the relative air mass, between coverages the RGB is linear; outside the grid the nearest end applies.
   */
  grid: [number, number, number][][];
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

interface SceneryChunkBase {
  id: string;
  bounds: SceneryBounds;
  /** Package-relative path `scenery/<sha256>.glb`. */
  asset: string;
  sha256: string;
  byteLength: number;
  triangles: number;
  vertices: number;
  drawCalls: number;
  /** The chunk's shadow-casting primitives (nodes with `extras.lmuCastShadow`) and their triangles. */
  shadowDrawCalls: number;
  shadowTriangles: number;
  geometryBytes: number;
  meshes: number;
  materials: number;
  /** Package-relative KTX2 paths this chunk's GLB uses; all are in the layout's texture list. */
  textures: string[];
}

export interface SceneryHorizonChunk extends SceneryChunkBase { kind: 'horizon' }

/** A main sector covers `[lapStartM, lapEndM]` of the lap; a pit chunk also covers a pit lane range, and its lap range may exceed the route length (wraps). */
export interface ScenerySectorChunk extends SceneryChunkBase {
  kind: 'main' | 'pit';
  lapStartM: number;
  lapEndM: number;
  pitStartM?: number;
  pitEndM?: number;
  prev: string | null;
  next: string | null;
}

export type SceneryChunk = SceneryHorizonChunk | ScenerySectorChunk;

export interface SceneryTexture {
  asset: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  levels: number;
  format: string;
  srgb: boolean;
  gpuBytes: number;
}

export interface SceneryTotals {
  triangles: number;
  vertices: number;
  drawCalls: number;
  glbBytes: number;
  geometryBytes: number;
  textureBytes: number;
  textureGpuBytes: number;
}

export interface SceneryLayout {
  layoutKey: string;
  sourceGeometryRevision: string;
  routeLengthM: number;
  pitLaneLengthM: number;
  /** The layout's maximum shadow range, in metres. */
  shadowRangeM: number;
  /** The catalog's shared parameters, attached to each layout. */
  chunking: SceneryChunkingParameters;
  streaming: SceneryStreaming;
  camera: SceneryCamera;
  sky: ScenerySky;
  shading: SceneryShading;
  /** Where the venue's environment (reflection and irradiance) is captured, in LMU local metres. */
  environmentProbe: { position: Vec3 };
  daylight?: SceneryDaylight;
  horizon: SceneryHorizonChunk;
  sectors: ScenerySectorChunk[];
  textures: SceneryTexture[];
  totals: SceneryTotals;
}

export interface SceneryLayoutResource extends SceneryLayout {
  packageRevision: string;
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
  cameras: { chase: SceneryShadowCamera; cockpit: SceneryShadowCamera; tv: SceneryShadowCamera };
}
