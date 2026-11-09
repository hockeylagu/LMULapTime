import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { SceneryBounds, SceneryCamera, SceneryChunk, SceneryDaylight, SceneryLayout, SceneryShading, ScenerySky, ScenerySun, SceneryTexture } from '../../shared/types/scenes/scenery.js';
import { registerPackageFile, type PackageFile } from './packageFiles.js';
import { array, count, exactKeys, finite, knownKeys, nonNegative, record, sha256, text, vec3 } from './strict.js';

/** Validated scenery of a package: layout indexes by layout key, and every chunk and texture file by package-relative path. */
export interface SceneryStore { layouts: Map<string, SceneryLayout> }

const MAX_GLB_BYTES = 128_000_000, MAX_TEXTURE_BYTES = 64_000_000, MAX_CHUNKS = 4096, MAX_TEXTURES = 8192;
const CHUNKING = ['sectorLengthM', 'minSectorLengthM', 'maxSectorTriangles', 'horizonDistanceM', 'skylineHeightM', 'skylineMinDistanceM', 'terrainScaleExtentM', 'pitBandM'];
const STREAMING = ['residentBehindM', 'residentAheadM', 'freeCameraRadiusM'];
const TOTALS = ['triangles', 'vertices', 'drawCalls', 'glbBytes', 'geometryBytes', 'textureBytes', 'textureGpuBytes'];
const CHUNK_COMMON = ['id', 'kind', 'bounds', 'asset', 'sha256', 'byteLength', 'triangles', 'vertices', 'drawCalls', 'shadowDrawCalls', 'shadowTriangles', 'geometryBytes', 'meshes', 'materials', 'textures'];
const SESSIONS = ['race', 'qualify', 'practice1', 'practice2'];
const TEXTURE = ['asset', 'sha256', 'byteLength', 'width', 'height', 'levels', 'format', 'srgb', 'gpuBytes'];

function bounds(value: unknown, what: string): SceneryBounds {
  const box = record(value, what);
  exactKeys(box, ['min', 'max'], what);
  const min = vec3(box.min, `${what}.min`), max = vec3(box.max, `${what}.max`);
  if (min.some((n, i) => n > max[i])) throw Error(`${what}: min exceeds max`);
  return { min, max };
}

function numbers(value: unknown, keys: string[], what: string, positive: boolean): void {
  const row = record(value, what);
  exactKeys(row, keys, what);
  for (const key of keys) {
    const n = finite(row[key], `${what}.${key}`);
    if (positive ? n <= 0 : n < 0) throw Error(`${what}.${key}: out of range`);
  }
}

function parseDaylight(value: unknown, what: string): SceneryDaylight {
  const row = record(value, what);
  knownKeys(row, ['date', 'sessions', 'airPollution', 'hazeBaseScale', 'hazeCloudyScale', 'hazeStormScale', 'hazeDawnScale', 'fogHeightAltitudeScalar', 'fogHeightExponentScalar', 'latitudeDeg', 'longitudeDeg', 'utcOffsetHours'], [], what);
  if (Math.abs(finite(row.latitudeDeg, `${what}.latitudeDeg`)) > 90) throw Error(`${what}.latitudeDeg: out of range`);
  if (Math.abs(finite(row.longitudeDeg, `${what}.longitudeDeg`)) > 180) throw Error(`${what}.longitudeDeg: out of range`);
  if (Math.abs(finite(row.utcOffsetHours, `${what}.utcOffsetHours`)) > 14) throw Error(`${what}.utcOffsetHours: out of range`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(row.date, `${what}.date`, 10))) throw Error(`${what}.date: expected YYYY-MM-DD`);
  const sessions = array(row.sessions, `${what}.sessions`, SESSIONS.length);
  if (sessions.length !== SESSIONS.length) throw Error(`${what}.sessions: expected ${SESSIONS.join(', ')}`);
  sessions.forEach((value, i) => {
    const session = record(value, `${what}.sessions[${i}]`);
    knownKeys(session, ['id', 'localTime', 'sunElevationDeg'], ['sunBearingDeg'], `${what}.sessions[${i}]`);
    if (session.id !== SESSIONS[i]) throw Error(`${what}.sessions[${i}]: expected ${SESSIONS[i]}`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text(session.localTime, `${what}.sessions[${i}].localTime`, 5))) throw Error(`${what}.sessions[${i}].localTime: expected HH:MM`);
    if (Math.abs(finite(session.sunElevationDeg, `${what}.sessions[${i}].sunElevationDeg`)) > 90) throw Error(`${what}.sessions[${i}].sunElevationDeg: out of range`);
    if (session.sunBearingDeg !== undefined) {
      const bearing = finite(session.sunBearingDeg, `${what}.sessions[${i}].sunBearingDeg`);
      if (bearing < 0 || bearing >= 360) throw Error(`${what}.sessions[${i}].sunBearingDeg: out of range`);
    }
  });
  nonNegative(row.airPollution, `${what}.airPollution`);
  if (finite(row.hazeBaseScale, `${what}.hazeBaseScale`) <= 0) throw Error(`${what}.hazeBaseScale: must be positive`);
  for (const key of ['hazeCloudyScale', 'hazeStormScale', 'hazeDawnScale', 'fogHeightAltitudeScalar', 'fogHeightExponentScalar']) nonNegative(row[key], `${what}.${key}`);
  return structuredClone(row) as unknown as SceneryDaylight;
}

