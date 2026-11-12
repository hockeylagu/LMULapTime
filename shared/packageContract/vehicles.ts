// Copied from LMUTrackPipeline/shared/contract/vehicles.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The vehicle files of a package (docs/PACKAGE_FORMAT.md, Vehicles): `vehicles/index.json` (`{vehicles, bodies}`) and `vehicles/logos.json`. A *vehicle* is a
 * catalog record; a *body* is a 3D model that serves the ids of one or more records. The catalog states no file path (paths.ts derives them).
 */
import {BODY_FOLDER} from './paths.js';
import type {Obj} from './strict.js';
import type {TextureStart} from './textures.js';
import {parseTextureStart} from './textures.js';
import {array, exactKeys, finite, knownKeys, orderedKeys, positiveCount, record, sha256, sortedUnique, text} from './strict.js';

/** Base physics defaults, not the setup or upgrade selected for a recorded lap. */
export interface VehicleHandlingData {
  wheelbaseM?: number;
  steeringRatio?: number;
  defaultSteeringWheelRangeDeg?: number;
  defaultSteeringLockDeg?: number;
}

export interface VehicleRecord {
  id: string;
  model: string;
  carClass: string;
  /** Upper-case VEH ids; each id belongs to exactly one record. */
  vehicleIds: string[];
  dimensions?: {lengthM: number; widthM: number; heightM?: number};
  handling?: VehicleHandlingData;
  /** Metres in vehicle-local X/Z; native forward is -Z. Origin is never recentered. */
  outlineXZ?: Array<[number, number]>;
  /** Translation from mesh-local to replay pose origin, established by the data provider. */
  replayOriginOffsetXZ?: [number, number];
  /** Hybrid deployment settings in kW as the game's MFD labels them, ascending. */
  deploymentKw?: number[];
}

/** A content-named GLB of a body with its size and counts. */
export interface VehicleBodyModel {sha256: string; byteLength: number; triangles: number; vertices: number}

export interface VehicleBodyTexture {
  sha256: string;
  byteLength: number;
  /** True when only the interior GLB's materials use the texture. */
  interiorOnly?: true;
  start?: TextureStart;
}

/** One 3D body of the catalog. */
export interface VehicleBody extends VehicleBodyModel {
  /** The installed vehicle folder, or `<folder>.<hash>` for a further geometry of that folder. Unique. */
  folder: string;
  /** Sorted, duplicate-free, upper-case list of every vehicle id the body serves, across records. */
  vehicleIds: string[];
  /** SHA-256 of the descriptor file. */
  descriptorSha256: string;
  /** The driver-camera-only GLB; null when the body has no such part. */
  interior: VehicleBodyModel | null;
  /** Every texture the body uses, sorted by `sha256`. */
  textures: VehicleBodyTexture[];
}

/** `vehicles/index.json`. */
export interface VehicleCatalog {vehicles: VehicleRecord[]; bodies: VehicleBody[]}
/** The catalog during a build, before the bodies are assembled (`bodies` absent) or while a rebuild leaves ids without a body. */
export interface VehicleBuildCatalog {vehicles: VehicleRecord[]; bodies?: VehicleBody[]}

export const VEHICLE_CATALOG_KEYS = ['vehicles', 'bodies'] as const;
const RECORD_KEYS = ['id', 'model', 'carClass', 'vehicleIds', 'dimensions', 'handling', 'deploymentKw', 'outlineXZ', 'replayOriginOffsetXZ'];
const BODY_KEYS = ['folder', 'vehicleIds', 'descriptorSha256', 'sha256', 'byteLength', 'triangles', 'vertices', 'interior', 'textures'];
const MAX_RECORDS = 2000, MAX_BODIES = 256, MAX_IDS = 5000, MAX_TEXTURES = 4096;

/** A VEH id as the records and the game write it: any case, with or without `.veh`; the canonical form is upper case without it. */
export const normalizeVehicleId = (id: string): string => id.trim().replace(/\.veh$/i, '').toUpperCase();

