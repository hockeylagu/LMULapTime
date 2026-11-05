import { describe, expect, it } from 'vitest';
import {
  hasCompatibleTrackStations,
  getTrackRoadEdgeDistances,
  parseTrackBoundaryGeometry,
  sampleTrackSurfaceProfile,
} from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry, TrackMapSurfaces, TrackSurfaceProfile } from '../../shared/types/trackGeometry.js';

function legacy(): TrackBoundaryGeometry {
  return {
    layoutKey: 'test_gp', circuitId: 'test', layoutId: 'gp', trackVenue: 'Test', trackCourse: 'GP',
    lengthM: 100,
    bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20, spanX: 20, spanZ: 20 },
    leftBoundary: [[0, 0], [20, 20]], rightBoundary: [[2, 0], [22, 20]],
    centerline: [[1, 0], [21, 20], [1, 0]],
  };
}

function surfaceProfile(): TrackSurfaceProfile {
  return {
    stationM: [0, 20, 80],
    leftWidthM: [5, 9, 13], rightWidthM: [4, 6, 8],
    elevationM: [100, 110, 104], gradePct: [1, 3, -2], bankDeg: [5, 10, -5],
    leftElevationM: [101, 112, 103], rightElevationM: [99, 108, 105],
    leftKerbWidthM: [0.4, 0.8, null], rightKerbWidthM: [null, null, null],
    leftKerbHeightM: [0.05, 0.15, null], rightKerbHeightM: [null, null, null],
  };
}

function native(): TrackBoundaryGeometry {
  return {
    ...legacy(), geometryRevision: 'mesh-v2', projectionRevision: 'centerline-v1',
    quality: { surfaces: 'native', boundaries: 'partial', elevation: 'native', banking: 'partial', legalLimits: 'unavailable' },
    surfaceProfile: surfaceProfile(),
  };
}

function mapSurfaces(): TrackMapSurfaces {
  const ring: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 0]];
  return { road: [[ring]], kerb: [], runoff: [], pit: [], otherRoad: [] };
}

describe('native surface sampling', () => {
  it('interpolates asymmetric road widths, elevation and signed banking at physical stations', () => {
    const sample = sampleTrackSurfaceProfile(native(), 10);
    expect(sample).toMatchObject({
      stationM: 10, leftWidthM: 7, rightWidthM: 5, elevationM: 105, gradePct: 2,
      bankDeg: 7.5, leftElevationM: 106.5, rightElevationM: 103.5,
      leftKerbHeightM: 0.1, rightKerbWidthM: null,
    });
    expect(sample?.leftKerbWidthM).toBeCloseTo(0.6);
    expect(sampleTrackSurfaceProfile(native(), 50)).toMatchObject({ leftWidthM: 11, elevationM: 107, bankDeg: 2.5 });
  });

  it('uses the actual closing station interval across the seam and wraps either direction', () => {
    const geometry = native();
    expect(sampleTrackSurfaceProfile(geometry, 90)).toMatchObject({ leftWidthM: 9, rightWidthM: 6, elevationM: 102, bankDeg: 0 });
    expect(sampleTrackSurfaceProfile(geometry, -10)).toEqual(sampleTrackSurfaceProfile(geometry, 90));
    expect(sampleTrackSurfaceProfile(geometry, 190)).toEqual(sampleTrackSurfaceProfile(geometry, 90));
    expect(sampleTrackSurfaceProfile(geometry, 100)).toEqual(sampleTrackSurfaceProfile(geometry, 0));
  });

  it('preserves observed values at samples and null gaps between them, including the seam', () => {
    const geometry = native();
    expect(sampleTrackSurfaceProfile(geometry, 20)?.leftKerbWidthM).toBe(0.8);
    expect(sampleTrackSurfaceProfile(geometry, 50)?.leftKerbWidthM).toBeNull();
    expect(sampleTrackSurfaceProfile(geometry, 80)?.leftKerbWidthM).toBeNull();
    expect(sampleTrackSurfaceProfile(geometry, 90)?.leftKerbWidthM).toBeNull();
    expect(sampleTrackSurfaceProfile(geometry, 0)?.leftKerbWidthM).toBe(0.4);
    geometry.surfaceProfile!.stationM[1] = 0.1;
    expect(sampleTrackSurfaceProfile(geometry, 0.1)?.leftKerbWidthM).toBe(0.8);
  });

  it('reports signed road edge distances with positive lateral offsets to the left (OpenDRIVE t)', () => {
    expect(getTrackRoadEdgeDistances(native(), 10, 2)).toEqual({ leftDistanceM: 5, rightDistanceM: 7 });
    expect(getTrackRoadEdgeDistances(native(), 10, 6)).toEqual({ leftDistanceM: 1, rightDistanceM: 11 });
    expect(getTrackRoadEdgeDistances(native(), 10, -8)).toEqual({ leftDistanceM: 15, rightDistanceM: -3 });
    const geometry = native();
    geometry.surfaceProfile!.leftWidthM[1] = null;
    expect(getTrackRoadEdgeDistances(geometry, 10, 2)).toEqual({ leftDistanceM: null, rightDistanceM: 7 });
  });

  it('takes the nearer station kerb type and reports none for files without the column', () => {
    const geometry = native();
    geometry.surfaceProfile = { ...geometry.surfaceProfile!, leftKerbType: ['flat', 'sawtooth', null], rightKerbType: [null, null, 'other'] };
    expect(sampleTrackSurfaceProfile(geometry, 5)).toMatchObject({ leftKerbType: 'flat', rightKerbType: null });
    expect(sampleTrackSurfaceProfile(geometry, 15)).toMatchObject({ leftKerbType: 'sawtooth', rightKerbType: null });
    expect(sampleTrackSurfaceProfile(geometry, 85)).toMatchObject({ leftKerbType: null, rightKerbType: 'other' });
    expect(sampleTrackSurfaceProfile(native(), 15)).toMatchObject({ leftKerbType: null, rightKerbType: null });
  });

  it('does not fabricate a native profile for legacy geometry or invalid query inputs', () => {
    expect(sampleTrackSurfaceProfile(legacy(), 0)).toBeNull();
    expect(sampleTrackSurfaceProfile(native(), NaN)).toBeNull();
    expect(getTrackRoadEdgeDistances(legacy(), 0, 0)).toBeNull();
    expect(getTrackRoadEdgeDistances(native(), 10, Infinity)).toBeNull();
  });
});