/** A screen window inside the frame, as fractions from the top left. */
function screenWindow(value: unknown, what: string): void {
  const window = record(value, what);
  numbers(window, ['x', 'y', 'width', 'height'], what, false);
  if ((window.x as number) + (window.width as number) > 1 || (window.y as number) + (window.height as number) > 1 || !window.width || !window.height) throw Error(`${what}: outside the frame`);
}

/** Rows ascending by `key` (the sun elevation unless named), each checked by `row`. */
function ascending(rows: unknown[], what: string, row: (value: Record<string, unknown>, what: string) => void, key = 'sunElevationDeg'): void {
  if (!rows.length) throw Error(`${what}: empty`);
  let previous = -Infinity;
  rows.forEach((value, i) => {
    const entry = record(value, `${what}[${i}]`), at = finite(entry[key], `${what}[${i}].${key}`);
    if (at <= previous) throw Error(`${what}: ${key} must ascend`);
    previous = at;
    row(entry, `${what}[${i}]`);
  });
}

const CAMERA_TYPES = ['external', 'onboard', 'tv'] as const;

/** A look's exposure target, white balance and tone curve (a > 0); the clear values and the overcast ones share this shape. */
function exposureLook(look: Record<string, unknown>, at: string): void {
  numbers({targetExposure: look.targetExposure, whiteBalanceK: look.whiteBalanceK}, ['targetExposure', 'whiteBalanceK'], at, true);
  numbers(look.toneCurve, ['a', 'b'], `${at}.toneCurve`, false);
  if ((look.toneCurve as {a: number}).a <= 0) throw Error(`${at}.toneCurve.a: must be positive`);
}

/** One camera type's post-processing: a window inside the frame, a positive adaptation scale and weather blend rate, ascending profiles with clear and overcast looks. */
function parseCameraType(value: unknown, what: string): void {
  const row = record(value, what);
  exactKeys(row, ['meteringWindow', 'adaptationScale', 'weatherBlendRate', 'profiles', 'ambientOcclusion'], what);
  screenWindow(row.meteringWindow, `${what}.meteringWindow`);
  if (finite(row.adaptationScale, `${what}.adaptationScale`) <= 0) throw Error(`${what}.adaptationScale: must be positive`);
  if (finite(row.weatherBlendRate, `${what}.weatherBlendRate`) <= 0) throw Error(`${what}.weatherBlendRate: must be positive`);
  ascending(array(row.profiles, `${what}.profiles`, 32), `${what}.profiles`, (p, at) => {
    exactKeys(p, ['sunTarget', 'targetExposure', 'whiteBalanceK', 'toneCurve', 'weatherLerpPower', 'overcast'], at);
    exposureLook(p, at);
    if (finite(p.weatherLerpPower, `${at}.weatherLerpPower`) <= 0) throw Error(`${at}.weatherLerpPower: must be positive`);
    const overcast = record(p.overcast, `${at}.overcast`);
    exactKeys(overcast, ['targetExposure', 'whiteBalanceK', 'toneCurve'], `${at}.overcast`);
    exposureLook(overcast, `${at}.overcast`);
  }, 'sunTarget');
  numbers(row.ambientOcclusion, ['radiusM', 'samples', 'scale', 'colour'], `${what}.ambientOcclusion`, false);
}

