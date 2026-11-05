import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/apiClient.js';
import { loadTrackBoundaryGeometry } from '../../src/api/trackGeometryApi.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';

describe('trackGeometryApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  const geometry: TrackBoundaryGeometry = {
    layoutKey: 'a', circuitId: 'a', layoutId: 'gp', trackVenue: 'A', trackCourse: 'GP', lengthM: 10,
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
    centerline: [[0, 0], [10, 10]], leftBoundary: [[0, 0], [10, 10]], rightBoundary: [[1, 0], [11, 10]],
    geometryRevision: 'revision-1',
  };

  it('loads the geometry with its map surfaces and brake markers in one request', async () => {
    const withDisplay: TrackBoundaryGeometry = { ...geometry,
      surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] },
      brakeMarkers: [{ id: 'b1', center: [1, 2], stationM: 5, side: 'left' }] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry: withDisplay })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadTrackBoundaryGeometry('a')).resolves.toEqual(withDisplay);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/data-plugin/tracks/a', { cache: 'no-cache' });
  });

  it('loads a track without surfaces or markers', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry }))));
    const loaded = await loadTrackBoundaryGeometry('a');
    expect(loaded.surfaces).toBeUndefined();
    expect(loaded.brakeMarkers).toBeUndefined();
  });

  it('rejects malformed geometry rather than letting it reach map rendering', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ layoutKey: 'a' }))));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toThrow('Invalid track geometry');
  });

  it('rejects malformed map surfaces from the geometry response', async () => {
    const malformed = { ...geometry, surfaces: {} };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry: malformed }))));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toThrow('Invalid track geometry');
  });

  it('rejects with ApiError when the file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toBeInstanceOf(ApiError);
  });
});
