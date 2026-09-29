import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/apiClient.js';
import { loadTrackBoundaryGeometry } from '../../src/api/trackGeometryApi.js';

describe('trackGeometryApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the layout JSON from the static tracks folder', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ layoutKey: 'a' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadTrackBoundaryGeometry('a')).resolves.toEqual({ layoutKey: 'a' });
    expect(fetchMock).toHaveBeenCalledWith('/tracks/a.json');
  });

  it('rejects with ApiError when the file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(loadTrackBoundaryGeometry('a')).rejects.toBeInstanceOf(ApiError);
  });
});
