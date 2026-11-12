// Copied from LMUTrackPipeline/shared/contract/tracks.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The track files of a package (docs/PACKAGE_FORMAT.md, Tracks): `tracks/index.json` (a layout catalog) and `tracks/<layoutKey>.json` (the geometry, map
 * surfaces and brake markers of one layout), their types and structural parsers. All coordinates are LMU local metres.
 *
 * Not checked here, because they need a hash: `projectionRevision` and `geometryRevision` are `projection-`/`geometry-` + sha256 of the JSON named in the
 * format document; the pipeline writes them and the app recomputes them (`server/plugins/trackPackage.ts`). Which layouts exist (`circuitDefinitions.ts`)
 * is a domain table, not part of the package shape.
 */
import {LAYOUT_KEY} from './paths.js';
import {exactKeys, knownKeys, record, text} from './strict.js';

export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

export interface TrackTimingGates {
  startFinish: TimingGateGeometry;
  sector1?: TimingGateGeometry;
  sector2?: TimingGateGeometry;
}

/** Each polygon contains an exterior ring followed by any holes, in local x/z meters. */
export type TrackSurfacePolygon = Array<Array<[number, number]>>;

export interface TrackMapSurfaces {
  road: TrackSurfacePolygon[];
  kerb: TrackSurfacePolygon[];
  /** Named anti-cut/sausage kerbs, drawn over the combined kerb layer. */
  raisedKerb?: TrackSurfacePolygon[];
  /** Kerbs belonging to other roads, outside `kerb`; shown with other roads. */
  otherRoadKerb?: TrackSurfacePolygon[];
  runoff: TrackSurfacePolygon[];
  apron?: TrackSurfacePolygon[];
  gravel?: TrackSurfacePolygon[];
  grass?: TrackSurfacePolygon[];
  pit?: TrackSurfacePolygon[];
  otherRoad?: TrackSurfacePolygon[];
}

/** A decoded individual roadside board of the 2D map; display only. Its printed distance never determines its position. */
export interface TrackBrakeMarker {
  id: string;
  center: [number, number];
  label?: string;
  stationM: number;
  side: 'left' | 'right';
  normal?: [number, number];
  /** Native height of the board's bottom edge, when the game's board bounds are known. */
  baseY?: number;
}

/** Map display layers published inside the layout file; the geometry revision does not cover them. */
export interface TrackMapDisplay {
  surfaces: TrackMapSurfaces;
  brakeMarkers: TrackBrakeMarker[];
}

/** Actual native surface measurements; unavailable measurements remain null. */
export interface TrackSurfaceProfileColumns {
  leftWidthM: Array<number | null>;
  rightWidthM: Array<number | null>;
  elevationM: Array<number | null>;
  gradePct: Array<number | null>;
  /** Positive banking means the left edge is higher than the right edge. */
  bankDeg: Array<number | null>;
  leftElevationM: Array<number | null>;
  rightElevationM: Array<number | null>;
  leftKerbWidthM: Array<number | null>;
  rightKerbWidthM: Array<number | null>;
  leftKerbHeightM: Array<number | null>;
  rightKerbHeightM: Array<number | null>;
}

/** The game's own kerb surface: flat rumble strip, raised sawtooth (razor) kerb, or another kerb surface. */
export type TrackKerbType = 'flat' | 'sawtooth' | 'other';

/** Kerb type at each station (null where that side has no kerb). */
export interface TrackKerbTypeColumns {
  leftKerbType?: Array<TrackKerbType | null>;
  rightKerbType?: Array<TrackKerbType | null>;
}

export interface TrackSurfaceProfile extends TrackSurfaceProfileColumns, TrackKerbTypeColumns {
  /** Ascending centerline stations: first is zero and last is strictly below lengthM. */
  stationM: number[];
}

export interface TrackPitStall { id: number; center: [number, number]; widthM: number; angleDeg?: number }
export interface TrackGridSlot { slot: number; center: [number, number] }