/** The catalog's camera (SceneryCamera): a positive output gamma and every camera type. */
function parseCamera(value: unknown, what: string): SceneryCamera {
  const row = record(value, what);
  exactKeys(row, ['outputGamma', 'sceneLuminanceScale', 'types'], what);
  if (finite(row.outputGamma, `${what}.outputGamma`) <= 0) throw Error(`${what}.outputGamma: must be positive`);
  if (finite(row.sceneLuminanceScale, `${what}.sceneLuminanceScale`) <= 0) throw Error(`${what}.sceneLuminanceScale: must be positive`);
  const types = record(row.types, `${what}.types`);
  exactKeys(types, CAMERA_TYPES, `${what}.types`);
  for (const type of CAMERA_TYPES) parseCameraType(types[type], `${what}.types.${type}`);
  return structuredClone(row) as unknown as SceneryCamera;
}

/** The catalog's shading (SceneryShading): positive scales, ordered limits, known LOD modes and non-empty unit-direction kernels. */
function parseShading(value: unknown, what: string): SceneryShading {
  const row = record(value, what);
  exactKeys(row, ['sunGlint', 'smallEdge', 'carPaintReflection', 'convolution', 'sceneryReflection', 'integrationMap'], what);
  numbers(row.sunGlint, ['cosineThreshold', 'roughnessCutoff', 'smoothSpecularScale'], `${what}.sunGlint`, true);
  if ((row.sunGlint as Record<string, number>).cosineThreshold > 1) throw Error(`${what}.sunGlint.cosineThreshold: above 1`);
  numbers(row.smallEdge, ['detectorScale', 'edgeScale', 'limitMin', 'limitMax'], `${what}.smallEdge`, true);
  const edge = row.smallEdge as Record<string, number>;
  if (edge.limitMin > edge.limitMax) throw Error(`${what}.smallEdge: limitMin above limitMax`);
  const paint = record(row.carPaintReflection, `${what}.carPaintReflection`);
  exactKeys(paint, ['roughnessCutoff', 'lodScale', 'clearCoatLod', 'baseCoatLod'], `${what}.carPaintReflection`);
  for (const key of ['roughnessCutoff', 'lodScale']) if (finite(paint[key], `${what}.carPaintReflection.${key}`) <= 0) throw Error(`${what}.carPaintReflection.${key}: must be positive`);
  for (const key of ['clearCoatLod', 'baseCoatLod']) if (paint[key] !== 'bias' && paint[key] !== 'explicit') throw Error(`${what}.carPaintReflection.${key}: expected bias or explicit`);
  const convolution = record(row.convolution, `${what}.convolution`);
  exactKeys(convolution, ['kernels'], `${what}.convolution`);
  const kernels = array(convolution.kernels, `${what}.convolution.kernels`, 16);
  if (!kernels.length) throw Error(`${what}.convolution.kernels: empty`);
  kernels.forEach((value, i) => {
    const at = `${what}.convolution.kernels[${i}]`, kernel = record(value, at);
    exactKeys(kernel, ['specularPower', 'sourceLod', 'samples'], at);
    const power = text(kernel.specularPower, `${at}.specularPower`, 16);
    if (power !== 'INF' && !(Number(power) > 0)) throw Error(`${at}.specularPower: expected INF or a positive number`);
    count(kernel.sourceLod, `${at}.sourceLod`, 16);
    const samples = array(kernel.samples, `${at}.samples`, 1024);
    if (!samples.length) throw Error(`${at}.samples: empty`);
    samples.forEach((sample, j) => {
      if (Math.abs(Math.hypot(...vec3(sample, `${at}.samples[${j}]`)) - 1) > 1e-3) throw Error(`${at}.samples[${j}]: not a unit direction`);
    });
  });
  const scenery = record(row.sceneryReflection, `${what}.sceneryReflection`);
  exactKeys(scenery, ['lodScale', 'lod', 'dielectricF0', 'families'], `${what}.sceneryReflection`);
  if (finite(scenery.lodScale, `${what}.sceneryReflection.lodScale`) <= 0) throw Error(`${what}.sceneryReflection.lodScale: must be positive`);
  if (scenery.lod !== 'bias' && scenery.lod !== 'explicit') throw Error(`${what}.sceneryReflection.lod: expected bias or explicit`);
  const f0 = finite(scenery.dielectricF0, `${what}.sceneryReflection.dielectricF0`);
  if (f0 < 0 || f0 > 1) throw Error(`${what}.sceneryReflection.dielectricF0: outside 0–1`);
  const families = array(scenery.families, `${what}.sceneryReflection.families`, 64).map((family, i) => text(family, `${what}.sceneryReflection.families[${i}]`, 64));
  if (!families.length) throw Error(`${what}.sceneryReflection.families: empty`);
  parseIntegrationMap(row.integrationMap, `${what}.integrationMap`);
  return structuredClone(row) as unknown as SceneryShading;
}

