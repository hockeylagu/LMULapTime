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
    replayName: params.get('replayName'),
    initialLapNumber: Number(params.get('lap')),
    initialDriverName: params.get('driverName'),
    initialCompareMode: Boolean(params.get('baselineReplay')),
    initialBaselineReplayName: params.get('baselineReplay'),
    initialBaselineLapNumber: Number(params.get('compareLapNum')),
    initialBaselineDriverName: params.get('compareDriver'),
    onLapChange: lap => updateSearchParams(params, setParams, { lap: String(lap) }),
  });
  return { ...inspector, params };
}

afterEach(() => vi.restoreAllMocks());

it.each([false, true])('swaps exact lap identities through route updates (same replay: %s)', async sameReplay => {
  const primaryReplay = 'Spa_P1.Vcr';
  const baselineReplay = sameReplay ? primaryReplay : 'Spa_Q1.Vcr';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.includes('/compare/laps')) return Response.json({ laps: [] });
    const replayName = decodeURIComponent(url.pathname.split('/')[3]);
    if (url.pathname.endsWith('/metadata')) {
      const metadata: ReplayMetadata = {
        filename: replayName, filePath: replayName, fileSizeBytes: 1, mtimeMs: 1,
        trackName: 'Spa', displayTrack: 'Spa', sessionType: 'Practice',
        timeSliceCount: 2, totalEvents: 1, durationSec: 100,
        drivers: [
          { slot: 2, name: 'Player', isPlayer: true, carClass: 'LMGT3' },
          { slot: 3, name: 'Rival', carClass: 'LMGT3' },
        ],
      };
      return Response.json(metadata);
    }
    const driverName = url.searchParams.get('driverName') ?? (url.searchParams.get('driverSlot') === '3' ? 'Rival' : 'Player');
    const lap = Number(url.searchParams.get('lap') ?? 1);
    const trajectory: ReplayTrajectoryData = {
      replayName, currentLap: lap, driverName, driverSlot: driverName === 'Rival' ? 3 : 2,
      pointsCount: 2, maxPoints: 2400, isFullResolution: false,
      points: [{ x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 }, { x: 10, y: 0, z: 0, speedKmh: 100, timeSec: 1 }],
      laps: [{ lapNumber: lap, lapTimeSec: 100, s1Sec: 30, s2Sec: 35, s3Sec: 35, isValid: true }],
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 },
    };
    return Response.json(trajectory);
  });
  const query = new URLSearchParams({
    replayName: primaryReplay, lap: '2', driverName: 'Player',
    baselineReplay, compareLapNum: '4', compareDriver: 'Rival',
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
      expect(result.current.trajectory).toMatchObject({ replayName: swapped ? baselineReplay : primaryReplay, currentLap: swapped ? 4 : 2, driverName: swapped ? 'Rival' : 'Player' });
      expect(result.current.baselineTrajectory).toMatchObject({ replayName: swapped ? primaryReplay : baselineReplay, currentLap: swapped ? 2 : 4, driverName: swapped ? 'Player' : 'Rival' });
    });
    expect(result.current.params.get('replayName')).toBe(swapped ? baselineReplay : primaryReplay);
    expect(result.current.params.get('lap')).toBe(swapped ? '4' : '2');
    expect(result.current.params.get('driverName')).toBe(swapped ? 'Rival' : 'Player');
    expect(result.current.params.get('baselineReplay')).toBe(swapped ? primaryReplay : baselineReplay);
    expect(result.current.params.get('compareLapNum')).toBe(swapped ? '2' : '4');
    expect(result.current.params.get('compareDriver')).toBe(swapped ? 'Player' : 'Rival');
  }
});