/** One row of `tracks/index.json`. */
export interface TrackCatalogRow {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  hasElevation: boolean;
  hasPitLane: boolean;
}

/** The layout file `tracks/<layoutKey>.json`: the public track fields, surfaces and brake markers included. */
export interface TrackBoundaryGeometry {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  lengthM: number;
  bounds: {minX: number; maxX: number; minZ: number; maxZ: number; spanX: number; spanZ: number};
  leftBoundary: Array<[number, number]>;
  rightBoundary: Array<[number, number]>;
  centerline: Array<[number, number]>;
  nominalWidthM?: number;
  startFinish?: [number, number];
  timingGates?: TrackTimingGates;
  pitLane?: {centerline: Array<[number, number]>; elevation?: number[]};
  pitStalls?: TrackPitStall[];
  gridSlots?: TrackGridSlot[];
  surfaceProfile?: TrackSurfaceProfile;
  /** `projection-<sha256>` over `JSON.stringify({centerline, timingGates})`. */
  projectionRevision: string;
  /** Map display surfaces; timing and lap projection use the centerline. Not part of `geometryRevision`. */
  surfaces: TrackMapSurfaces;
  /** Brake-board markers of the 2D map. Not part of `geometryRevision`. */
  brakeMarkers: TrackBrakeMarker[];
  /** `geometry-<sha256>` over the geometry keys `layoutKey` through `surfaceProfile` and `projectionRevision`. */
  geometryRevision: string;
}

export const TRACK_CATALOG_KEYS = ['layoutKey', 'circuitId', 'layoutId', 'trackVenue', 'trackCourse', 'hasElevation', 'hasPitLane'] as const;
/** The keys of a layout file in the order they are written; the ones outside REQUIRED_LAYOUT_KEYS are optional. */
export const TRACK_LAYOUT_KEYS = ['layoutKey', 'circuitId', 'layoutId', 'trackVenue', 'trackCourse', 'lengthM', 'bounds', 'leftBoundary', 'rightBoundary', 'centerline',
  'nominalWidthM', 'startFinish', 'timingGates', 'pitLane', 'pitStalls', 'gridSlots', 'surfaceProfile', 'projectionRevision', 'surfaces', 'brakeMarkers', 'geometryRevision'] as const;
const REQUIRED_LAYOUT_KEYS = ['layoutKey', 'circuitId', 'layoutId', 'trackVenue', 'trackCourse', 'lengthM', 'bounds', 'leftBoundary', 'rightBoundary', 'centerline',
  'projectionRevision', 'surfaces', 'brakeMarkers', 'geometryRevision'];
/** The keys `geometryRevision` hashes (with `projectionRevision` after them). */
export const TRACK_GEOMETRY_KEYS: readonly string[] = TRACK_LAYOUT_KEYS.slice(0, TRACK_LAYOUT_KEYS.indexOf('surfaceProfile') + 1);

const MAX_COORDINATE_M = 1_000_000;
const MAX_ARRAY_ITEMS = 500_000;
const MAX_TOTAL_ITEMS = 2_000_000;
const PROFILE_COLUMNS = ['leftWidthM', 'rightWidthM', 'elevationM', 'gradePct', 'bankDeg', 'leftElevationM', 'rightElevationM', 'leftKerbWidthM', 'rightKerbWidthM',
  'leftKerbHeightM', 'rightKerbHeightM'] as const;
const KERB_TYPE_COLUMNS = ['leftKerbType', 'rightKerbType'] as const;
const KERB_TYPES: readonly unknown[] = ['flat', 'sawtooth', 'other'];
const REQUIRED_SURFACES = ['road', 'kerb', 'runoff'] as const;
const OPTIONAL_SURFACES = ['apron', 'gravel', 'grass', 'raisedKerb', 'otherRoadKerb', 'pit', 'otherRoad'] as const;

