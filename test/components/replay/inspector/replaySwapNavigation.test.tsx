import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useReplayInspectorData } from '../../../../src/components/replay/inspector/useReplayInspectorData.js';
import { updateSearchParams } from '../../../../src/utils/urlParams.js';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';

function useRoutedInspector() {
  const [params, setParams] = useSearchParams();
  const inspector = useReplayInspectorData({
    isOpen: true,
    sessionId: params.get('sessionId'),
    initialLapOrdinal: Number(params.get('lapOrdinal')),
    initialDriverOrdinal: Number(params.get('driverOrdinal') ?? 0),
    initialCompareMode: Boolean(params.get('baselineSessionId')),
    initialBaselineSessionId: params.get('baselineSessionId'),
    initialBaselineLapOrdinal: Number(params.get('baselineLapOrdinal')),
    initialBaselineDriverOrdinal: Number(params.get('baselineDriverOrdinal') ?? 0),
    onLocatorChange: (driver, lap) => updateSearchParams(params, setParams, {
      driverOrdinal: String(driver), lapOrdinal: String(lap),
    }),
  });
  return { ...inspector, params };
}

afterEach(() => vi.restoreAllMocks());

it.each([false, true])('swaps exact session and lap locators through route updates (same session: %s)', async sameSession => {
  const primarySession = 'session-primary';
  const baselineSession = sameSession ? primarySession : 'session-baseline';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.includes('/compare/laps')) return Response.json({ laps: [] });
    const sessionId = decodeURIComponent(url.pathname.split('/')[3]);
    if (url.pathname.endsWith('/metadata')) {
      const metadata: ReplayMetadata = {
        filename: `${sessionId}.Vcr`, filePath: sessionId, fileSizeBytes: 1, mtimeMs: 1,
        trackName: 'Spa', displayTrack: 'Spa', sessionType: 'Practice',
        timeSliceCount: 2, totalEvents: 1, durationSec: 100,
        drivers: [
          { slot: 2, name: 'Player', isPlayer: true, carClass: 'LMGT3', sessionDriverOrdinal: 0, sessionLapOrdinals: { '3': 2 } },
          { slot: 3, name: 'Rival', carClass: 'LMGT3', sessionDriverOrdinal: 1, sessionLapOrdinals: { '5': 4 } },
        ],
      };
      return Response.json(metadata);
    }
    const driverOrdinal = Number(url.searchParams.get('driverOrdinal') ?? 0);
    const lapOrdinal = Number(url.searchParams.get('lapOrdinal') ?? 0);
    const driverName = driverOrdinal === 1 ? 'Rival' : 'Player';
    const lap = lapOrdinal + 1;
    const trajectory: ReplayTrajectoryData = {
      replayName: `${sessionId}.Vcr`, sessionId, driverOrdinal, lapOrdinal,
      currentLap: lap, driverName, driverSlot: driverOrdinal === 1 ? 3 : 2,
      pointsCount: 2, maxPoints: 2400, isFullResolution: false,
      points: [{ x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 }, { x: 10, y: 0, z: 0, speedKmh: 100, timeSec: 1 }],
      laps: [{ lapNumber: lap, lapTimeSec: 100, s1Sec: 30, s2Sec: 35, s3Sec: 35, isValid: true }],
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 },
    };
    return Response.json(trajectory);
  });
  const query = new URLSearchParams({
    sessionId: primarySession, lapOrdinal: '2', driverOrdinal: '0',
    baselineSessionId: baselineSession, baselineDriverOrdinal: '1', baselineLapOrdinal: '4',
  });
  function wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[`/telemetry?${query}`]}>{children}</MemoryRouter>;
  }
  const { result } = renderHook(useRoutedInspector, { wrapper });
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isBaselineLoading).toBe(false);
    expect(result.current.baselineTrajectory?.driverName).toBe('Rival');
  });
  for (const swapped of [true, false]) {
    act(() => result.current.handleSwapBaseline());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isTrajLoading).toBe(false);
      expect(result.current.isBaselineLoading).toBe(false);
      expect(result.current.trajectory).toMatchObject({
        sessionId: swapped ? baselineSession : primarySession,
        driverOrdinal: swapped ? 1 : 0,
        lapOrdinal: swapped ? 4 : 2,
      });
      expect(result.current.baselineTrajectory).toMatchObject({
        sessionId: swapped ? primarySession : baselineSession,
        driverOrdinal: swapped ? 0 : 1,
        lapOrdinal: swapped ? 2 : 4,
      });
    });
    expect(result.current.params.get('sessionId')).toBe(swapped ? baselineSession : primarySession);
    expect(result.current.params.get('lapOrdinal')).toBe(swapped ? '4' : '2');
    expect(result.current.params.get('driverOrdinal')).toBe(swapped ? '1' : '0');
    expect(result.current.params.get('baselineSessionId')).toBe(swapped ? primarySession : baselineSession);
    expect(result.current.params.get('baselineLapOrdinal')).toBe(swapped ? '2' : '4');
    expect(result.current.params.get('baselineDriverOrdinal')).toBe(swapped ? '0' : '1');
  }
});
