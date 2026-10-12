import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/apiClient.js';
import { loadTrackBoundaryGeometry, loadTrackMapDisplay } from '../../src/api/trackGeometryApi.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';

describe('trackGeometryApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  const geometry: TrackBoundaryGeometry = {
    layoutKey: 'a', circuitId: 'a', layoutId: 'gp', trackVenue: 'A', trackCourse: 'GP', lengthM: 10,
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
    centerline: [[0, 0], [10, 10]], leftBoundary: [[0, 0], [10, 10]], rightBoundary: [[1, 0], [11, 10]],
    geometryRevision: 'revision-1',
  };
  const display = { layoutKey: 'a', sourceRevision: 'revision-1',
    surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] } };

  it('reuses the display from the successful geometry request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry, display })));
    vi.stubGlobal('fetch', fetchMock);
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    await expect(loadTrackMapDisplay(loadedGeometry)).resolves.toEqual(display);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/data-plugin/tracks/a', { cache: 'no-cache' });
  });

  it('reuses an explicit null display without another request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry, display: null })));
    vi.stubGlobal('fetch', fetchMock);
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    await expect(loadTrackMapDisplay(loadedGeometry)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed geometry rather than letting it reach map rendering', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ layoutKey: 'a' }))));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toThrow('Invalid track geometry');
  });

  it('rejects with ApiError when the file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toBeInstanceOf(ApiError);
  });

  it('treats a missing optional display sidecar as unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadTrackMapDisplay(geometry)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/data-plugin/tracks/a', { cache: 'no-cache', signal: undefined });
  });

  it('ignores a sidecar generated from an older geometry revision', async () => {
    const display = {
      layoutKey: 'a', sourceRevision: 'revision-0',
      surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] },
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({packageRevision:'test',geometry:null,display}))));
    await expect(loadTrackMapDisplay(geometry)).resolves.toBeNull();
  });

  it('propagates non-404 API failures and aborted requests', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'offline' }), { status: 503 })));
    await expect(loadTrackMapDisplay(geometry)).rejects.toMatchObject({ name: 'ApiError', status: 503, message: 'offline' });

    const controller = new AbortController();
    const abortError = new DOMException('Request aborted', 'AbortError');
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);
    const pending = loadTrackMapDisplay(geometry, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith('/api/data-plugin/tracks/a', { cache: 'no-cache', signal: controller.signal });
  });

  it('rejects malformed display payloads from the geometry response', async () => {
    const malformed = { layoutKey: 'a', sourceRevision: 'revision-1', surfaces: {} };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry, display: malformed }))));
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    await expect(loadTrackMapDisplay(loadedGeometry)).rejects.toThrow('Invalid track geometry');
  });

  it('checks an already-aborted signal before using an associated display', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry, display })));
    vi.stubGlobal('fetch', fetchMock);
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    const controller = new AbortController();
    controller.abort();
    await expect(loadTrackMapDisplay(loadedGeometry, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a cached display from a different geometry revision', async () => {
    const staleDisplay = { ...display, sourceRevision: 'revision-0' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry, display: staleDisplay })));
    vi.stubGlobal('fetch', fetchMock);
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    await expect(loadTrackMapDisplay(loadedGeometry)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats an omitted display in the package response as cached absence', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packageRevision: 'test', geometry })));
    vi.stubGlobal('fetch', fetchMock);
    const loadedGeometry = await loadTrackBoundaryGeometry('a');
    await expect(loadTrackMapDisplay(loadedGeometry)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