/** The split-sum table: `width` × `height` 8-bit (scale, bias) pairs, row-major, N·V along a row, roughness down the rows. */
function parseIntegrationMap(value: unknown, what: string): void {
  const map = record(value, what);
  exactKeys(map, ['width', 'height', 'encoding', 'scale', 'bias'], what);
  const width = count(map.width, `${what}.width`, 1024), height = count(map.height, `${what}.height`, 1024);
  if (!width || !height) throw Error(`${what}: empty`);
  if (map.encoding !== 'unorm8') throw Error(`${what}.encoding: expected unorm8`);
  for (const key of ['scale', 'bias']) {
    const values = array(map[key], `${what}.${key}`, width * height);
    if (values.length !== width * height) throw Error(`${what}.${key}: expected width × height values`);
    values.forEach((n, i) => { if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 255) throw Error(`${what}.${key}[${i}]: expected an integer 0–255`); });
  }
}

/** A group of exactly `keys`, all finite and at least zero, with `min` ≤ `max` where both are present. */
function range(value: unknown, keys: string[], what: string): Record<string, number> {
  numbers(value, keys, what, false);
  const group = value as Record<string, number>;
  for (const key of keys) if (group[key] < 0) throw Error(`${what}.${key}: must not be negative`);
  if ('min' in group && group.min > group.max) throw Error(`${what}: min above max`);
  return group;
}

/** Finite numbers ascending within [min, max], at most `limit` of them. */
function ascendingNumbers(value: unknown, what: string, limit: number, min: number, max: number): number[] {
  const values = array(value, what, limit).map((n, i) => finite(n, `${what}[${i}]`));
  if (!values.length) throw Error(`${what}: empty`);
  values.forEach((n, i) => {
    if (n < min || n > max) throw Error(`${what}[${i}]: out of range`);
    if (i && n <= values[i - 1]) throw Error(`${what}: values must ascend`);
  });
  return values;
}

/** The catalog's sun grids: `unit`, the sample axes and one grid per layout of positive RGB triples, coverage rows by elevation columns. */
function parseSun(value: unknown, what: string): { sun: Omit<ScenerySun, 'grid'>; sunLayouts: Record<string, ScenerySun['grid']> } {
  const row = record(value, what);
  exactKeys(row, ['unit', 'sunElevationDeg', 'cloudCoverage', 'layouts'], what);
  const unit = text(row.unit, `${what}.unit`), sunElevationDeg = ascendingNumbers(row.sunElevationDeg, `${what}.sunElevationDeg`, 64, -90, 90);
  const cloudCoverage = ascendingNumbers(row.cloudCoverage, `${what}.cloudCoverage`, 16, 0, 1);
  const layouts = record(row.layouts, `${what}.layouts`), sunLayouts: Record<string, ScenerySun['grid']> = {};
  for (const [key, grid] of Object.entries(layouts)) {
    const at = `${what}.layouts.${key}`, rows = array(grid, at, cloudCoverage.length);
    if (rows.length !== cloudCoverage.length) throw Error(`${at}: expected one row per coverage`);
    sunLayouts[key] = rows.map((value, i) => {
      const columns = array(value, `${at}[${i}]`, sunElevationDeg.length);
      if (columns.length !== sunElevationDeg.length) throw Error(`${at}[${i}]: expected one sample per elevation`);
      return columns.map((sample, j) => {
        const rgb = array(sample, `${at}[${i}][${j}]`, 3);
        if (rgb.length !== 3) throw Error(`${at}[${i}][${j}]: expected an RGB triple`);
        return rgb.map((n, k) => {
          if (finite(n, `${at}[${i}][${j}][${k}]`) <= 0) throw Error(`${at}[${i}][${j}][${k}]: must be positive`);
          return n as number;
        }) as [number, number, number];
      });
    });
  }
  return { sun: { unit, sunElevationDeg, cloudCoverage }, sunLayouts };
}

