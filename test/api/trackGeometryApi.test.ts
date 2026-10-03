import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/apiClient.js';
import { loadTrackBoundaryGeometry } from '../../src/api/trackGeometryApi.js';

describe('trackGeometryApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the layout JSON from the static tracks folder', async () => {
    const geometry = {
      layoutKey: 'a', circuitId: 'a', layoutId: 'gp', trackVenue: 'A', trackCourse: 'GP', lengthM: 10,
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
      centerline: [[0, 0], [10, 10]], leftBoundary: [[0, 0], [10, 10]], rightBoundary: [[1, 0], [11, 10]],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(geometry)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadTrackBoundaryGeometry('a')).resolves.toEqual(geometry);
    expect(fetchMock).toHaveBeenCalledWith('/tracks/a.json', { cache: 'no-cache' });
  });

  it('rejects malformed geometry rather than letting it reach map rendering', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ layoutKey: 'a' }))));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toThrow('Invalid track geometry');
  });

  it('rejects with ApiError when the file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toBeInstanceOf(ApiError);
  });
});