function parseModel(value: unknown, what: string, keys: string[]): void {
  const model = record(value, what);
  exactKeys(model, keys, what);
  sha256(model.sha256, `${what}.sha256`);
  for (const key of ['byteLength', 'triangles', 'vertices']) positiveCount(model[key], `${what}.${key}`);
}

function parseBody(value: unknown, what: string): VehicleBody {
  const body = record(value, what);
  exactKeys(body, BODY_KEYS, what);
  const folder = text(body.folder, `${what}.folder`, 120);
  if (!BODY_FOLDER.test(folder)) throw Error(`${what}.folder: invalid vehicle body folder`);
  const ids = array(body.vehicleIds, `${what}.vehicleIds`, MAX_IDS).map((id, i) => text(id, `${what}.vehicleIds[${i}]`, 160));
  if (!ids.length || ids.some(id => !/^[A-Z0-9_-]+$/.test(id))) throw Error(`${what}.vehicleIds: expected a list of upper-case vehicle ids`);
  sha256(body.descriptorSha256, `${what}.descriptorSha256`);
  parseModel(body, what, BODY_KEYS);
  if (body.interior !== null) parseModel(body.interior, `${what}.interior`, ['sha256', 'byteLength', 'triangles', 'vertices']);
  const textures = array(body.textures, `${what}.textures`, MAX_TEXTURES).map((item, i) => {
    const at = `${what}.textures[${i}]`, texture = record(item, at);
    knownKeys(texture, ['sha256', 'byteLength'], ['interiorOnly', 'start'], at);
    sha256(texture.sha256, `${at}.sha256`);
    positiveCount(texture.byteLength, `${at}.byteLength`);
    if (texture.interiorOnly !== undefined && texture.interiorOnly !== true) throw Error(`${at}.interiorOnly: expected true`);
    if (texture.start !== undefined) parseTextureStart(texture.start, `${at}.start`);
    return texture.sha256 as string;
  });
  sortedUnique(textures, `${what}.textures (by sha256)`);
  return value as VehicleBody;
}

/**
 * Problems with how the catalog's bodies serve the records' vehicle ids: bodies sorted by folder with unique folders and sorted unique
 * upper-case ids, every record id in exactly one body, every body id an id of exactly one record (ids are unique across records, which
 * `parseVehicleCatalog` checks). A body may serve ids of several records. `partial` tolerates ids without a body (a `--cars` rebuild) but nothing else.
 */
export function vehicleBodyProblems(catalog: VehicleBuildCatalog, {partial = false}: {partial?: boolean} = {}): string[] {
  const problems: string[] = [], bodies = catalog.bodies;
  if (!Array.isArray(bodies)) return ['The catalog has no bodies list'];
  const recordOf = new Map<string, string>(), owner = new Map<string, string>(), folders = new Set<string>();
  for (const vehicle of catalog.vehicles) for (const id of vehicle.vehicleIds) recordOf.set(id, vehicle.id);
  bodies.forEach((body, index) => {
    if (folders.has(body.folder)) problems.push(`body ${body.folder} is listed twice`);
    folders.add(body.folder);
    if (index > 0 && !(bodies[index - 1].folder < body.folder)) problems.push(`bodies are not sorted by folder at ${body.folder}`);
    if (JSON.stringify(body.vehicleIds) !== JSON.stringify([...new Set(body.vehicleIds.map(id => id.toUpperCase()))].sort())) problems.push(`body ${body.folder}: vehicleIds are not sorted, unique and upper-case`);
    for (const id of body.vehicleIds) {
      if (!recordOf.has(id)) problems.push(`body ${body.folder} names ${id}, which belongs to no record`);
      if (owner.has(id)) problems.push(`${id} is in bodies ${owner.get(id)} and ${body.folder}`);
      else owner.set(id, body.folder);
    }
  });
  if (!partial) for (const [id, vehicle] of recordOf) if (!owner.has(id)) problems.push(`${vehicle}: ${id} has no body`);
  return problems;
}

