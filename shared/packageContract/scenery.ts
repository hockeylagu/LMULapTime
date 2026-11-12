// Copied from LMUTrackPipeline/shared/contract/scenery.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The scenery catalog `scenery/index.json` (docs/PACKAGE_FORMAT.md, Scenery; docs/SCENE_PACKAGE.md): `{chunking, streaming, textures, layouts}` in the compact form
 * the package stores, the expanded layout rows tools work with (`asset` paths rebuilt, chunk texture lists as paths), the conversion between the two and the strict parser.
 * The camera, sky and shading profiles are the rendering file (rendering.ts).
 */
import {LAYOUT_KEY, sceneryChunkPath, sceneryTexturePath} from './paths.js';
import type {Obj, Vec3} from './strict.js';
import {array, count, exactKeys, finite, knownKeys, nonNegative, orderedKeys, positive, positiveCount, record, sameJson, sha256, text, vec3} from './strict.js';
import type {TextureStart} from './textures.js';
import {parseTextureStart} from './textures.js';

export interface SceneryBounds {min: Vec3; max: Vec3}

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

/** The resident-set rule published with the catalog (sceneBudgets.json `streaming`). */
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
  /** Degrees clockwise from true north. */
  sunBearingDeg?: number;
}

/** The venue's daylight: its location, date, session suns and the haze and fog scalars. */
export interface SceneryDaylight {
  /** Race date, `YYYY-MM-DD`. */
  date: string;
  /** race, qualify, practice1, practice2, in that order. */
  sessions: ScenerySessionDaylight[];
  airPollution: number;
  hazeBaseScale: number;
  hazeCloudyScale: number;
  hazeStormScale: number;
  hazeDawnScale: number;
  fogHeightAltitudeScalar: number;
  fogHeightExponentScalar: number;
  /** The track's location and its local offset from UTC on the race date (daylight saving included). */
  latitudeDeg: number;
  longitudeDeg: number;
  utcOffsetHours: number;
}

/** A texture file of the catalog table (one entry per distinct file, the same for every layout). */
export interface SceneryTextureFile {
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  levels: number;
  format: string;
  srgb: boolean;
  gpuBytes: number;
  start?: TextureStart;
}

/** A layout's reference to a table entry; `maxPx` is present only when the layout draws the file below its full size. */
export interface SceneryTextureRef {texture: number; maxPx?: number}

/** The chunk fields both forms state. `asset` and the texture list differ (see the compact and expanded chunk types). */
export interface SceneryChunkFields {
  id: string;
  bounds: SceneryBounds;
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
}
/** A main sector covers `[lapStartM, lapEndM]` of the lap; a pit chunk also covers a pit lane range. */
export interface SceneryRangeFields {kind: 'main' | 'pit'; lapStartM: number; lapEndM: number; pitStartM?: number; pitEndM?: number}

/** Compact chunk: no `asset` (derived from `sha256`); `textures` are indices into the row's `textures` list. */
export type CompactHorizonChunk = SceneryChunkFields & {kind: 'horizon'; textures: number[]};
export type CompactSectorChunk = SceneryChunkFields & SceneryRangeFields & {textures: number[]};
export interface CompactLayoutRow {
  layoutKey: string;
  sourceGeometryRevision: string;
  routeLengthM: number;
  pitLaneLengthM: number;
  shadowRangeM: number;
  /** Where the venue's environment (reflection and irradiance) is captured, in LMU local metres. */
  environmentProbe: {position: Vec3};
  daylight: SceneryDaylight;
  horizon: CompactHorizonChunk;
  sectors: CompactSectorChunk[];
  textures: SceneryTextureRef[];
}

/** The package file. */
export interface SceneryCatalog {
  chunking: SceneryChunkingParameters;
  streaming: SceneryStreaming;
  textures: SceneryTextureFile[];
  layouts: CompactLayoutRow[];
}

