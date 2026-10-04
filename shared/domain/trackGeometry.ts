import type {
  TrackBoundaryGeometry,
  TrackKerbType,
  TrackMapDisplay,
  TrackRoadEdgeDistances,
  TrackSurfaceProfileColumns,
  TrackSurfaceProfileSample,
} from '../types/trackGeometry.js';

const MAX_COORDINATE_M = 1_000_000;
const MAX_ARRAY_ITEMS = 500_000;
const MAX_TOTAL_ITEMS = 2_000_000;
const PROFILE_COLUMNS = [
  'leftWidthM', 'rightWidthM', 'elevationM', 'gradePct', 'bankDeg',
  'leftElevationM', 'rightElevationM', 'leftKerbWidthM', 'rightKerbWidthM',
  'leftKerbHeightM', 'rightKerbHeightM',
] as const satisfies readonly (keyof TrackSurfaceProfileColumns)[];
const KERB_TYPE_COLUMNS = ['leftKerbType', 'rightKerbType'] as const;
const KERB_TYPES: readonly TrackKerbType[] = ['flat', 'sawtooth', 'other'];

function invalid(path: string): never {
  throw new Error(`Invalid track geometry: ${path}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}

function finite(value: unknown, path: string, min = -MAX_COORDINATE_M, max = MAX_COORDINATE_M): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path);
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): void {
  if (typeof value !== 'string' || value.length > 512 || (!allowEmpty && !value.trim())) invalid(path);
}

/** Validates bounded local-meter geometry and its optional native measurements without changing legacy data. */
export function parseTrackBoundaryGeometry(value: unknown, expectedLayoutKey?: string): TrackBoundaryGeometry {
  const geometry = object(value, 'root');
  for (const key of ['layoutKey', 'circuitId', 'layoutId', 'trackVenue', 'trackCourse']) {
    text(geometry[key], key, key === 'trackVenue' || key === 'trackCourse');
  }
  if (expectedLayoutKey !== undefined && geometry.layoutKey !== expectedLayoutKey) invalid('layoutKey mismatch');
  const lengthM = finite(geometry.lengthM, 'lengthM', Number.MIN_VALUE);
  let totalItems = 0;
  const array = (candidate: unknown, path: string, minItems = 0): unknown[] => {
    if (!Array.isArray(candidate) || candidate.length < minItems || candidate.length > MAX_ARRAY_ITEMS) invalid(path);
    totalItems += candidate.length;
    if (totalItems > MAX_TOTAL_ITEMS) invalid('total array size');
    for (let index = 0; index < candidate.length; index++) {
      if (!(index in candidate)) invalid(`${path}[${index}] missing`);
    }
    return candidate;
  };
  const pair = (candidate: unknown, path: string): void => {
    const coordinates = array(candidate, path, 2);
    if (coordinates.length !== 2) invalid(path);
    finite(coordinates[0], `${path}[0]`);
    finite(coordinates[1], `${path}[1]`);
  };
  const pairs = (candidate: unknown, path: string, minItems = 1): unknown[] => {
    const points = array(candidate, path, minItems);
    points.forEach((point, index) => pair(point, `${path}[${index}]`));
    return points;
  };
  const numbers = (candidate: unknown, path: string, expectedSize: number): void => {
    const values = array(candidate, path);
    if (values.length !== expectedSize) invalid(`${path} length`);
    values.forEach((number, index) => finite(number, `${path}[${index}]`));
  };
  const bounds = object(geometry.bounds, 'bounds');
  for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) finite(bounds[key], `bounds.${key}`);
  for (const key of ['spanX', 'spanZ']) finite(bounds[key], `bounds.${key}`, 0, 2 * MAX_COORDINATE_M);
  if (Number(bounds.minX) > Number(bounds.maxX) || Number(bounds.minZ) > Number(bounds.maxZ)) invalid('bounds order');
  pairs(geometry.leftBoundary, 'leftBoundary');
  pairs(geometry.rightBoundary, 'rightBoundary');
  const centerline = pairs(geometry.centerline, 'centerline', 2);
  if (geometry.nominalWidthM !== undefined) finite(geometry.nominalWidthM, 'nominalWidthM', 0, 1_000);
  if (geometry.startFinish !== undefined) pair(geometry.startFinish, 'startFinish');
  if (geometry.elevationProfile !== undefined) numbers(geometry.elevationProfile, 'elevationProfile', centerline.length);

  if (geometry.mapSurfaces !== undefined) {
    const surfaces = object(geometry.mapSurfaces, 'mapSurfaces');
    for (const key of ['road', 'kerb', 'runoff', 'pit', 'otherRoad']) {
      if ((key === 'pit' || key === 'otherRoad') && surfaces[key] === undefined) continue;
      array(surfaces[key], `mapSurfaces.${key}`).forEach((polygon, index) => {
        const path = `mapSurfaces.${key}[${index}]`;
        array(polygon, path, 1).forEach((ring, ringIndex) => pairs(ring, `${path}[${ringIndex}]`, 3));
      });
    }
  }
  if (geometry.timingGates !== undefined) {
    const gates = object(geometry.timingGates, 'timingGates');
    for (const key of ['startFinish', 'sector1', 'sector2']) {
      if (key !== 'startFinish' && gates[key] === undefined) continue;
      const path = `timingGates.${key}`;
      const gate = object(gates[key], path);
      text(gate.name, `${path}.name`);
      for (const point of ['center', 'left', 'right']) pair(gate[point], `${path}.${point}`);
      finite(gate.stationM, `${path}.stationM`, 0, lengthM);
    }
  }
  if (geometry.pitLane !== undefined) {
    const pitLane = object(geometry.pitLane, 'pitLane');
    const pitPoints = pairs(pitLane.centerline, 'pitLane.centerline');
    if (pitLane.elevation !== undefined) numbers(pitLane.elevation, 'pitLane.elevation', pitPoints.length);
  }
  for (const key of ['pitStalls', 'gridSlots']) {
    if (geometry[key] === undefined) continue;
    array(geometry[key], key).forEach((candidate, index) => {
      const path = `${key}[${index}]`;
      const entry = object(candidate, path);
      pair(entry.center, `${path}.center`);
      const id = key === 'pitStalls' ? 'id' : 'slot';
      if (!Number.isInteger(finite(entry[id], `${path}.${id}`, 0))) invalid(`${path}.${id}`);
      if (key === 'pitStalls') {
        finite(entry.widthM, `${path}.widthM`, 0, 1_000);
        if (entry.angleDeg !== undefined) finite(entry.angleDeg, `${path}.angleDeg`, -360, 360);
      }
    });
  }
  if (geometry.schemaVersion !== undefined && geometry.schemaVersion !== 2) invalid('schemaVersion');
  for (const key of ['geometryRevision', 'projectionRevision']) {
    if (geometry[key] !== undefined) text(geometry[key], key);
  }
  if (geometry.coordinates !== undefined) {
    const coordinates = object(geometry.coordinates, 'coordinates');
    if (coordinates.frame !== 'lmu-local' || coordinates.unit !== 'm' || coordinates.axes !== 'xyz') invalid('coordinates');
  }
  if (geometry.quality !== undefined) {
    const quality = object(geometry.quality, 'quality');
    const allowed: Record<string, readonly string[]> = {
      surfaces: ['native', 'estimated'], boundaries: ['native', 'partial', 'estimated'],
      elevation: ['native', 'partial', 'unavailable'], banking: ['native', 'partial', 'unavailable'],
      legalLimits: ['unavailable', 'candidate', 'validated'],
    };
    for (const [key, choices] of Object.entries(allowed)) {
      if (typeof quality[key] !== 'string' || !choices.includes(quality[key])) invalid(`quality.${key}`);
    }
  }
  if (geometry.surfaceProfile !== undefined) {
    const profile = object(geometry.surfaceProfile, 'surfaceProfile');
    const stations = array(profile.stationM, 'surfaceProfile.stationM', 2);
    let previous = -1;
    stations.forEach((station, index) => {
      const measured = finite(station, `surfaceProfile.stationM[${index}]`, 0, lengthM);
      if ((index === 0 && measured !== 0) || measured <= previous || measured >= lengthM) invalid('surfaceProfile station order');
      previous = measured;
    });
    for (const key of PROFILE_COLUMNS) {
      const column = array(profile[key], `surfaceProfile.${key}`);
      if (column.length !== stations.length) invalid(`surfaceProfile.${key} length`);
      column.forEach((measurement, index) => {
        if (measurement === null) return;
        const path = `surfaceProfile.${key}[${index}]`;
        if (key.endsWith('WidthM')) finite(measurement, path, 0, 1_000);
        else if (key === 'bankDeg') finite(measurement, path, -90, 90);
        else if (key === 'gradePct') finite(measurement, path, -1_000, 1_000);
        else finite(measurement, path);
      });
    }
    for (const key of KERB_TYPE_COLUMNS) {
      if (profile[key] === undefined) continue;
      const column = array(profile[key], `surfaceProfile.${key}`);
      if (column.length !== stations.length) invalid(`surfaceProfile.${key} length`);
      column.forEach((kind, index) => {
        if (kind !== null && !KERB_TYPES.includes(kind as TrackKerbType)) invalid(`surfaceProfile.${key}[${index}]`);
      });
    }
  }
  return value as TrackBoundaryGeometry;
}

/** Validates optional display assets without allowing a different layout or stale source revision. */
export function parseTrackMapDisplay(value: unknown, layoutKey: string, sourceRevision: string): TrackMapDisplay {
  const display = object(value, 'display');
  if (display.layoutKey !== layoutKey) invalid('display layoutKey mismatch');
  if (display.sourceRevision !== sourceRevision) invalid('display sourceRevision mismatch');
  text(display.sourceRevision, 'display.sourceRevision');
  const surfaces = object(display.surfaces, 'display.surfaces');
  let total = 0;
  const array = (candidate: unknown, path: string, minimum = 0): unknown[] => {
    if (!Array.isArray(candidate) || candidate.length < minimum || candidate.length > MAX_ARRAY_ITEMS) invalid(path);
    total += candidate.length;
    if (total > MAX_TOTAL_ITEMS) invalid('display total array size');
    return candidate;
  };
  for (const key of ['road', 'kerb', 'runoff', 'pit', 'otherRoad']) {
    const path = `display.surfaces.${key}`;
    for (const polygon of array(surfaces[key], path)) {
      for (const ring of array(polygon, path, 1)) {
        for (const point of array(ring, path, 3)) {
          const pair = array(point, path, 2);
          if (pair.length !== 2) invalid(path);
          finite(pair[0], path); finite(pair[1], path);
        }
      }
    }
  }
  if (display.brakeMarkers !== undefined) {
    const markers = array(display.brakeMarkers, 'display.brakeMarkers');
    for (let index = 0; index < markers.length; index++) {
      const path = `display.brakeMarkers[${index}]`;
      const marker = object(markers[index], path);
      text(marker.id, `${path}.id`);
      const center = array(marker.center, `${path}.center`, 2);
      if (center.length !== 2) invalid(`${path}.center`);
      finite(center[0], `${path}.center[0]`); finite(center[1], `${path}.center[1]`);
      if (marker.distanceM !== null) finite(marker.distanceM, `${path}.distanceM`, 0);
      finite(marker.stationM, `${path}.stationM`, 0);
      if (marker.side !== 'left' && marker.side !== 'right') invalid(`${path}.side`);
    }
  }
  return value as TrackMapDisplay;
}

/** Samples actual physical station intervals, including the closing interval to station zero. */
export function sampleTrackSurfaceProfile(geometry: TrackBoundaryGeometry, stationM: number): TrackSurfaceProfileSample | null {
  const profile = geometry.surfaceProfile;
  if (!profile || !Number.isFinite(stationM) || !(geometry.lengthM > 0) || profile.stationM.length < 2) return null;
  const remainder = stationM % geometry.lengthM;
  const station = remainder < 0 ? remainder + geometry.lengthM : remainder === 0 ? 0 : remainder;
  const stations = profile.stationM;
  let low = 0;
  let high = stations.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (stations[middle] <= station) low = middle + 1;
    else high = middle;
  }
  const leftIndex = Math.max(0, low - 1);
  const rightIndex = (leftIndex + 1) % stations.length;
  const leftStation = stations[leftIndex];
  const rightStation = rightIndex === 0 ? geometry.lengthM : stations[rightIndex];
  const fraction = (station - leftStation) / (rightStation - leftStation);
  const interpolate = (key: keyof TrackSurfaceProfileColumns): number | null => {
    const left = profile[key][leftIndex];
    if (fraction === 0) return left;
    const right = profile[key][rightIndex];
    return left === null || right === null ? null : left + (right - left) * fraction;
  };
  // A type is a category, not a measurement: take the nearer station's.
  const nearest = fraction < 0.5 ? leftIndex : rightIndex;
  const kerbType = (key: typeof KERB_TYPE_COLUMNS[number]): TrackKerbType | null => profile[key]?.[nearest] ?? null;
  return {
    stationM: station,
    leftWidthM: interpolate('leftWidthM'), rightWidthM: interpolate('rightWidthM'),
    elevationM: interpolate('elevationM'), gradePct: interpolate('gradePct'), bankDeg: interpolate('bankDeg'),
    leftElevationM: interpolate('leftElevationM'), rightElevationM: interpolate('rightElevationM'),
    leftKerbWidthM: interpolate('leftKerbWidthM'), rightKerbWidthM: interpolate('rightKerbWidthM'),
    leftKerbHeightM: interpolate('leftKerbHeightM'), rightKerbHeightM: interpolate('rightKerbHeightM'),
    leftKerbType: kerbType('leftKerbType'), rightKerbType: kerbType('rightKerbType'),
  };
}

/** Positive lateral offset is RIGHT in the centerline projection; these are road edges, not legal limits. */
export function getTrackRoadEdgeDistances(
  geometry: TrackBoundaryGeometry,
  stationM: number,
  lateralOffsetM: number,
): TrackRoadEdgeDistances | null {
  if (!Number.isFinite(lateralOffsetM)) return null;
  const sample = sampleTrackSurfaceProfile(geometry, stationM);
  if (!sample) return null;
  return {
    leftDistanceM: sample.leftWidthM === null ? null : sample.leftWidthM + lateralOffsetM,
    rightDistanceM: sample.rightWidthM === null ? null : sample.rightWidthM - lateralOffsetM,
  };
}
