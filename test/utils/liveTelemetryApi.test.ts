import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionTelemetry } from '../../src/api/replayApi.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../src/utils/telemetryPostProcessing.js';
import { liveEvidenceFixture, liveTrajectoryFixture } from '../helpers/liveEvidence.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('telemetry live addon loading', () => {
  it('loads attached evidence through the API client and retains measured values through processing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(liveTrajectoryFixture())))
      .mockResolvedValueOnce(new Response(JSON.stringify(liveEvidenceFixture())));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const trajectory = await fetchSessionTelemetry('session', { driverOrdinal: 0, lapOrdinal: 1 }, { signal: controller.signal });
    expect(fetcher.mock.calls[1][0]).toBe('/api/session/session/live-evidence?driverOrdinal=0&lapOrdinal=1');
    expect(fetcher.mock.calls[1][1]?.signal).toBe(controller.signal);
    expect(applyTelemetryPostProcessingToTrajectory(trajectory).points[0].yawRateDeg).toBe(0.25 * 180 / Math.PI);
  });

  it('does not request live data when no attachment exists', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...liveTrajectoryFixture(), hasLiveCapture: undefined })));
    vi.stubGlobal('fetch', fetcher);
    await fetchSessionTelemetry('session', { driverOrdinal: 0, lapOrdinal: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('keeps the base trajectory when supplemental data fails and preserves cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(liveTrajectoryFixture())))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Capture file unavailable' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(liveTrajectoryFixture())))
      .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetcher);
    const trajectory = await fetchSessionTelemetry('session', { driverOrdinal: 0, lapOrdinal: 1 });
    expect(trajectory.points).toEqual(liveTrajectoryFixture().points);
    expect(trajectory.liveCaptureOverlay).toEqual({ state: 'unavailable', message: 'Capture file unavailable' });
    await expect(fetchSessionTelemetry('session', { driverOrdinal: 0, lapOrdinal: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