/** Expanded forms (the layout-index rows of docs/SCENE_PACKAGE.md without `totals`/`prev`/`next`): `asset` paths rebuilt, chunk texture lists as paths. */
export type SceneryTexture = Omit<SceneryTextureFile, 'start'> & {asset: string; maxPx?: number; start?: TextureStart & {asset: string}};
export type SceneryHorizonChunk = SceneryChunkFields & {kind: 'horizon'; asset: string; textures: string[]};
export type ScenerySectorChunk = SceneryChunkFields & SceneryRangeFields & {asset: string; textures: string[]};
export type SceneryLayoutRow = Omit<CompactLayoutRow, 'horizon' | 'sectors' | 'textures'> & {horizon: SceneryHorizonChunk; sectors: ScenerySectorChunk[]; textures: SceneryTexture[]};

export const SCENERY_CATALOG_KEYS = ['chunking', 'streaming', 'textures', 'layouts'] as const;
export const CHUNKING_KEYS = ['sectorLengthM', 'minSectorLengthM', 'maxSectorTriangles', 'horizonDistanceM', 'skylineHeightM', 'skylineMinDistanceM', 'terrainScaleExtentM', 'pitBandM'] as const;
export const STREAMING_KEYS = ['residentBehindM', 'residentAheadM', 'freeCameraRadiusM'] as const;
const SESSIONS = ['race', 'qualify', 'practice1', 'practice2'];
const TEXTURE_KEYS = ['sha256', 'byteLength', 'width', 'height', 'levels', 'format', 'srgb', 'gpuBytes'];
const CHUNK_COMMON = ['id', 'kind', 'bounds', 'sha256', 'byteLength', 'triangles', 'vertices', 'drawCalls', 'shadowDrawCalls', 'shadowTriangles', 'geometryBytes', 'meshes', 'materials', 'textures'];
const ROW_KEYS = ['layoutKey', 'sourceGeometryRevision', 'routeLengthM', 'pitLaneLengthM', 'shadowRangeM', 'environmentProbe', 'daylight', 'horizon', 'sectors', 'textures'];
const MAX_LAYOUTS = 100, MAX_CHUNKS = 4096, MAX_TEXTURES = 8192;

/** A venue-shared chunk (vNNN) is written once and used by several layouts of the venue. */
const isSharedChunk = (chunk: {id: string}) => /^v\d+$/.test(chunk.id);

/**
 * Structural problems of one layout row that hold in the compact, the expanded and the staged layout-index form: shadow range, environment probe, the
 * horizon, unique chunk ids, the lap partition by own sectors, shared-chunk ranges, pit order. `links` (staged rows only) also compares `prev`/`next` with the order;
 * package rows carry none, the order they derive from is checked either way. Texture membership depends on the form and is checked by the caller.
 */
export function layoutRowProblems(row: any, {links = true}: {links?: boolean} = {}): string[] {
  const problems: string[] = [];
  if (!(typeof row.shadowRangeM === 'number' && row.shadowRangeM > 0)) problems.push(`shadowRangeM ${JSON.stringify(row.shadowRangeM)} is not a positive number`);
  if (!(Array.isArray(row.environmentProbe?.position) && row.environmentProbe.position.length === 3 && row.environmentProbe.position.every(Number.isFinite))) problems.push(`environmentProbe ${JSON.stringify(row.environmentProbe)} is not 3 finite numbers`);
  if (!row.horizon || row.horizon.kind !== 'horizon') problems.push('missing horizon chunk');
  const ids = [row.horizon?.id, ...row.sectors.map((sector: any) => sector.id)];
  if (new Set(ids).size !== ids.length) problems.push('duplicate chunk ids');
  const main = row.sectors.filter((sector: any) => sector.kind === 'main'), pit = row.sectors.filter((sector: any) => sector.kind === 'pit');
  if (!main.length) problems.push('no main sectors');
  // Own sectors (sNNN) partition the lap; a venue-shared chunk (vNNN) covers the lap range of its own triangles at this layout, may
  // overlap own sectors and may wrap past the line (lapEndM up to lapStartM + routeLengthM).
  let previousOwn: any = null;
  main.forEach((sector: any, i: number) => {
    if (isSharedChunk(sector)) {
      if (!(sector.lapStartM >= 0 && sector.lapStartM < row.routeLengthM && sector.lapStartM < sector.lapEndM && sector.lapEndM <= sector.lapStartM + row.routeLengthM + 1e-6)) problems.push(`${sector.id}: invalid lap range`);
    } else {
      if (!(sector.lapStartM < sector.lapEndM) || sector.lapEndM > row.routeLengthM + 1e-6) problems.push(`${sector.id}: invalid lap range`);
      if (previousOwn && sector.lapStartM < previousOwn.lapEndM) problems.push(`${sector.id}: overlaps ${previousOwn.id}`);
      previousOwn = sector;
    }
    if (i && sector.lapStartM < main[i - 1].lapStartM) problems.push(`${sector.id}: main chunks are not ordered by lap start`);
    if (links && (sector.prev !== main[(i + main.length - 1) % main.length].id || sector.next !== main[(i + 1) % main.length].id)) problems.push(`${sector.id}: prev/next do not follow the lap order`);
  });
  pit.forEach((sector: any, i: number) => {
    if (links && (sector.prev !== (i ? pit[i - 1].id : null) || sector.next !== (i + 1 < pit.length ? pit[i + 1].id : null))) problems.push(`${sector.id}: prev/next do not follow the pit lane order`);
    if (!(sector.pitStartM < sector.pitEndM)) problems.push(`${sector.id}: invalid pit range`);
    if (i && sector.pitStartM < pit[i - 1].pitStartM) problems.push(`${sector.id}: pit chunks are not ordered by pit start`);
  });
  return problems;
}

