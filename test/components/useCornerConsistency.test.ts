import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCornerConsistency } from '../../src/components/replay/analysis/useCornerConsistency.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../../server/core/types.js';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 };

function lapSummary(lapNumber: number, lapTimeSec: number, options: { isValid?: boolean; isOutlap?: boolean } = {}) {
  return { lapNumber, lapTimeSec, s1Sec: 0, s2Sec: 0, s3Sec: 0, ...options };
}

function trajectory(currentLap: number, laps: ReplayTrajectoryData['laps'] = []): ReplayTrajectoryData {
  return {
    replayName: 'Consistency_Test_P1.Vcr',
    pointsCount: 2,
    currentLap,
    laps,
    points: [
      { x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 },
      { x: 10, y: 0, z: 0, speedKmh: 120, timeSec: 1 },
    ],
    maxPoints: 400,
    isFullResolution: false,
    bounds,
  };
}

describe('useCornerConsistency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays empty and does not fetch while disabled or without trajectory points', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useCornerConsistency(true, 'missing.vcr', null, 1, null));
    expect(result.current).toEqual({ cornerStats: [], isLoading: false, lapsSampled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches valid comparison laps and includes the current valid lap', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      points: [{ x: 1, y: 0, z: 0, speedKmh: 110, timeSec: 0.5 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const current = trajectory(3, [
      lapSummary(2, 101, { isValid: true }),
      lapSummary(3, 100, { isValid: true }),
      lapSummary(4, 99, { isValid: false }),
      lapSummary(5, 98, { isOutlap: true }),
    ]);

    const { result } = renderHook(() => useCornerConsistency(true, 'valid-consistency.vcr', null, 1, current));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('lap=2');
    expect(result.current.lapsSampled).toBe(2);
  });

  it('handles failed comparison fetches without rejecting the hook', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const current = trajectory(2, [lapSummary(1, 100, { isValid: true })]);
    const { result } = renderHook(() => useCornerConsistency(true, 'failed-consistency.vcr', null, null, current));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lapsSampled).toBe(1);
    expect(result.current.cornerStats).toEqual([]);
  });

  it('does not sample an invalid current lap when no other valid laps exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockClear();
    const metadata = { laps: [{ lapNumber: 7, lapTimeSec: 100, isValid: false }] } as ReplayMetadata;
    const current = trajectory(7, [lapSummary(7, 100, { isValid: false })]);
    const { result } = renderHook(() => useCornerConsistency(true, 'invalid-current.vcr', metadata, 2, current));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.lapsSampled).toBe(0);
  });

  it('reuses the module cache when the same replay and lap are requested again', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ points: [] }), { status: 200 }));
    const current = trajectory(1, [lapSummary(1, 100, { isValid: true })]);
    const first = renderHook(() => useCornerConsistency(true, 'cached-consistency.vcr', null, 3, current));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(0);

    const second = renderHook(() => useCornerConsistency(true, 'cached-consistency.vcr', null, 3, current));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