/** `tracks/index.json`: layout rows sorted by `layoutKey`, unique, with exact keys. */
export function parseTrackCatalog(value: unknown): TrackCatalogRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('track catalog: expected 1 to 100 layouts');
  const rows = value.map((item, i): TrackCatalogRow => {
    const at = `track catalog[${i}]`, row = record(item, at);
    exactKeys(row, TRACK_CATALOG_KEYS, at);
    const layoutKey = text(row.layoutKey, `${at}.layoutKey`);
    if (!LAYOUT_KEY.test(layoutKey)) throw Error(`${at}.layoutKey: invalid layout identity`);
    for (const key of ['hasElevation', 'hasPitLane']) if (typeof row[key] !== 'boolean') throw Error(`${at}.${key}: expected true or false`);
    // The venue and course names may be empty strings; the identity ids may not.
    for (const key of ['trackVenue', 'trackCourse']) if (typeof row[key] !== 'string' || (row[key] as string).length > 512) throw Error(`${at}.${key}: expected a string`);
    return {layoutKey, circuitId: text(row.circuitId, `${at}.circuitId`, 160), layoutId: text(row.layoutId, `${at}.layoutId`, 160), trackVenue: row.trackVenue as string,
      trackCourse: row.trackCourse as string, hasElevation: row.hasElevation as boolean, hasPitLane: row.hasPitLane as boolean};
  });
  rows.forEach((row, i) => {
    if (i > 0 && !(rows[i - 1].layoutKey < row.layoutKey)) throw Error(`track catalog: layouts are not sorted by layoutKey without duplicates at ${row.layoutKey}`);
  });
  return rows;
}

function invalid(path: string): never {
  throw Error(`Invalid track geometry: ${path}`);
}

function bounded(value: unknown, path: string, min = -MAX_COORDINATE_M, max = MAX_COORDINATE_M): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path);
  return value;
}

/**
 * Validates bounded local-metre geometry and the display layers of one layout file: exact key set (the published fields only) in the published order, the
 * measurement columns, the surfaces and brake markers, and a route that is a real closed centerline of the stated length (within 1 cm). Returns the value typed.
 */
