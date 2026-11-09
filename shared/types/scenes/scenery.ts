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

/** One time-of-day profile of a camera type. */
export interface SceneryCameraProfile {
  sunElevationDeg: number;
  /** T of the exposure law: exposure = C · T / L^adaptationScale, L the metered luminance. */
  targetExposure: number;
  whiteBalanceK: number;
  toneCurve: SceneryToneCurve;
}

/** external: car-mounted views outside the cockpit; onboard: the cockpit; tv: trackside cameras. */
export type SceneryCameraType = 'external' | 'onboard' | 'tv';

/** The post-processing of one camera type. */
export interface SceneryCameraTypeProfile {
  /** Metered screen area, as fractions of the frame from the top left. */
  meteringWindow: { x: number; y: number; width: number; height: number };
  /** The exponent s of the metered luminance in the exposure law. */
  adaptationScale: number;
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