function bounds(value: unknown, what: string): SceneryBounds {
  const box = record(value, what);
  exactKeys(box, ['min', 'max'], what);
  const min = vec3(box.min, `${what}.min`), max = vec3(box.max, `${what}.max`);
  if (min.some((n, i) => n > max[i])) throw Error(`${what}: min exceeds max`);
  return {min, max};
}

function numbers(value: unknown, keys: readonly string[], what: string): void {
  const row = record(value, what);
  exactKeys(row, keys, what);
  for (const key of keys) positive(row[key], `${what}.${key}`);
}

function parseDaylight(value: unknown, what: string): SceneryDaylight {
  const row = record(value, what);
  exactKeys(row, ['date', 'sessions', 'airPollution', 'hazeBaseScale', 'hazeCloudyScale', 'hazeStormScale', 'hazeDawnScale', 'fogHeightAltitudeScalar', 'fogHeightExponentScalar', 'latitudeDeg', 'longitudeDeg', 'utcOffsetHours'], what);
  if (Math.abs(finite(row.latitudeDeg, `${what}.latitudeDeg`)) > 90) throw Error(`${what}.latitudeDeg: out of range`);
  if (Math.abs(finite(row.longitudeDeg, `${what}.longitudeDeg`)) > 180) throw Error(`${what}.longitudeDeg: out of range`);
  if (Math.abs(finite(row.utcOffsetHours, `${what}.utcOffsetHours`)) > 14) throw Error(`${what}.utcOffsetHours: out of range`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(row.date, `${what}.date`, 10))) throw Error(`${what}.date: expected YYYY-MM-DD`);
  const sessions = array(row.sessions, `${what}.sessions`, SESSIONS.length);
  if (sessions.length !== SESSIONS.length) throw Error(`${what}.sessions: expected ${SESSIONS.join(', ')}`);
  sessions.forEach((item, i) => {
    const at = `${what}.sessions[${i}]`, session = record(item, at);
    knownKeys(session, ['id', 'localTime', 'sunElevationDeg'], ['sunBearingDeg'], at);
    if (session.id !== SESSIONS[i]) throw Error(`${at}: expected ${SESSIONS[i]}`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text(session.localTime, `${at}.localTime`, 5))) throw Error(`${at}.localTime: expected HH:MM`);
    if (Math.abs(finite(session.sunElevationDeg, `${at}.sunElevationDeg`)) > 90) throw Error(`${at}.sunElevationDeg: out of range`);
    if (session.sunBearingDeg !== undefined) {
      const bearing = finite(session.sunBearingDeg, `${at}.sunBearingDeg`);
      if (bearing < 0 || bearing >= 360) throw Error(`${at}.sunBearingDeg: out of range`);
    }
  });
  nonNegative(row.airPollution, `${what}.airPollution`);
  positive(row.hazeBaseScale, `${what}.hazeBaseScale`);
  for (const key of ['hazeCloudyScale', 'hazeStormScale', 'hazeDawnScale', 'fogHeightAltitudeScalar', 'fogHeightExponentScalar']) nonNegative(row[key], `${what}.${key}`);
  return value as SceneryDaylight;
}