export function parseTrackLayout(value: unknown, expectedLayoutKey?: string): TrackBoundaryGeometry {
  const geometry = record(value, 'track layout');
  knownKeys(geometry, REQUIRED_LAYOUT_KEYS, TRACK_LAYOUT_KEYS, 'track layout');
  const present = TRACK_LAYOUT_KEYS.filter(key => geometry[key] !== undefined);
  if (JSON.stringify(Object.keys(geometry)) !== JSON.stringify(present)) throw Error('track layout: fields are not in the published order');
  for (const key of ['layoutKey', 'circuitId', 'layoutId']) if (typeof geometry[key] !== 'string' || !(geometry[key] as string).trim() || (geometry[key] as string).length > 512) invalid(key);
  for (const key of ['trackVenue', 'trackCourse']) if (typeof geometry[key] !== 'string' || (geometry[key] as string).length > 512) invalid(key);
  if (!LAYOUT_KEY.test(geometry.layoutKey as string)) invalid('layoutKey');
  if (expectedLayoutKey !== undefined && geometry.layoutKey !== expectedLayoutKey) invalid('layoutKey mismatch');
  const lengthM = bounded(geometry.lengthM, 'lengthM', Number.MIN_VALUE);
  let totalItems = 0;
  const list = (candidate: unknown, path: string, minItems = 0): unknown[] => {
    if (!Array.isArray(candidate) || candidate.length < minItems || candidate.length > MAX_ARRAY_ITEMS) invalid(path);
    totalItems += candidate.length;
    if (totalItems > MAX_TOTAL_ITEMS) invalid('total array size');
    for (let index = 0; index < candidate.length; index++) if (!(index in candidate)) invalid(`${path}[${index}] missing`);
    return candidate;
  };
  const pair = (candidate: unknown, path: string): void => {
    const coordinates = list(candidate, path, 2);
    if (coordinates.length !== 2) invalid(path);
    bounded(coordinates[0], `${path}[0]`);
    bounded(coordinates[1], `${path}[1]`);
  };
  const pairs = (candidate: unknown, path: string, minItems = 1): unknown[] => {
    const points = list(candidate, path, minItems);
    points.forEach((point, index) => pair(point, `${path}[${index}]`));
    return points;
  };
  const bounds = record(geometry.bounds, 'bounds');
  exactKeys(bounds, ['minX', 'maxX', 'minZ', 'maxZ', 'spanX', 'spanZ'], 'bounds');
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) bounded(bounds[key], `bounds.${key}`);
  for (const key of ['spanX', 'spanZ']) bounded(bounds[key], `bounds.${key}`, 0, 2 * MAX_COORDINATE_M);
  if (Number(bounds.minX) > Number(bounds.maxX) || Number(bounds.minZ) > Number(bounds.maxZ)) invalid('bounds order');
  pairs(geometry.leftBoundary, 'leftBoundary');
  pairs(geometry.rightBoundary, 'rightBoundary');
  const centerline = pairs(geometry.centerline, 'centerline', 3) as Array<[number, number]>;
  if (geometry.nominalWidthM !== undefined) bounded(geometry.nominalWidthM, 'nominalWidthM', 0, 1_000);
  if (geometry.startFinish !== undefined) pair(geometry.startFinish, 'startFinish');

  // Map surfaces and brake markers are display data with their own size budget, apart from the geometry's.
  const geometryItems = totalItems;
  totalItems = 0;
  const surfaces = record(geometry.surfaces, 'surfaces');
  knownKeys(surfaces, REQUIRED_SURFACES, OPTIONAL_SURFACES, 'surfaces');
  for (const key of [...REQUIRED_SURFACES, ...OPTIONAL_SURFACES]) {
    if (surfaces[key] === undefined) continue;
    list(surfaces[key], `surfaces.${key}`).forEach((polygon, index) => {
      const path = `surfaces.${key}[${index}]`;
      list(polygon, path, 1).forEach((ring, ringIndex) => pairs(ring, `${path}[${ringIndex}]`, 3));
    });
  }
  list(geometry.brakeMarkers, 'brakeMarkers').forEach((candidate, index) => {
    const path = `brakeMarkers[${index}]`, marker = record(candidate, path);
    knownKeys(marker, ['id', 'center', 'stationM', 'side'], ['label', 'normal', 'baseY'], path);
    text(marker.id, `${path}.id`, 512);
    if (marker.label !== undefined) text(marker.label, `${path}.label`, 512);
    pair(marker.center, `${path}.center`);
    bounded(marker.stationM, `${path}.stationM`, 0);
    if (marker.side !== 'left' && marker.side !== 'right') invalid(`${path}.side`);
    if (marker.normal !== undefined) pair(marker.normal, `${path}.normal`);
    if (marker.baseY !== undefined) bounded(marker.baseY, `${path}.baseY`);
  });
  totalItems = geometryItems;
  if (geometry.timingGates !== undefined) {
    const gates = record(geometry.timingGates, 'timingGates');
    knownKeys(gates, ['startFinish'], ['sector1', 'sector2'], 'timingGates');
    for (const key of ['startFinish', 'sector1', 'sector2']) {
      if (gates[key] === undefined) continue;
      const path = `timingGates.${key}`, gate = record(gates[key], path);
      exactKeys(gate, ['name', 'center', 'left', 'right', 'stationM'], path);
      text(gate.name, `${path}.name`, 512);
      for (const point of ['center', 'left', 'right']) pair(gate[point], `${path}.${point}`);
      bounded(gate.stationM, `${path}.stationM`, 0, lengthM);
    }
  }
  if (geometry.pitLane !== undefined) {
    const pitLane = record(geometry.pitLane, 'pitLane');
    knownKeys(pitLane, ['centerline'], ['elevation'], 'pitLane');
    const pitPoints = pairs(pitLane.centerline, 'pitLane.centerline');
    if (pitLane.elevation !== undefined) {
      const values = list(pitLane.elevation, 'pitLane.elevation');
      if (values.length !== pitPoints.length) invalid('pitLane.elevation length');
      values.forEach((number, index) => bounded(number, `pitLane.elevation[${index}]`));
    }
  }
  for (const key of ['pitStalls', 'gridSlots'] as const) {
    if (geometry[key] === undefined) continue;
    list(geometry[key], key).forEach((candidate, index) => {
      const path = `${key}[${index}]`, entry = record(candidate, path), id = key === 'pitStalls' ? 'id' : 'slot';
      if (key === 'pitStalls') knownKeys(entry, ['id', 'center', 'widthM'], ['angleDeg'], path); else exactKeys(entry, ['slot', 'center'], path);
      pair(entry.center, `${path}.center`);
      if (!Number.isInteger(bounded(entry[id], `${path}.${id}`, 0))) invalid(`${path}.${id}`);
      if (key === 'pitStalls') {
        bounded(entry.widthM, `${path}.widthM`, 0, 1_000);
        if (entry.angleDeg !== undefined) bounded(entry.angleDeg, `${path}.angleDeg`, -360, 360);
      }
    });
  }
  text(geometry.geometryRevision, 'geometryRevision');
  text(geometry.projectionRevision, 'projectionRevision');
  if (geometry.surfaceProfile !== undefined) {
    const profile = record(geometry.surfaceProfile, 'surfaceProfile');
    knownKeys(profile, ['stationM', ...PROFILE_COLUMNS], KERB_TYPE_COLUMNS, 'surfaceProfile');
    const stations = list(profile.stationM, 'surfaceProfile.stationM', 2);
    let previous = -1;
    stations.forEach((station, index) => {
      const measured = bounded(station, `surfaceProfile.stationM[${index}]`, 0, lengthM);
      if ((index === 0 && measured !== 0) || measured <= previous || measured >= lengthM) invalid('surfaceProfile station order');
      previous = measured;
    });
    for (const key of PROFILE_COLUMNS) {
      const column = list(profile[key], `surfaceProfile.${key}`);
      if (column.length !== stations.length) invalid(`surfaceProfile.${key} length`);
      column.forEach((measurement, index) => {
        if (measurement === null) return;
        const path = `surfaceProfile.${key}[${index}]`;
        if (key.endsWith('WidthM')) bounded(measurement, path, 0, 1_000);
        else if (key === 'bankDeg') bounded(measurement, path, -90, 90);
        else if (key === 'gradePct') bounded(measurement, path, -1_000, 1_000);
        else bounded(measurement, path);
      });
    }
    for (const key of KERB_TYPE_COLUMNS) {
      if (profile[key] === undefined) continue;
      const column = list(profile[key], `surfaceProfile.${key}`);
      if (column.length !== stations.length) invalid(`surfaceProfile.${key} length`);
      column.forEach((kind, index) => { if (kind !== null && !KERB_TYPES.includes(kind)) invalid(`surfaceProfile.${key}[${index}]`); });
    }
  }
  // A real closed route of the stated length: allows centimetre publication rounding without accepting a different station frame.
  if (new Set(centerline.map(p => p.join(','))).size < 3) throw Error('Degenerate route');
  let measuredLength = 0;
  for (let i = 0; i < centerline.length; i++) {
    const a = centerline[i], b = centerline[(i + 1) % centerline.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) throw Error('Degenerate route segment');
    measuredLength += length;
  }
  if (!Number.isFinite(measuredLength) || Math.abs(measuredLength - lengthM) > 0.01) throw Error('Route length mismatch');
  return value as TrackBoundaryGeometry;
}
