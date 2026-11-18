import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRaceOverview, lastRaceOverview, sessionTelemetryPath } from '../../src/api/replayApi.js';

describe('session telemetry API paths', () => {
  it('identifies a session and driver/lap ordinals without exposing recording identity', () => {
    expect(sessionTelemetryPath('session / 7', {
      driverOrdinal: 2,
      lapOrdinal: 5,
      resolutionQuery: 'pointSpacingM=2',
      source: 'vcr',
    })).toBe('/api/session/session%20%2F%207/telemetry?driverOrdinal=2&lapOrdinal=5&pointSpacingM=2&source=vcr');
  });
});

describe('race overview', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const respond = (body: unknown, ok = true) => vi.fn(async () => new Response(JSON.stringify(body), {status: ok ? 200 : 500, headers: {'Content-Type': 'application/json'}}));

  const signal = () => new AbortController().signal;
  /** A fetch that answers only when its returned `answer` is called, and rejects as fetch does once its signal aborts. */
  const held = () => {
    let answer = () => {};
    const fetching = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      answer = () => resolve(new Response(JSON.stringify({replayName: 'A.Vcr'}), {headers: {'Content-Type': 'application/json'}}));
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    return {fetching, answer: () => answer()};
  };
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

  it('asks once per session, keeps the last one, and asks again after a failure', async () => {
    const failing = respond({error: 'No replay'}, false);
    vi.stubGlobal('fetch', failing);
    await expect(fetchRaceOverview('overview-a', signal())).rejects.toThrow();
    expect(lastRaceOverview('overview-a')).toBeNull();
    const fetching = respond({replayName: 'A.Vcr'});
    vi.stubGlobal('fetch', fetching);
    const first = fetchRaceOverview('overview-a', signal()), second = fetchRaceOverview('overview-a', signal());
    await expect(first).resolves.toEqual({replayName: 'A.Vcr'});
    await expect(second).resolves.toEqual({replayName: 'A.Vcr'});
    expect(lastRaceOverview('overview-a')).toEqual({replayName: 'A.Vcr'});
    expect(fetching).toHaveBeenCalledOnce();
    expect(lastRaceOverview('overview-b')).toBeNull();
  });

  it('stops the request once every caller stopped waiting, and keeps it for a caller taking over', async () => {
    const stopped = held();
    vi.stubGlobal('fetch', stopped.fetching);
    const leaving = new AbortController(), wait = fetchRaceOverview('overview-c', leaving.signal);
    leaving.abort();
    await expect(wait).rejects.toThrow();
    await nextTask();
    const request = stopped.fetching.mock.calls[0][1]!;
    expect(request.signal?.aborted).toBe(true);

    const handed = held();
    vi.stubGlobal('fetch', handed.fetching);
    const ahead = new AbortController();
    void fetchRaceOverview('overview-d', ahead.signal).catch(() => {});
    // The lap view's ask stops as the race view asks, in the same render: the request goes on.
    ahead.abort();
    const race = fetchRaceOverview('overview-d', signal());
    await nextTask();
    handed.answer();
    await expect(race).resolves.toEqual({replayName: 'A.Vcr'});
    expect(handed.fetching).toHaveBeenCalledOnce();
  });
});