function parseTextureEntry(value: unknown, what: string): SceneryTextureFile {
  const row = record(value, what);
  knownKeys(row, TEXTURE_KEYS, ['start'], what);
  sha256(row.sha256, `${what}.sha256`);
  for (const key of ['byteLength', 'width', 'height', 'levels', 'gpuBytes']) positiveCount(row[key], `${what}.${key}`);
  text(row.format, `${what}.format`, 64);
  if (typeof row.srgb !== 'boolean') throw Error(`${what}.srgb: expected a boolean`);
  if (row.start !== undefined) parseTextureStart(row.start, `${what}.start`, row as {width: number; height: number; levels: number} & Obj);
  return value as SceneryTextureFile;
}

/** Texture indices of a chunk: in range of the row's list, no repeats. */
function chunkTextures(value: unknown, rowTextures: number, what: string): number[] {
  const list = array(value, `${what}.textures`, MAX_TEXTURES).map((at, i) => {
    if (!Number.isInteger(at) || (at as number) < 0 || (at as number) >= rowTextures) throw Error(`${what}.textures[${i}]: index ${JSON.stringify(at)} is outside the layout texture list`);
    return at as number;
  });
  if (new Set(list).size !== list.length) throw Error(`${what}.textures: a texture is listed twice`);
  return list;
}

function parseChunk(value: unknown, what: string, rowTextures: number): CompactHorizonChunk | CompactSectorChunk {
  const row = record(value, what), kind = row.kind;
  if (kind !== 'horizon' && kind !== 'main' && kind !== 'pit') throw Error(`${what}: unknown chunk kind`);
  exactKeys(row, [...CHUNK_COMMON, ...(kind === 'horizon' ? [] : kind === 'main' ? ['lapStartM', 'lapEndM'] : ['lapStartM', 'lapEndM', 'pitStartM', 'pitEndM'])], what);
  sha256(row.sha256, `${what}.sha256`);
  for (const key of ['byteLength', 'triangles', 'vertices', 'drawCalls', 'shadowDrawCalls', 'shadowTriangles', 'geometryBytes', 'meshes', 'materials']) count(row[key], `${what}.${key}`);
  if (!row.byteLength || !row.triangles || !row.drawCalls) throw Error(`${what}: empty chunk`);
  if ((row.shadowDrawCalls as number) > (row.drawCalls as number) || (row.shadowTriangles as number) > (row.triangles as number)) throw Error(`${what}: more shadow casters than primitives`);
  text(row.id, `${what}.id`, 32);
  bounds(row.bounds, `${what}.bounds`);
  chunkTextures(row.textures, rowTextures, what);
  if (kind !== 'horizon') {
    nonNegative(row.lapStartM, `${what}.lapStartM`);
    nonNegative(row.lapEndM, `${what}.lapEndM`);
    if ((row.lapStartM as number) >= (row.lapEndM as number)) throw Error(`${what}: invalid lap range`);
    if (kind === 'pit') {
      nonNegative(row.pitStartM, `${what}.pitStartM`);
      nonNegative(row.pitEndM, `${what}.pitEndM`);
      if ((row.pitStartM as number) >= (row.pitEndM as number)) throw Error(`${what}: invalid pit range`);
    }
  }
  return value as CompactSectorChunk;
}

