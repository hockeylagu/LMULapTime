import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { SceneryBounds, SceneryCamera, SceneryChunk, SceneryDaylight, SceneryLayout, SceneryTexture } from '../../shared/types/scenes/scenery.js';
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
  knownKeys(row, ['date', 'sessions', 'airPollution', 'hazeBaseScale', 'latitudeDeg', 'longitudeDeg', 'utcOffsetHours'], [], what);
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
  return structuredClone(row) as unknown as SceneryDaylight;
}

/** The catalog's camera profile (SceneryCamera): fractions inside the frame, ascending profile elevations, positive values. */
function parseCamera(value: unknown, what: string): SceneryCamera {
  const row = record(value, what);
  exactKeys(row, ['meteringWindow', 'profiles', 'toneCurve', 'glareThreshold', 'ambientOcclusion'], what);
  const window = record(row.meteringWindow, `${what}.meteringWindow`);
  numbers(window, ['x', 'y', 'width', 'height'], `${what}.meteringWindow`, false);
  if ((window.x as number) + (window.width as number) > 1 || (window.y as number) + (window.height as number) > 1 || !window.width || !window.height) throw Error(`${what}.meteringWindow: outside the frame`);
  const profiles = array(row.profiles, `${what}.profiles`, 32);
  if (!profiles.length) throw Error(`${what}.profiles: empty`);
  let previous = -Infinity;
  profiles.forEach((profile, i) => {
    const p = record(profile, `${what}.profiles[${i}]`);
    exactKeys(p, ['sunElevationDeg', 'targetExposure', 'whiteBalanceK'], `${what}.profiles[${i}]`);
    const elevation = finite(p.sunElevationDeg, `${what}.profiles[${i}].sunElevationDeg`);
    if (elevation <= previous) throw Error(`${what}.profiles: elevations must ascend`);
    previous = elevation;
    numbers({targetExposure: p.targetExposure, whiteBalanceK: p.whiteBalanceK}, ['targetExposure', 'whiteBalanceK'], `${what}.profiles[${i}]`, true);
  });
  numbers(row.toneCurve, ['a', 'b'], `${what}.toneCurve`, false);
  if ((row.toneCurve as {a: number}).a <= 0) throw Error(`${what}.toneCurve.a: must be positive`);
  if (finite(row.glareThreshold, `${what}.glareThreshold`) <= 0) throw Error(`${what}.glareThreshold: must be positive`);
  numbers(row.ambientOcclusion, ['radiusM', 'samples', 'scale', 'colour'], `${what}.ambientOcclusion`, false);
  return structuredClone(row) as unknown as SceneryCamera;
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

/** A layout row; `chunking`, `streaming` and `camera` are the catalog's shared parameters, attached to every layout the client receives. */
function parseLayout(value: unknown, what: string, shared: Pick<SceneryLayout, 'chunking' | 'streaming' | 'camera'>): SceneryLayout {
  const row = record(value, what);
  knownKeys(row, ['layoutKey', 'sourceGeometryRevision', 'routeLengthM', 'pitLaneLengthM', 'shadowRangeM', 'horizon', 'sectors', 'textures', 'totals'], ['daylight'], what);
  text(row.layoutKey, `${what}.layoutKey`); text(row.sourceGeometryRevision, `${what}.sourceGeometryRevision`);
  if (finite(row.routeLengthM, `${what}.routeLengthM`) <= 0) throw Error(`${what}: invalid route length`);
  nonNegative(row.pitLaneLengthM, `${what}.pitLaneLengthM`);
  if (finite(row.shadowRangeM, `${what}.shadowRangeM`) <= 0) throw Error(`${what}: invalid shadow range`);
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
  const layout = { ...structuredClone(row), ...structuredClone(shared), horizon, sectors, textures } as unknown as SceneryLayout;
  const ids = [horizon.id, ...sectors.map(sector => sector.id)], known = new Set(textures.map(texture => texture.asset));
  if (new Set(ids).size !== ids.length) throw Error(`${what}: duplicate chunk ids`);
  if (known.size !== textures.length) throw Error(`${what}: duplicate textures`);
  for (const chunk of [horizon, ...sectors]) for (const asset of chunk.textures) if (!known.has(asset)) throw Error(`${chunk.id}: texture ${asset} is not in the layout texture list`);
  checkSectorOrder(layout);
  return layout;
}

export function loadScenePackage(root: string, catalog: unknown, geometry: (key: string) => TrackBoundaryGeometry | null): SceneryStore {
  const index = record(catalog, 'scenery catalog');
  exactKeys(index, ['chunking', 'streaming', 'camera', 'layouts'], 'scenery catalog');
  numbers(index.chunking, CHUNKING, 'scenery catalog.chunking', true);
  numbers(index.streaming, STREAMING, 'scenery catalog.streaming', true);
  const shared = { chunking: index.chunking, streaming: index.streaming, camera: parseCamera(index.camera, 'scenery catalog.camera') } as Pick<SceneryLayout, 'chunking' | 'streaming' | 'camera'>;
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
  return { layouts };
}
