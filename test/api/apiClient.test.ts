import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiErrorMessage, fetchJson, isAbortError, postJson } from '../../src/api/apiClient.js';
import { replayTrajectoryPath } from '../../src/api/replayApi.js';
import { invalidateReferenceLaptimes, loadReferenceLaptimes, peekReferenceLaptimes } from '../../src/api/referenceApi.js';

const stubFetch = () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateReferenceLaptimes();
  });

  it('returns the JSON body of a 2xx response', async () => {
    const fetchMock = stubFetch().mockResolvedValue(jsonResponse([{ id: 'a' }]));
    await expect(fetchJson('/api/sessions')).resolves.toEqual([{ id: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', { cache: 'no-store' });
  });

  it('keeps static asset caching and caller cache overrides', async () => {
    const fetchMock = stubFetch().mockImplementation(async () => jsonResponse({ ok: true }));
    await fetchJson('/tracks/spa.json');
    await fetchJson('/api/sessions', { cache: 'force-cache' });
    expect(fetchMock.mock.calls[0]).toEqual(['/tracks/spa.json']);
    expect(fetchMock.mock.calls[1]).toEqual(['/api/sessions', { cache: 'force-cache' }]);
  });

  it('throws the server error message with the status and body of a failed response', async () => {
    stubFetch().mockResolvedValue(jsonResponse({ error: 'Replay file "x.Vcr" not found', errorCode: 'missing' }, 404));
    const failure = await fetchJson('/api/replays/x.Vcr/metadata').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ message: 'Replay file "x.Vcr" not found', status: 404, body: { errorCode: 'missing' } });
  });

  it('names the endpoint and status when a failed response has no error message', async () => {
    stubFetch().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(fetchJson('/api/status?x=1')).rejects.toThrow('Request to /api/status failed (HTTP 502)');
  });

  it('posts a JSON body', async () => {
    const fetchMock = stubFetch().mockResolvedValue(jsonResponse({ success: true }));
    await postJson('/api/scan', { playerName: 'Driver' });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/scan');
    expect(init).toMatchObject({ method: 'POST', body: '{"playerName":"Driver"}', headers: { 'Content-Type': 'application/json' } });
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('tells an aborted request from a failure', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('offline'))).toBe(false);
    expect(apiErrorMessage(new Error('offline'), 'fallback')).toBe('offline');
    expect(apiErrorMessage('odd', 'fallback')).toBe('fallback');
  });
});

describe('replayTrajectoryPath', () => {
  it('builds a relative path with only the parameters given', () => {
    expect(replayTrajectoryPath('Spa R1 #3.Vcr')).toBe('/api/replays/Spa%20R1%20%233.Vcr/trajectory');
    expect(replayTrajectoryPath('a.Vcr', {
      resolutionQuery: 'pointSpacingM=2', lap: 4, driverSlot: 0, driverName: 'Other Driver', source: 'vcr',
    })).toBe('/api/replays/a.Vcr/trajectory?pointSpacingM=2&lap=4&driverSlot=0&driverName=Other%20Driver&source=vcr');
    expect(replayTrajectoryPath('a.Vcr', { lap: 0, driverSlot: null, driverName: null })).toBe('/api/replays/a.Vcr/trajectory');
  });
});

describe('referenceApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateReferenceLaptimes();
  });

  it('shares one request until invalidated', async () => {
    const table = { lastUpdated: 't1', entriesCount: 0, entries: {} };
    const fetchMock = stubFetch().mockImplementation(() => Promise.resolve(jsonResponse(table)));
    await Promise.all([loadReferenceLaptimes(), loadReferenceLaptimes()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekReferenceLaptimes()).toEqual(table);

    invalidateReferenceLaptimes();
    expect(peekReferenceLaptimes()).toBeNull();
    await loadReferenceLaptimes();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failed request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'down' }, 500))
      .mockResolvedValueOnce(jsonResponse({ lastUpdated: null, entriesCount: 0, entries: {} }));
    await expect(loadReferenceLaptimes()).rejects.toThrow('down');
    await expect(loadReferenceLaptimes()).resolves.toMatchObject({ entriesCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