/** One compact layout row against the catalog texture table. */
function parseLayoutRow(value: unknown, what: string, table: SceneryTextureFile[], used: Set<number>): CompactLayoutRow {
  const row = record(value, what);
  exactKeys(row, ROW_KEYS, what);
  const layoutKey = text(row.layoutKey, `${what}.layoutKey`);
  if (!LAYOUT_KEY.test(layoutKey)) throw Error(`${what}.layoutKey: invalid layout identity`);
  text(row.sourceGeometryRevision, `${what}.sourceGeometryRevision`);
  positive(row.routeLengthM, `${what}.routeLengthM`);
  nonNegative(row.pitLaneLengthM, `${what}.pitLaneLengthM`);
  positive(row.shadowRangeM, `${what}.shadowRangeM`);
  const probe = record(row.environmentProbe, `${what}.environmentProbe`);
  exactKeys(probe, ['position'], `${what}.environmentProbe`);
  vec3(probe.position, `${what}.environmentProbe.position`);
  parseDaylight(row.daylight, `${what}.daylight`);
  const refs = array(row.textures, `${what}.textures`, MAX_TEXTURES), seen = new Set<number>();
  refs.forEach((item, i) => {
    const at = `${what}.textures[${i}]`, ref = record(item, at);
    knownKeys(ref, ['texture'], ['maxPx'], at);
    if (!Number.isInteger(ref.texture) || (ref.texture as number) < 0 || (ref.texture as number) >= table.length) throw Error(`${at}.texture: index ${JSON.stringify(ref.texture)} is outside the texture table`);
    const index = ref.texture as number;
    if (seen.has(index)) throw Error(`${at}: texture ${index} is listed twice`);
    seen.add(index); used.add(index);
    if (ref.maxPx !== undefined) {
      // The longer side of one of the file's levels, below its full size (absent = full size).
      const file = table[index], longer = Math.max(file.width, file.height), sizes = Array.from({length: file.levels}, (_, level) => Math.max(1, longer >> level));
      if (!Number.isInteger(ref.maxPx) || !sizes.includes(ref.maxPx as number) || (ref.maxPx as number) >= longer) throw Error(`${at}.maxPx: ${ref.maxPx} is not a level below the full size (${sizes.join(', ')})`);
    }
  });
  const horizon = parseChunk(row.horizon, `${what}.horizon`, refs.length);
  if (horizon.kind !== 'horizon') throw Error(`${what}.horizon: the horizon chunk is not a horizon`);
  const sectors = array(row.sectors, `${what}.sectors`, MAX_CHUNKS).map((sector, i) => {
    const chunk = parseChunk(sector, `${what}.sectors[${i}]`, refs.length);
    if (chunk.kind === 'horizon') throw Error(`${what}.sectors[${i}]: a sector cannot be the horizon`);
    return chunk;
  });
  const problems = layoutRowProblems({...row, horizon, sectors}, {links: false});
  if (problems.length) throw Error(`${what}: layout index is inconsistent: ${problems.slice(0, 5).join('; ')}`);
  const inChunks = new Set<number>([...horizon.textures, ...sectors.flatMap(sector => sector.textures)]);
  if (inChunks.size !== refs.length) throw Error(`${what}.textures: the texture list names textures no chunk uses`);
  return value as CompactLayoutRow;
}

/**
 * The compact catalog as the package stores it: keys and order, the shared chunking and streaming numbers, the texture table (sorted by sha256, no `asset`,
 * start files that are the third level down, every entry used), layouts sorted by key with their chunks, texture references (`maxPx` a level below the full
 * size), shadow range, environment probe, daylight and the lap/pit ordering. Whether the files exist and match their hashes is not checked here.
 */
export function parseSceneryCatalog(value: unknown): SceneryCatalog {
  const catalog = record(value, 'scenery catalog');
  orderedKeys(catalog, SCENERY_CATALOG_KEYS, 'scenery catalog');
  numbers(catalog.chunking, CHUNKING_KEYS, 'scenery catalog.chunking');
  numbers(catalog.streaming, STREAMING_KEYS, 'scenery catalog.streaming');
  const table = array(catalog.textures, 'scenery catalog.textures', MAX_TEXTURES).map((entry, i) => parseTextureEntry(entry, `scenery catalog.textures[${i}]`));
  table.forEach((entry, i) => { if (i > 0 && !(table[i - 1].sha256 < entry.sha256)) throw Error(`scenery catalog.textures: not sorted by sha256 without duplicates at entry ${i}`); });
  const layouts = array(catalog.layouts, 'scenery catalog.layouts', MAX_LAYOUTS);
  if (!layouts.length) throw Error('scenery catalog.layouts: empty');
  const used = new Set<number>();
  const rows = layouts.map((row, i) => parseLayoutRow(row, `scenery catalog.layouts[${i}]`, table, used));
  rows.forEach((row, i) => { if (i > 0 && !(rows[i - 1].layoutKey < row.layoutKey)) throw Error(`scenery catalog.layouts: not sorted by layoutKey without duplicates at ${row.layoutKey}`); });
  const unused = table.findIndex((_entry, i) => !used.has(i));
  if (unused >= 0) throw Error(`scenery catalog.textures: entry ${unused} (${table[unused].sha256}) is used by no layout`);
  return value as SceneryCatalog;
}

