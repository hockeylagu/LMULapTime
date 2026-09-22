import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIReportTab } from '../../src/components/replay/analysis/AIReportTab.js';
import type { ReplayTrajectoryData } from '../../server/core/types.js';

const trajectory = {
  replayName: 'Test_Replay.vcr',
  driverName: 'Test Driver',
  driverSlot: 1,
  currentLap: 1,
  pointsCount: 2,
  bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
  points: [],
  laps: [{ lapNumber: 1, lapTimeSec: 95.25, s1Sec: 31, s2Sec: 32, s3Sec: 32, isValid: true }],
} as ReplayTrajectoryData;

const reportResponse = {
  report: {
    overallSummary: 'Brake later and carry more speed through the final sector.',
    improvements: [{
      title: 'Improve final-sector entry',
      action: 'Release the brake more progressively.',
      why: 'The current release costs exit speed.',
      executionCue: 'Keep a light brake trace to the apex.',
      verify: 'Compare minimum speed next lap.',
      evidence: ['Corner 3 rotation phase: +0.084s', 'Minimum speed: 62 km/h vs 67 km/h baseline'],
      estimatedGainSec: 0.245,
    }],
  },
  cached: false,
  modelUsed: 'gemini-3.7-flash',
  generatedAt: '2026-09-14T12:00:00.000Z',
  tokensUsed: { prompt: 100, completion: 50, total: 150 },
};

describe('AIReportTab', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prompts the user when no completed trajectory is selected', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: false }),
    });

    render(
      <AIReportTab
        trajectory={null}
        baselineTrajectory={null}
        baselineLapNumber={null}
        segments={[]}
      />
    );

    expect(screen.getByText(/select a completed lap to generate an ai report/i)).toBeInTheDocument();
  });

  it('shows the unconfigured state and keeps generation disabled', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: false }),
    });

    render(
      <AIReportTab
        trajectory={trajectory}
        baselineTrajectory={null}
        baselineLapNumber={null}
        segments={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/configure a gemini api key in settings/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /generate ai report/i })).toBeDisabled();
  });

  it('generates and regenerates a report when configured', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ configured: true }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(reportResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...reportResponse, cached: true }) });

    render(
      <AIReportTab
        trajectory={trajectory}
        baselineTrajectory={null}
        baselineLapNumber={null}
        segments={[]}
        carClass="LMGT3"
        carModel="Ferrari 296 GT3"
      />
    );

    const generateButton = await screen.findByRole('button', { name: /generate ai report/i });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/brake later and carry more speed/i)).toBeInTheDocument();
      expect(screen.getByText(/potential lap-time gain: 0\.245s/i)).toBeInTheDocument();
      expect(screen.getByText(/corner 3 rotation phase: \+0\.084s/i)).toBeInTheDocument();
      expect(screen.getByText(/150 tokens/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      body: expect.stringContaining('"forceRegenerate":true'),
    }));
  });

  it('maps API errors to an actionable message and request id', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ configured: true }) })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          errorCode: 'rate_limited',
          error: 'Too many requests',
          requestId: 'request-123',
        }),
      });

    render(
      <AIReportTab
        trajectory={trajectory}
        baselineTrajectory={null}
        baselineLapNumber={null}
        segments={[]}
      />
    );

    const generateButton = await screen.findByRole('button', { name: /generate ai report/i });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/rate-limiting requests/i);
      expect(screen.getByRole('alert')).toHaveTextContent(/request-123/i);
    });
  });
});
