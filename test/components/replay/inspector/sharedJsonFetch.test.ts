import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonShared } from '../../../../src/components/replay/inspector/sharedJsonFetch.js';

describe('fetchJsonShared', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares one request between identical calls in flight, and fetches again once it settled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ lap: 4 }) }) as unknown as Response);
    fetchMock.mockClear();

    const [a, b] = await Promise.all([fetchJsonShared('http://x/lap?4'), fetchJsonShared('http://x/lap?4')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, status: 200, body: { lap: 4 } });
    expect(b).toBe(a);

    await fetchJsonShared('http://x/lap?4');
    await fetchJsonShared('http://x/lap?5');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports a failed response with its JSON body, or null when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Lap not found' }) }) as unknown as Response)
      .mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('not JSON'); } }) as unknown as Response);

    expect(await fetchJsonShared('http://x/missing')).toEqual({ ok: false, status: 404, body: { error: 'Lap not found' } });
    expect(await fetchJsonShared('http://x/broken')).toEqual({ ok: false, status: 500, body: null });
  });
});