// ---- Compact <-> expanded -------------------------------------------------------------------------------------------------------------------------------

/** `value` without the keys in `omit`, in its own key order. */
const without = (value: Obj, omit: string[]): Obj => Object.fromEntries(Object.entries(value).filter(([key]) => !omit.includes(key)));

/** `value` with `asset` inserted right before `sha256` (where the layout index states it). */
function withAsset(value: Obj, asset: string): Obj {
  const out: Obj = {};
  for (const [key, entry] of Object.entries(value)) { if (key === 'sha256') out.asset = asset; out[key] = entry; }
  return out;
}

function shaOf(value: unknown, what: string): string {
  return sha256(record(value, what).sha256, `${what}.sha256`);
}

/** A texture or start file as the table states it: no `asset` (it is derived), and the path must be the derived one. */
function tableEntry(texture: Obj, what: string): Obj {
  const hash = shaOf(texture, what);
  if (texture.asset !== sceneryTexturePath(hash)) throw Error(`${what}: asset ${texture.asset} is not ${sceneryTexturePath(hash)}`);
  const entry = without(texture, ['asset', 'maxPx']);
  if (texture.start !== undefined && texture.start !== null && typeof texture.start === 'object') {
    const start = texture.start as Obj, startSha = shaOf(start, `${what} start`);
    if (start.asset !== sceneryTexturePath(startSha)) throw Error(`${what} start: asset ${start.asset} is not ${sceneryTexturePath(startSha)}`);
    entry.start = without(start, ['asset']);
  }
  return entry;
}

/**
 * Compacts expanded layout rows (chunk and texture rows with `asset`) into `{textures, layouts}`: one table of distinct texture files sorted by sha256;
 * per-row `textures` as `{texture, maxPx?}` in the row's order; chunks without `asset`, listing indices into their row's `textures`.
 * Throws when two layouts describe one texture differently (ignoring `maxPx`).
 */
export function compactSceneryLayouts(rows: Obj[]): {textures: Obj[]; layouts: Obj[]} {
  const described = new Map<string, Obj>();
  for (const row of rows) {
    if (!Array.isArray(row.textures)) throw Error(`${row.layoutKey}: layout row has no textures list`);
    for (const texture of row.textures) {
      const entry = tableEntry(texture, `${row.layoutKey} texture`), known = described.get(entry.sha256 as string);
      if (known && !sameJson(known, entry)) throw Error(`Scenery layouts describe texture ${entry.sha256} differently (${row.layoutKey})`);
      if (!known) described.set(entry.sha256 as string, entry);
    }
  }
  const textures = [...described.values()].sort((a, b) => ((a.sha256 as string) < (b.sha256 as string) ? -1 : 1));
  const index = new Map(textures.map((entry, i) => [entry.sha256 as string, i]));
  const layouts = rows.map(row => {
    const own = new Map<string, number>(), rowTextures = (row.textures as Obj[]).map((texture, i) => {
      own.set(texture.asset as string, i);
      return {texture: index.get(texture.sha256 as string), ...('maxPx' in texture ? {maxPx: texture.maxPx} : {})};
    });
    const chunk = (value: unknown, what: string): Obj => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Obj).textures)) throw Error(`${row.layoutKey}: ${what} is not a chunk row`);
      const source = value as Obj, hash = shaOf(source, `${row.layoutKey} ${what}`);
      if (source.asset !== sceneryChunkPath(hash)) throw Error(`${row.layoutKey} ${what}: asset ${source.asset} is not ${sceneryChunkPath(hash)}`);
      return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'asset').map(([key, entry]) => [key, key !== 'textures' ? entry :
        (entry as string[]).map(asset => {
          const found = own.get(asset);
          if (found === undefined) throw Error(`${row.layoutKey} ${what}: texture ${asset} is not in the layout texture list`);
          return found;
        })]));
    };
    if (!Array.isArray(row.sectors)) throw Error(`${row.layoutKey}: layout row has no sectors list`);
    return Object.fromEntries(Object.entries(row).map(([key, entry]) => [key,
      key === 'horizon' ? chunk(entry, 'horizon') : key === 'sectors' ? (row.sectors as unknown[]).map((sector, i) => chunk(sector, `sector ${i}`)) : key === 'textures' ? rowTextures : entry]));
  });
  return {textures, layouts};
}

