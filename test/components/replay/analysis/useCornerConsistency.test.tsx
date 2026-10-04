import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCornerConsistency } from '../../../../src/components/replay/analysis/useCornerConsistency.js';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../server/core/types.js';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 };

function lapSummary(lapNumber: number, lapTimeSec: number, options: { isValid?: boolean; isOutlap?: boolean; isPitStop?: boolean } = {}) {
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
  it('does not time the current pit in-lap or fetch other pit laps', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const current = trajectory(2, [lapSummary(2, 110, { isPitStop: true }), lapSummary(3, 120, { isPitStop: true })]);
    const { result } = renderHook(() => useCornerConsistency(true, 'pit.vcr', null, 1, current));
    expect(result.current.lapsSampled).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('leaves canonical corner consistency unavailable without local track geometry',()=>{
    const fetchMock=vi.fn();global.fetch=fetchMock;
    const data:ReplayTrajectoryData={...trajectory(1),stationSource:'odometer'};
    const {result}=renderHook(()=>useCornerConsistency(true,'Test.Vcr',null,null,data));
    expect(result.current.cornerStats).toEqual([]);expect(result.current.lapsSampled).toBe(0);expect(fetchMock).not.toHaveBeenCalled();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays empty and lazy while disabled or without trajectory points', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const current = trajectory(1, [lapSummary(2, 100)]);
    const disabled = renderHook(() => useCornerConsistency(false, 'missing.vcr', null, 1, current));
    expect(disabled.result.current).toEqual({ cornerStats: [], isLoading: false, lapsSampled: 0 });
    const missing = renderHook(() => useCornerConsistency(true, 'missing.vcr', null, 1, null));
    expect(missing.result.current).toEqual({ cornerStats: [], isLoading: false, lapsSampled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('settles without repeatedly recomputing when lap summaries are missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const current = { ...trajectory(1), laps: undefined };
    const hook = renderHook(() => useCornerConsistency(true, 'no-laps.vcr', null, 3, current));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.lapsSampled).toBe(1);
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

  it('refetches comparison laps after a remount and uses the selected telemetry source', async () => {
    let resolveFresh!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ points: [{ x: 1, y: 0, z: 0, speedKmh: 110, timeSec: 0.5 }] }), { status: 200 }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFresh = resolve; }));
    const current = { ...trajectory(1, [lapSummary(1, 100, { isValid: true }), lapSummary(2, 101)]), source: 'vcr' as const };
    const first = renderHook(() => useCornerConsistency(true, 'cached-consistency.vcr', null, 3, current));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('source=vcr');
    first.unmount();

    expect(first.result.current.lapsSampled).toBe(2);
    const second = renderHook(() => useCornerConsistency(true, 'cached-consistency.vcr', null, 3, current));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.result.current).toEqual({ cornerStats: [], isLoading: true, lapsSampled: 0 });
    await act(async () => resolveFresh(new Response(JSON.stringify({ points: [] }), { status: 200 })));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.lapsSampled).toBe(1);
  });

  it('discards delayed results when telemetry inputs change', async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ points: [{ x: 1, y: 0, z: 0, speedKmh: 110, timeSec: 0.5 }] }), { status: 200 }));
    const oldTrajectory: ReplayTrajectoryData = { ...trajectory(1, [lapSummary(1, 100), lapSummary(2, 101)]), source: 'vcr' };
    const newTrajectory: ReplayTrajectoryData = { ...trajectory(1, [lapSummary(1, 100), lapSummary(3, 99)]), source: 'duckdb' };
    const hook = renderHook(({ data }) => useCornerConsistency(true, 'changing.vcr', null, 3, data), { initialProps: { data: oldTrajectory } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    hook.rerender({ data: newTrajectory });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('lap=3');
    expect(String(fetchMock.mock.calls[1][0])).toContain('source=duckdb');
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => resolveOld(new Response(JSON.stringify({ points: [] }), { status: 200 })));
    expect(hook.result.current.lapsSampled).toBe(2);
  });

  it('clears pending results when the consistency view is disabled', async () => {
    let resolvePending!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { resolvePending = resolve; }));
    const current = trajectory(1, [lapSummary(1, 100), lapSummary(2, 101)]);
    const hook = renderHook(({ enabled }) => useCornerConsistency(enabled, 'pending.vcr', null, 3, current), { initialProps: { enabled: true } });
    await waitFor(() => expect(resolvePending).toBeDefined());
    hook.rerender({ enabled: false });
    expect(hook.result.current).toEqual({ cornerStats: [], isLoading: false, lapsSampled: 0 });
    await act(async () => resolvePending(new Response(JSON.stringify({ points: [{ x: 1, y: 0, z: 0, speedKmh: 100, timeSec: 0.5 }] }), { status: 200 })));
    expect(hook.result.current).toEqual({ cornerStats: [], isLoading: false, lapsSampled: 0 });
  });
});