describe('track geometry runtime validation', () => {
  it('accepts legacy small fixtures without changing their metadata or independent boundary counts', () => {
    const geometry = legacy();
    expect(parseTrackBoundaryGeometry(geometry, 'test_gp')).toBe(geometry);
    expect(geometry.surfaceProfile).toBeUndefined();
    expect(geometry.quality).toBeUndefined();
  });

  it('retains native fields and polygon holes without flattening or rewriting coordinates', () => {
    const geometry = native();
    geometry.surfaces = {
      road: [[[[0, 0], [20, 0], [20, 20], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]]],
      kerb: [], runoff: [],
    };
    expect(parseTrackBoundaryGeometry(geometry)).toBe(geometry);
    expect(geometry.surfaces.road[0]).toHaveLength(2);
  });

  it('validates optional legacy timing, pit and grid geometry', () => {
    const geometry = legacy();
    geometry.pitLane = { centerline: [[0, 0], [1, 0]], elevation: [0, 1] };
    geometry.pitStalls = [{ id: 0, center: [0, 0], widthM: 3, angleDeg: -30 }];
    geometry.gridSlots = [{ slot: 1, center: [1, 0] }];
    geometry.timingGates = { startFinish: { name: 'Start', center: [0, 0], left: [-1, 0], right: [1, 0], stationM: 0 } };
    expect(parseTrackBoundaryGeometry(geometry)).toBe(geometry);
    geometry.pitLane.elevation = [0];
    expect(() => parseTrackBoundaryGeometry(geometry)).toThrow('pitLane.elevation length');
  });

  it.each([
    null,
    { ...legacy(), lengthM: 0 },
    { ...legacy(), lengthM: Infinity },
    { ...legacy(), leftBoundary: [[NaN, 0]] },
    { ...legacy(), centerline: [[0, 0, 0], [1, 1]] },
    { ...legacy(), startFinish: [0, 2_000_000] },
    { ...legacy(), bounds: { ...legacy().bounds, minX: 21 } },
    { ...native(), geometryRevision: '' },
    { ...native(), quality: { ...native().quality, banking: 'estimated' } },
    { ...legacy(), surfaces: { road: [[[0, 0], [1, 1]]], kerb: [], runoff: [] } },
  ])('rejects malformed, unbounded and unsupported geometry %#', value => {
    expect(() => parseTrackBoundaryGeometry(value)).toThrow('Invalid track geometry');
  });

  it('rejects another exact layout key without resolving or guessing layouts', () => {
    expect(() => parseTrackBoundaryGeometry(legacy(), 'test_short')).toThrow('layoutKey mismatch');
  });

  it.each([
    { ...surfaceProfile(), stationM: [1, 20, 80] },
    { ...surfaceProfile(), stationM: [0, 20, 20] },
    { ...surfaceProfile(), stationM: [0, 80, 20] },
    { ...surfaceProfile(), stationM: [0, 20, 100] },
    { ...surfaceProfile(), stationM: [0, 20, NaN] },
    { ...surfaceProfile(), leftWidthM: [1, 2] },
    { ...surfaceProfile(), leftWidthM: [1, -2, 3] },
    { ...surfaceProfile(), elevationM: [100, undefined, 104] },
    { ...surfaceProfile(), bankDeg: [0, 91, null] },
  ])('rejects mismatched, unordered and invalid native profile columns %#', surfaceProfileValue => {
    expect(() => parseTrackBoundaryGeometry({ ...native(), surfaceProfile: surfaceProfileValue })).toThrow('Invalid track geometry');
  });

  it('accepts known kerb types and rejects unknown ones or a column of the wrong length', () => {
    const geometry = native();
    geometry.surfaceProfile = { ...geometry.surfaceProfile!, leftKerbType: ['flat', 'sawtooth', 'other'], rightKerbType: [null, null, null] };
    expect(parseTrackBoundaryGeometry(geometry)).toBe(geometry);
    const unknown = { ...native(), surfaceProfile: { ...surfaceProfile(), leftKerbType: ['flat', 'concrete', null] } };
    expect(() => parseTrackBoundaryGeometry(unknown)).toThrow('surfaceProfile.leftKerbType[1]');
    const short = { ...native(), surfaceProfile: { ...surfaceProfile(), rightKerbType: ['flat'] } };
    expect(() => parseTrackBoundaryGeometry(short)).toThrow('surfaceProfile.rightKerbType length');
  });

  it('rejects sparse arrays instead of treating missing measurements as unavailable nulls', () => {
    const geometry = native();
    // oxlint-disable-next-line typescript/no-array-delete -- Builds a sparse array on purpose.
    delete geometry.surfaceProfile!.leftWidthM[1];
    expect(() => parseTrackBoundaryGeometry(geometry)).toThrow('missing');
    const sparsePoints = legacy();
    // oxlint-disable-next-line typescript/no-array-delete -- Builds a sparse array on purpose.
    delete sparsePoints.centerline[1];
    expect(() => parseTrackBoundaryGeometry(sparsePoints)).toThrow('missing');
  });
});