function indexIn(value: unknown, length: number, what: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= length) throw Error(`${what}: index ${JSON.stringify(value)} is outside 0..${length - 1}`);
  return value as number;
}

/** The table entry as an expanded texture row: `asset` first, `start` in place (with its own `asset`). */
function textureRow(entry: Obj): Obj {
  const row = withAsset(entry, sceneryTexturePath(entry.sha256 as string));
  if (entry.start && typeof entry.start === 'object') row.start = withAsset(entry.start as Obj, sceneryTexturePath((entry.start as Obj).sha256 as string));
  return row;
}

/**
 * Expands a compact scenery catalog (`textures` table and `layouts`) to the layout rows with `asset` strings rebuilt, exactly as compactSceneryLayouts
 * received them. Throws on a malformed table, a non-hex sha256, an index outside its list or a table entry no layout uses.
 */
export function expandSceneryCatalog(catalog: {textures?: unknown; layouts?: unknown}): Obj[] {
  if (!Array.isArray(catalog.textures)) throw Error('The scenery catalog has no textures table');
  if (!Array.isArray(catalog.layouts)) throw Error('The scenery catalog has no layouts list');
  const table = catalog.textures as Obj[], used = new Set<number>();
  table.forEach((entry, i) => {
    record(entry, `Scenery texture table entry ${i}`);
    sha256(entry.sha256, `Scenery texture table entry ${i}.sha256`);
    if (entry.start !== undefined) sha256(record(entry.start, `Scenery texture table entry ${i} start`).sha256, `Scenery texture table entry ${i} start.sha256`);
  });
  const expanded = (catalog.layouts as Obj[]).map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !Array.isArray(row.textures)) throw Error(`Scenery layout ${(row as Obj | undefined)?.layoutKey}: no textures list`);
    const textures: Obj[] = (row.textures as Obj[]).map((ref, i): Obj => {
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw Error(`${row.layoutKey}: texture ${i} is not an object`);
      const at = indexIn(ref.texture, table.length, `${row.layoutKey} texture ${i}`);
      used.add(at);
      return {...textureRow(table[at]), ...('maxPx' in ref ? {maxPx: ref.maxPx} : {})};
    });
    const chunk = (value: unknown, what: string): Obj => {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Obj).textures)) throw Error(`${row.layoutKey}: ${what} is not a chunk row`);
      const source = value as Obj, hash = shaOf(source, `${row.layoutKey} ${what}`);
      return Object.fromEntries(Object.entries(withAsset(source, sceneryChunkPath(hash))).map(([key, entry]) => [key, key !== 'textures' ? entry :
        (entry as unknown[]).map(at => textures[indexIn(at, textures.length, `${row.layoutKey} ${what} texture`)].asset)]));
    };
    if (!Array.isArray(row.sectors)) throw Error(`${row.layoutKey}: layout row has no sectors list`);
    return Object.fromEntries(Object.entries(row).map(([key, entry]) => [key,
      key === 'horizon' ? chunk(entry, 'horizon') : key === 'sectors' ? (row.sectors as unknown[]).map((sector, i) => chunk(sector, `sector ${i}`)) : key === 'textures' ? textures : entry]));
  });
  const missing = table.findIndex((_entry, i) => !used.has(i));
  if (missing >= 0) throw Error(`Scenery texture table entry ${missing} (${table[missing].sha256}) is used by no layout`);
  return expanded;
}