/** The catalog's sky (ScenerySky): five Perez scales, ascending multiplier rows of four, the turbidity, air mass, haze model, sun grids, the sky model's inputs and its colour profiles. */
function parseSky(value: unknown, what: string): { sky: Omit<ScenerySky, 'sun'>; layoutAltitudeM: Record<string, number> } & ReturnType<typeof parseSun> {
  const row = record(value, what);
  exactKeys(row, ['perezScale', 'perezMultipliers', 'pollution', 'turbidity', 'airMass', 'fog', 'sun', 'hosek', 'haze', 'colourProfiles'], what);
  const { sun, sunLayouts } = parseSun(row.sun, `${what}.sun`);
  range(row.pollution, ['cloudyDamping'], `${what}.pollution`);
  if (range(row.turbidity, ['base', 'overcast', 'storm', 'pollution', 'min', 'max'], `${what}.turbidity`).min <= 0) throw Error(`${what}.turbidity.min: must be positive`);
  range(row.airMass, ['clear', 'pollution'], `${what}.airMass`);
  const fog = record(row.fog, `${what}.fog`);
  exactKeys(fog, ['density', 'colour', 'sunInfluence', 'height'], `${what}.fog`);
  range(fog.density, ['base', 'overcast', 'storm', 'sunrise', 'pollution', 'min', 'max'], `${what}.fog.density`);
  nonNegative(fog.sunInfluence, `${what}.fog.sunInfluence`);
  range(fog.height, ['max', 'scalar', 'exponent', 'scalarMin', 'scalarMax', 'exponentMin'], `${what}.fog.height`);
  const fogHeight = fog.height as Record<string, number>;
  if (fogHeight.scalarMin > fogHeight.scalarMax) throw Error(`${what}.fog.height: scalarMin above scalarMax`);
  const colour = record(fog.colour, `${what}.fog.colour`);
  exactKeys(colour, ['horizonSampleElevationDeg', 'horizonSampleCount', 'horizonFovDeg', 'pollutionOffset', 'override', 'luminance', 'sunElevationRampDeg', 'sunElevationRampOffset'], `${what}.fog.colour`);
  const count = finite(colour.horizonSampleCount, `${what}.fog.colour.horizonSampleCount`);
  if (!Number.isInteger(count) || count < 1 || count > 64) throw Error(`${what}.fog.colour.horizonSampleCount: expected 1 to 64 samples`);
  if (Math.abs(finite(colour.horizonSampleElevationDeg, `${what}.fog.colour.horizonSampleElevationDeg`)) >= 90) throw Error(`${what}.fog.colour.horizonSampleElevationDeg: out of range`);
  const fov = finite(colour.horizonFovDeg, `${what}.fog.colour.horizonFovDeg`);
  if (fov < 0 || fov > 360) throw Error(`${what}.fog.colour.horizonFovDeg: out of range`);
  const offset = array(colour.pollutionOffset, `${what}.fog.colour.pollutionOffset`, 3);
  if (offset.length !== 3) throw Error(`${what}.fog.colour.pollutionOffset: expected three numbers`);
  offset.forEach((n, i) => finite(n, `${what}.fog.colour.pollutionOffset[${i}]`));
  range(colour.override, ['base', 'overcast', 'storm'], `${what}.fog.colour.override`);
  range(colour.luminance, ['base', 'sunrise', 'overcast', 'storm'], `${what}.fog.colour.luminance`);
  if (finite(colour.sunElevationRampDeg, `${what}.fog.colour.sunElevationRampDeg`) <= 0) throw Error(`${what}.fog.colour.sunElevationRampDeg: must be positive`);
  finite(colour.sunElevationRampOffset, `${what}.fog.colour.sunElevationRampOffset`);
  const scale = array(row.perezScale, `${what}.perezScale`, 5);
  if (scale.length !== 5) throw Error(`${what}.perezScale: expected five numbers`);
  scale.forEach((n, i) => finite(n, `${what}.perezScale[${i}]`));
  ascending(array(row.perezMultipliers, `${what}.perezMultipliers`, 181), `${what}.perezMultipliers`, (m, at) => {
    exactKeys(m, ['sunElevationDeg', 'abcd'], at);
    const abcd = array(m.abcd, `${at}.abcd`, 4);
    if (abcd.length !== 4) throw Error(`${at}.abcd: expected four numbers`);
    abcd.forEach((n, i) => finite(n, `${at}.abcd[${i}]`));
  });
  const hosek = record(row.hosek, `${what}.hosek`);
  exactKeys(hosek, ['albedo', 'scaleHeightM', 'layoutAltitudeM', 'xyzToRgb', 'coefficients', 'radiances'], `${what}.hosek`);
  const albedo = finite(hosek.albedo, `${what}.hosek.albedo`);
  if (albedo < 0 || albedo > 1) throw Error(`${what}.hosek.albedo: expected 0 to 1`);
  if (finite(hosek.scaleHeightM, `${what}.hosek.scaleHeightM`) <= 0) throw Error(`${what}.hosek.scaleHeightM: must be positive`);
  const matrix = array(hosek.xyzToRgb, `${what}.hosek.xyzToRgb`, 3);
  if (matrix.length !== 3) throw Error(`${what}.hosek.xyzToRgb: expected three rows`);
  matrix.forEach((matrixRow, i) => vec3(matrixRow, `${what}.hosek.xyzToRgb[${i}]`));
  for (const [key, length] of [['coefficients', 1080], ['radiances', 120]] as const) {
    const channels = array(hosek[key], `${what}.hosek.${key}`, 3);
    if (channels.length !== 3) throw Error(`${what}.hosek.${key}: expected X, Y and Z`);
    channels.forEach((channel, i) => {
      const values = array(channel, `${what}.hosek.${key}[${i}]`, length);
      if (values.length !== length) throw Error(`${what}.hosek.${key}[${i}]: expected ${length} values`);
      values.forEach((n, j) => finite(n, `${what}.hosek.${key}[${i}][${j}]`));
    });
  }
  const altitudes = record(hosek.layoutAltitudeM, `${what}.hosek.layoutAltitudeM`), layoutAltitudeM: Record<string, number> = {};
  for (const [key, value] of Object.entries(altitudes)) layoutAltitudeM[key] = finite(value, `${what}.hosek.layoutAltitudeM.${key}`);
  const haze = record(row.haze, `${what}.haze`);
  exactKeys(haze, ['depth', 'intensity', 'luminance'], `${what}.haze`);
  range(haze.depth, ['base', 'overcast', 'pollution'], `${what}.haze.depth`);
  range(haze.intensity, ['base', 'dawn', 'overcast'], `${what}.haze.intensity`);
  range(haze.luminance, ['sunrise', 'base', 'pollution', 'overcast', 'storm'], `${what}.haze.luminance`);
  const colourProfiles = record(row.colourProfiles, `${what}.colourProfiles`);
  exactKeys(colourProfiles, ['weatherBlendRate', 'profiles'], `${what}.colourProfiles`);
  if (finite(colourProfiles.weatherBlendRate, `${what}.colourProfiles.weatherBlendRate`) <= 0) throw Error(`${what}.colourProfiles.weatherBlendRate: must be positive`);
  ascending(array(colourProfiles.profiles, `${what}.colourProfiles.profiles`, 32), `${what}.colourProfiles.profiles`, (profile, at) => {
    exactKeys(profile, ['sunTarget', 'weatherLerpPower', 'clear', 'overcast'], at);
    if (finite(profile.weatherLerpPower, `${at}.weatherLerpPower`) <= 0) throw Error(`${at}.weatherLerpPower: must be positive`);
    for (const key of ['clear', 'overcast']) {
      const look = record(profile[key], `${at}.${key}`);
      exactKeys(look, ['gain', 'sunProximity'], `${at}.${key}`);
      vec3(look.gain, `${at}.${key}.gain`).forEach((n, i) => nonNegative(n, `${at}.${key}.gain[${i}]`));
      nonNegative(look.sunProximity, `${at}.${key}.sunProximity`);
    }
  }, 'sunTarget');
  const { sun: _catalogSun, ...sky } = row;
  return { sky: structuredClone(sky) as unknown as Omit<ScenerySky, 'sun'>, sun, sunLayouts, layoutAltitudeM };
}