function parseRecord(item: unknown, at: string, ids: Set<string>, aliases: Set<string>): void {
  const row = record(item, at);
  knownKeys(row, RECORD_KEYS.slice(0, 4), RECORD_KEYS.slice(4), at);
  const id = text(row.id, `${at}.id`, 160);
  text(row.model, `${at}.model`, 160);
  text(row.carClass, `${at}.carClass`, 160);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw Error(`${at}: Invalid vehicle identity (${id})`);
  ids.add(id);
  for (const alias of array(row.vehicleIds, `${at}.vehicleIds`, MAX_IDS)) {
    const normalized = normalizeVehicleId(text(alias, `${at}.vehicleIds`, 160));
    if (!/^[A-Z0-9_-]+$/.test(normalized) || aliases.has(normalized)) throw Error(`${at}.vehicleIds: Conflicting vehicle alias ${normalized}`);
    aliases.add(normalized);
  }
  const pair = (v: unknown, what: string): [number, number] => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)) throw Error(`${what}: expected two coordinates within 10 m`);
    return v as [number, number];
  };
  let dimensions: {lengthM: number; widthM: number} | undefined;
  if (row.dimensions !== undefined) {
    const d = record(row.dimensions, `${at}.dimensions`);
    knownKeys(d, ['lengthM', 'widthM'], ['heightM'], `${at}.dimensions`);
    if (!(finite(d.lengthM, `${at}.dimensions.lengthM`) >= 3 && (d.lengthM as number) <= 7) || !(finite(d.widthM, `${at}.dimensions.widthM`) >= 1 && (d.widthM as number) <= 3)
      || (d.heightM !== undefined && !(finite(d.heightM, `${at}.dimensions.heightM`) >= 0.3 && (d.heightM as number) <= 3))) throw Error(`${at}.dimensions: Invalid vehicle dimensions`);
    dimensions = {lengthM: d.lengthM as number, widthM: d.widthM as number};
  }
  if (row.handling !== undefined) {
    const h = record(row.handling, `${at}.handling`);
    knownKeys(h, [], ['wheelbaseM', 'steeringRatio', 'defaultSteeringWheelRangeDeg', 'defaultSteeringLockDeg'], `${at}.handling`);
    const bounds: Record<string, number[]> = {wheelbaseM: [1.5, 4], steeringRatio: [3, 40], defaultSteeringWheelRangeDeg: [90, 1440], defaultSteeringLockDeg: [2, 60]};
    if (!Object.keys(h).length) throw Error(`${at}.handling: Empty handling data`);
    for (const [key, value] of Object.entries(h)) if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[key][0] || value > bounds[key][1]) throw Error(`${at}.handling.${key}: Invalid handling data`);
    const steering = [h.steeringRatio, h.defaultSteeringWheelRangeDeg, h.defaultSteeringLockDeg];
    if (steering.some(v => v !== undefined) && !steering.every(v => typeof v === 'number')) throw Error(`${at}.handling: Incomplete steering data`);
    if (h.steeringRatio !== undefined && Math.abs((h.defaultSteeringWheelRangeDeg as number) / (2 * (h.defaultSteeringLockDeg as number)) - (h.steeringRatio as number)) > 0.01) throw Error(`${at}.handling: Inconsistent steering data`);
  }
  // The MFD's deployment labels in kW, ascending, one per motor map position.
  if (row.deploymentKw !== undefined) {
    const kw = row.deploymentKw;
    if (!Array.isArray(kw) || kw.length < 2 || kw.length > 40 || kw.some((v, i) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 500 || (i > 0 && v <= (kw[i - 1] as number)))) throw Error(`${at}.deploymentKw: Invalid deployment map`);
  }
  if (row.replayOriginOffsetXZ !== undefined) pair(row.replayOriginOffsetXZ, `${at}.replayOriginOffsetXZ`);
  if (row.outlineXZ !== undefined) {
    if (!dimensions || !Array.isArray(row.outlineXZ) || row.outlineXZ.length < 3 || row.outlineXZ.length > 256) throw Error(`${at}.outlineXZ: Invalid vehicle outline`);
    const outline = row.outlineXZ.map((p, i) => pair(p, `${at}.outlineXZ[${i}]`));
    if (outline.length > 3 && outline[0].every((n, i) => n === outline[outline.length - 1][i])) outline.pop();
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    if (Math.abs(Math.max(...xs) - Math.min(...xs) - dimensions.widthM) > 0.02 || Math.abs(Math.max(...zs) - Math.min(...zs) - dimensions.lengthM) > 0.02
      || new Set(outline.map(p => p.join(','))).size !== outline.length) throw Error(`${at}.outlineXZ: Outline dimensions disagree`);
    // A convex collision envelope: every point on one side of every edge.
    let sign = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      for (const c of outline) {
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(cross) > 1e-8) { if (sign && sign !== Math.sign(cross)) throw Error(`${at}.outlineXZ: Outline must be convex`); sign = Math.sign(cross); }
      }
    }
    if (!sign) throw Error(`${at}.outlineXZ: Degenerate vehicle outline`);
  }
}