describe('track map surfaces and brake markers', () => {
  const withSurfaces = (surfaces: unknown) => ({ ...legacy(), surfaces });
  it('accepts the surface set and brake markers without rewriting them', () => {
    const geometry = { ...legacy(), surfaces: mapSurfaces(), brakeMarkers: [
      { id: 'brake-150', center: [12, 34], label: '150', stationM: 900, side: 'left' },
      { id: 'brake-unknown', center: [56, 78], stationM: 1200, side: 'right', baseY: 13.45, normal: [0, 1] },
    ] } as TrackBoundaryGeometry;
    expect(parseTrackBoundaryGeometry(geometry)).toBe(geometry);
    expect(geometry.surfaces?.road[0][0]).toEqual([[0, 0], [10, 0], [10, 10], [0, 0]]);
  });

  it('accepts a track without surfaces or markers', () => {
    expect(parseTrackBoundaryGeometry(legacy())).not.toHaveProperty('surfaces');
  });

  it('accepts optional apron, gravel, grass, raised kerb and other-road kerb layers', () => {
    const surfaces = mapSurfaces();
    const geometry = withSurfaces({ road: surfaces.road, kerb: [], runoff: [], apron: surfaces.road, gravel: [], grass: surfaces.road, raisedKerb: [], otherRoadKerb: [] });
    expect(parseTrackBoundaryGeometry(geometry)).toBe(geometry);
  });

  it.each([
    ['a missing required layer', { road: [], kerb: [] }],
    ['a malformed polygon ring', { ...mapSurfaces(), road: [[[[0, 0], [1, 1]]]] }],
    ['a nonfinite coordinate', { ...mapSurfaces(), road: [[[[0, 0], [10, 0], [Infinity, 10]]]] }],
    ['a malformed raised kerb ring', { ...mapSurfaces(), raisedKerb: [[[[0, 0], [1, 1]]]] }],
    ['a malformed grass ring', { ...mapSurfaces(), grass: [[[[0, 0], [1, 1]]]] }],
    ['an apron that is not an array', { ...mapSurfaces(), apron: {} }],
  ])('rejects surfaces with %s', (_label, surfaces) => {
    expect(() => parseTrackBoundaryGeometry(withSurfaces(surfaces))).toThrow('Invalid track geometry');
  });

  it.each([
    ['a negative station', [{ id: 'bad', center: [0, 0], stationM: -5, side: 'left' }]],
    ['an unknown side', [{ id: 'bad', center: [0, 0], stationM: 5, side: 'center' }]],
    ['a malformed centre', [{ id: 'bad', center: [0], stationM: 5, side: 'left' }]],
  ])('rejects a brake marker with %s', (_label, brakeMarkers) => {
    expect(() => parseTrackBoundaryGeometry({ ...legacy(), brakeMarkers })).toThrow('Invalid track geometry');
  });
});

describe('canonical station availability',()=>{
 it('rejects odometer and mixed geometry frames while accepting a shared track revision',()=>{
  expect(hasCompatibleTrackStations({stationSource:'odometer'})).toBe(false);
  expect(hasCompatibleTrackStations({}, {})).toBe(false);
  expect(hasCompatibleTrackStations({stationSource:'track'}, {stationSource:'track'})).toBe(false);
  expect(hasCompatibleTrackStations({geometryRevision:'one'}, {geometryRevision:'one'})).toBe(false);
  expect(hasCompatibleTrackStations({stationSource:'track',geometryRevision:'one'},{stationSource:'odometer'})).toBe(false);
  expect(hasCompatibleTrackStations({stationSource:'track',geometryRevision:'one'},{stationSource:'track',geometryRevision:'two'})).toBe(false);
  expect(hasCompatibleTrackStations({stationSource:'track',geometryRevision:'one'},{stationSource:'track',geometryRevision:'one'})).toBe(true);
 });
});
