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

  it('asks once per session, keeps the last one, and asks again after a failure', async () => {
    const failing = respond({error: 'No replay'}, false);
    vi.stubGlobal('fetch', failing);
    await expect(fetchRaceOverview('overview-a')).rejects.toThrow();
    expect(lastRaceOverview('overview-a')).toBeNull();
    const fetching = respond({replayName: 'A.Vcr'});
    vi.stubGlobal('fetch', fetching);
    const first = fetchRaceOverview('overview-a');
    expect(fetchRaceOverview('overview-a')).toBe(first);
    await expect(first).resolves.toEqual({replayName: 'A.Vcr'});
    expect(lastRaceOverview('overview-a')).toEqual({replayName: 'A.Vcr'});
    expect(fetching).toHaveBeenCalledOnce();
    expect(lastRaceOverview('overview-b')).toBeNull();
  });
});