function parseRecords(catalog: Obj): void {
  const records = array(catalog.vehicles, 'vehicle catalog.vehicles', MAX_RECORDS), ids = new Set<string>(), aliases = new Set<string>();
  records.forEach((item, i) => parseRecord(item, `vehicles[${i}]`, ids, aliases));
}

/**
 * `vehicles/index.json`. The package form (`bodies: 'required'`, the default) is exactly `{vehicles, bodies}` in that order, with the bodies serving every record
 * id exactly once. A build (`bodies: 'optional'`) may still lack `bodies`; present ones are checked for shape and order, and how they serve the ids is left to
 * `vehicleBodyProblems`. Returns the value typed (unchanged).
 */
export function parseVehicleCatalog(value: unknown, {bodies = 'required'}: {bodies?: 'required' | 'optional'} = {}): VehicleCatalog {
  const catalog = record(value, 'vehicle catalog');
  if (bodies === 'required') orderedKeys(catalog, VEHICLE_CATALOG_KEYS, 'vehicle catalog'); else knownKeys(catalog, ['vehicles'], ['bodies'], 'vehicle catalog');
  parseRecords(catalog);
  if (catalog.bodies !== undefined) {
    array(catalog.bodies, 'vehicle catalog.bodies', MAX_BODIES).forEach((body, i) => parseBody(body, `bodies[${i}]`));
    if (bodies === 'required') {
      const problems = vehicleBodyProblems(catalog as unknown as VehicleCatalog);
      if (problems.length) throw Error(`vehicle catalog: bodies do not serve the vehicle ids exactly once: ${problems.slice(0, 5).join('; ')}`);
    }
  }
  return value as VehicleCatalog;
}

export interface VehicleLogos {logos: Record<string, string>}

/** `vehicles/logos.json`: `{logos}` of brand name to SVG text. A bad entry is an error here; a reader that treats logos as cosmetic may catch it. */
export function parseLogos(value: unknown): VehicleLogos {
  const payload = record(value, 'vehicle logos');
  exactKeys(payload, ['logos'], 'vehicle logos');
  const logos: Record<string, string> = {};
  for (const [key, svg] of Object.entries(record(payload.logos, 'vehicle logos.logos'))) {
    if (!text(key, 'logo brand', 160) || !/^[a-zA-Z0-9_ -]+$/.test(key) || typeof svg !== 'string') throw Error(`vehicle logos.${key}: Invalid logo brand identity`);
    const trimmed = svg.trim();
    if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>') || !trimmed.includes('viewBox') || trimmed.length > 2_000_000) throw Error(`vehicle logos.${key}: Invalid logo SVG content`);
    logos[key] = trimmed;
  }
  return {logos};
}
