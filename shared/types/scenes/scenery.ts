/**
 * Scenery layout of package schema 4 (one catalog row per layout plus the catalog's shared chunking and streaming; the pipeline's docs/SCENE_PACKAGE.md is the authority).
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
  /** Air pollution, mapped to sky turbidity by the viewer. */
  airPollution: number;
  /** Haze scale as authored; its effect is not verified. */
  hazeBaseScale: number;
  /** The track's location and its local offset from UTC on the race date (daylight saving included). */
  latitudeDeg: number;
  longitudeDeg: number;
  utcOffsetHours: number;
}

/**
 * The replay camera's exposure, tone curve, glare and ambient occlusion: the package's catalog `camera` (the pipeline's
 * `build camera`, its docs/SCENE_PACKAGE.md is the authority).
 */
export interface SceneryCamera {
  /** Metered screen area, as fractions of the frame from the top left. */
  meteringWindow: { x: number; y: number; width: number; height: number };
  /** Exposure target and white balance by sun elevation, ascending. */
  profiles: { sunElevationDeg: number; targetExposure: number; whiteBalanceK: number }[];
  /** tone = saturate((1 - z)(1 - b·z)²), z = e^(-a·x), per exposed linear component x. */
  toneCurve: { a: number; b: number };
  /** Exposed luminance above which glare starts. */
  glareThreshold: number;
  /** Sample radius and count, the occlusion's strength scale, and the grey a fully occluded spot darkens to. */
  ambientOcclusion: { radiusM: number; samples: number; scale: number; colour: number };
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
  daylight?: SceneryDaylight;
  horizon: SceneryHorizonChunk;
  sectors: ScenerySectorChunk[];
  textures: SceneryTexture[];
  totals: SceneryTotals;
}

export interface SceneryLayoutResource extends SceneryLayout {
  packageRevision: string;
}