function parseChunk(value: unknown, what: string): SceneryChunk {
  const row = record(value, what), kind = row.kind;
  if (kind !== 'horizon' && kind !== 'main' && kind !== 'pit') throw Error(`${what}: unknown chunk kind`);
  exactKeys(row, [...CHUNK_COMMON, ...(kind === 'horizon' ? [] : kind === 'main' ? ['lapStartM', 'lapEndM', 'prev', 'next'] : ['lapStartM', 'lapEndM', 'pitStartM', 'pitEndM', 'prev', 'next'])], what);
  const hash = sha256(row.sha256, `${what}.sha256`);
  if (row.asset !== `scenery/${hash}.glb`) throw Error(`${what}: asset is not the content-named GLB`);
  for (const key of ['byteLength', 'triangles', 'vertices', 'drawCalls', 'shadowDrawCalls', 'shadowTriangles', 'geometryBytes', 'meshes', 'materials']) count(row[key], `${what}.${key}`);
  if (!row.byteLength || !row.triangles || !row.drawCalls) throw Error(`${what}: empty chunk`);
  if ((row.shadowDrawCalls as number) > (row.drawCalls as number) || (row.shadowTriangles as number) > (row.triangles as number)) throw Error(`${what}: more shadow casters than primitives`);
  text(row.id, `${what}.id`, 32); bounds(row.bounds, `${what}.bounds`);
  array(row.textures, `${what}.textures`, MAX_TEXTURES).forEach((asset, i) => text(asset, `${what}.textures[${i}]`, 160));
  if (kind !== 'horizon') {
    nonNegative(row.lapStartM, `${what}.lapStartM`); nonNegative(row.lapEndM, `${what}.lapEndM`);
    if ((row.lapStartM as number) >= (row.lapEndM as number)) throw Error(`${what}: invalid lap range`);
    for (const key of ['prev', 'next']) if (row[key] !== null) text(row[key], `${what}.${key}`, 32);
    if (kind === 'pit') {
      nonNegative(row.pitStartM, `${what}.pitStartM`); nonNegative(row.pitEndM, `${what}.pitEndM`);
      if ((row.pitStartM as number) >= (row.pitEndM as number)) throw Error(`${what}: invalid pit range`);
    }
  }
  return structuredClone(row) as unknown as SceneryChunk;
}

function parseTexture(value: unknown, what: string): SceneryTexture {
  const row = record(value, what);
  exactKeys(row, TEXTURE, what);
  const hash = sha256(row.sha256, `${what}.sha256`);
  if (row.asset !== `scenery/textures/${hash}.ktx2.zst`) throw Error(`${what}: asset is not the content-named KTX2`);
  for (const key of ['byteLength', 'width', 'height', 'levels', 'gpuBytes']) if (count(row[key], `${what}.${key}`) === 0) throw Error(`${what}.${key}: must be positive`);
  text(row.format, `${what}.format`, 64);
  if (typeof row.srgb !== 'boolean') throw Error(`${what}.srgb: expected a boolean`);
  return structuredClone(row) as unknown as SceneryTexture;
}

/** Lap ranges of the main sectors are ordered, inside the route and linked circularly; pit chunks chain in pit lane order. */
function checkSectorOrder(layout: SceneryLayout): void {
  const main = layout.sectors.filter(sector => sector.kind === 'main'), pit = layout.sectors.filter(sector => sector.kind === 'pit');
  if (!main.length) throw Error(`${layout.layoutKey}: no main sectors`);
  main.forEach((sector, i) => {
    if (sector.lapEndM > layout.routeLengthM + 1e-6) throw Error(`${sector.id}: lap range exceeds the route`);
    if (i && sector.lapStartM < main[i - 1].lapEndM) throw Error(`${sector.id}: overlaps ${main[i - 1].id}`);
    if (sector.prev !== main[(i + main.length - 1) % main.length].id || sector.next !== main[(i + 1) % main.length].id) throw Error(`${sector.id}: prev/next do not follow the lap order`);
  });
  pit.forEach((sector, i) => {
    if (sector.prev !== (i ? pit[i - 1].id : null) || sector.next !== (i + 1 < pit.length ? pit[i + 1].id : null)) throw Error(`${sector.id}: prev/next do not follow the pit lane order`);
  });
}

type SharedScenery = Pick<SceneryLayout, 'chunking' | 'streaming' | 'camera' | 'shading'> & ReturnType<typeof parseSky>;

/** A layout row; `chunking`, `streaming`, `camera`, `sky` and `shading` are the catalog's shared parameters, attached to every layout the client receives, the sky with the layout's own sun grid. */
function parseLayout(value: unknown, what: string, shared: SharedScenery): SceneryLayout {
  const row = record(value, what);
  knownKeys(row, ['layoutKey', 'sourceGeometryRevision', 'routeLengthM', 'pitLaneLengthM', 'shadowRangeM', 'environmentProbe', 'horizon', 'sectors', 'textures', 'totals'], ['daylight'], what);
  text(row.layoutKey, `${what}.layoutKey`); text(row.sourceGeometryRevision, `${what}.sourceGeometryRevision`);
  if (finite(row.routeLengthM, `${what}.routeLengthM`) <= 0) throw Error(`${what}: invalid route length`);
  nonNegative(row.pitLaneLengthM, `${what}.pitLaneLengthM`);
  if (finite(row.shadowRangeM, `${what}.shadowRangeM`) <= 0) throw Error(`${what}: invalid shadow range`);
  const probe = record(row.environmentProbe, `${what}.environmentProbe`);
  exactKeys(probe, ['position'], `${what}.environmentProbe`);
  vec3(probe.position, `${what}.environmentProbe.position`);
  if (row.daylight !== undefined) parseDaylight(row.daylight, `${what}.daylight`);
  numbers(row.totals, TOTALS, `${what}.totals`, false);
  const horizon = parseChunk(row.horizon, `${what}.horizon`);
  if (horizon.kind !== 'horizon') throw Error(`${what}: the horizon chunk is not a horizon`);
  const sectors = array(row.sectors, `${what}.sectors`, MAX_CHUNKS).map((sector, i) => {
    const chunk = parseChunk(sector, `${what}.sectors[${i}]`);
    if (chunk.kind === 'horizon') throw Error(`${what}.sectors[${i}]: a sector cannot be the horizon`);
    return chunk;
  });
  const textures = array(row.textures, `${what}.textures`, MAX_TEXTURES).map((texture, i) => parseTexture(texture, `${what}.textures[${i}]`));
  const grid = shared.sunLayouts[row.layoutKey as string];
  if (!grid) throw Error(`${what}: no sun grid for ${row.layoutKey as string}`);
  const altitudeM = shared.layoutAltitudeM[row.layoutKey as string];
  if (altitudeM === undefined) throw Error(`${what}: no altitude for ${row.layoutKey as string}`);
  const { chunking, streaming, camera, sky, sun, shading } = shared, { layoutAltitudeM: _altitudes, ...hosek } = sky.hosek as unknown as Record<string, unknown>;
  const layout = { ...structuredClone(row), ...structuredClone({ chunking, streaming, camera, shading, sky: { ...sky, hosek: { ...hosek, altitudeM }, sun: { ...sun, grid } } }), horizon, sectors, textures } as unknown as SceneryLayout;
  const ids = [horizon.id, ...sectors.map(sector => sector.id)], known = new Set(textures.map(texture => texture.asset));
  if (new Set(ids).size !== ids.length) throw Error(`${what}: duplicate chunk ids`);
  if (known.size !== textures.length) throw Error(`${what}: duplicate textures`);
  for (const chunk of [horizon, ...sectors]) for (const asset of chunk.textures) if (!known.has(asset)) throw Error(`${chunk.id}: texture ${asset} is not in the layout texture list`);
  checkSectorOrder(layout);
  return layout;
}

export function loadScenePackage(root: string, catalog: unknown, geometry: (key: string) => TrackBoundaryGeometry | null): SceneryStore {
  const index = record(catalog, 'scenery catalog');
  exactKeys(index, ['chunking', 'streaming', 'camera', 'sky', 'shading', 'layouts'], 'scenery catalog');
  numbers(index.chunking, CHUNKING, 'scenery catalog.chunking', true);
  numbers(index.streaming, STREAMING, 'scenery catalog.streaming', true);
  const shared = { chunking: index.chunking, streaming: index.streaming, camera: parseCamera(index.camera, 'scenery catalog.camera'), shading: parseShading(index.shading, 'scenery catalog.shading'), ...parseSky(index.sky, 'scenery catalog.sky') } as SharedScenery;
  const rows = array(index.layouts, 'scenery layouts', 100);
  if (!rows.length) throw Error('scenery catalog: empty');
  const layouts = new Map<string, SceneryLayout>(), files = new Map<string, PackageFile>();
  const register = (asset: string, hash: string, byteLength: number, max: number) => {
    const known = files.get(asset);
    if (known) {
      if (known.sha256 !== hash || known.byteLength !== byteLength) throw Error(`Conflicting scenery file ${asset}`);
      return;
    }
    files.set(asset, registerPackageFile(root, asset, hash, byteLength, max));
  };
  rows.forEach((value, i) => {
    const layout = parseLayout(value, `scenery[${i}]`, shared);
    const track = geometry(layout.layoutKey);
    if (!track || track.geometryRevision !== layout.sourceGeometryRevision) throw Error(`${layout.layoutKey}: scenery does not match the track geometry`);
    if (layouts.has(layout.layoutKey)) throw Error(`${layout.layoutKey}: scenery listed twice`);
    for (const chunk of [layout.horizon, ...layout.sectors]) register(chunk.asset, chunk.sha256, chunk.byteLength, MAX_GLB_BYTES);
    for (const texture of layout.textures) register(texture.asset, texture.sha256, texture.byteLength, MAX_TEXTURE_BYTES);
    layouts.set(layout.layoutKey, layout);
  });
  exactKeys(shared.sunLayouts, [...layouts.keys()], 'scenery catalog.sky.sun.layouts');
  exactKeys(shared.layoutAltitudeM, [...layouts.keys()], 'scenery catalog.sky.hosek.layoutAltitudeM');
  return { layouts };
}
