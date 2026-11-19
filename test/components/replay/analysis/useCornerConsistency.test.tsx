import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCornerConsistency } from '../../../../src/components/replay/analysis/useCornerConsistency.js';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { CornerPass, CornerPassLap, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';
import { requestUrl } from '../../../fixtures/requestUrl.js';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 };

function lapSummary(lapNumber: number, lapTimeSec: number, options: { isValid?: boolean; isOutLap?: boolean; isPitStop?: boolean } = {}) {
  return { lapNumber, lapTimeSec, s1Sec: 0, s2Sec: 0, s3Sec: 0, isValid: true, ...options };
}

function trajectory(currentLap: number, laps: ReplayTrajectoryData['laps'] = []): ReplayTrajectoryData {
  return {
    replayName: 'Consistency_Test_P1.Vcr',
    sessionId: 'consistency-session',
    driverOrdinal: 0,
    lapOrdinal: 0,
    pointsCount: 0,
    currentLap,
    laps,
    points: [],
    maxPoints: 400,
    isFullResolution: false,
    stationSource: 'track',
    geometryRevision: 'synthetic-canonical-track-v1',
    bounds,
  };
}

function pass(lapNumber: number, durationSec: number): CornerPass {
  return {
    slot: 3, lapNumber, segment: 1, entrySec: lapNumber * 100, minSpeedSec: lapNumber * 100 + 1, exitSec: lapNumber * 100 + durationSec,
    entrySpeedKmh: 200, minSpeedKmh: 90, exitSpeedKmh: 150, minSpeedM: 500, brakeM: 420, turnInM: 460, throttleM: 520,
    aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null,
  };
}

function served(lapNumber: number, options: Partial<CornerPassLap> = {}): CornerPassLap {
  return { slot: 3, lapNumber, startSec: lapNumber * 100, endSec: lapNumber * 100 + 100, isValid: true, isPitStop: false, isOutLap: false, wet: false, ...options };
}

function built(passes: CornerPass[], laps: CornerPassLap[] = passes.map(item => served(item.lapNumber))): SessionCornerPasses {
  return {
    available: true, layoutKey: 'test', startStationM: 0, trackLengthM: 1000,
    turns: [{ id: 1, label: 'T1', title: 'Turn 1', apexM: 500, startM: 400, endM: 600 }],
    cars: [{ slot: 3, name: 'Driver', sessionDriverOrdinal: 0 }],
    passes, laps, contacts: [],
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const metadata: ReplayMetadata = {
  filename: 'Consistency_Test_P1.Vcr', filePath: 'Consistency_Test_P1.Vcr', fileSizeBytes: 1, mtimeMs: 1,
  trackName: 'Spa', sessionType: 'Practice', timeSliceCount: 1, totalEvents: 0, durationSec: 100,
  drivers: [{ slot: 3, name: 'Driver', sessionDriverOrdinal: 2 }],
};

describe('useCornerConsistency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays empty and lazy while disabled or without a session', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const disabled = renderHook(() => useCornerConsistency(false, 'session', null, 3, trajectory(1)));
    expect(disabled.result.current).toEqual({ cornerStats: [], isLoading: false, unavailableReason: null });
    renderHook(() => useCornerConsistency(true, null, null, 3, trajectory(1)));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('times each turn over the laps the corner card counts, from one request for the driver', async () => {
    // Lap 1 (the start) and lap 4 (a pit stop) do not count.
    const laps = [served(1), served(2), served(3), served(4, { isPitStop: true })];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(built([pass(1, 3), pass(2, 4.1), pass(3, 4.3), pass(4, 9)], laps)));
    const { result } = renderHook(() => useCornerConsistency(true, 'session', null, 3, trajectory(2)));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchMock.mock.calls[0][0])).toContain('/api/session/session/corner-passes?driverOrdinal=0');
    expect(result.current.cornerStats).toHaveLength(1);
    expect(result.current.cornerStats[0]).toMatchObject({ turnId: 1, label: 'T1', lapsSampled: 2 });
  });

  it('leaves out the laps unticked, and places each turn on the displayed lap', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(built([pass(2, 4.1), pass(3, 4.3), pass(4, 4.2)])));
    const current = { ...trajectory(2), points: [{ x: 0, y: 0, z: 0, stationM: 0 }, { x: 1000, y: 0, z: 0, stationM: 1000 }] };
    const excluded = new Set([3]);
    const placement = { dists: [0, 1000], corners: [{ cornerNumber: 2, entryDistM: 450, exitDistM: 550 }] };
    const { result } = renderHook(() => useCornerConsistency(true, 'session', null, 3, current, excluded, placement));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cornerStats[0]).toMatchObject({ lapsSampled: 2, lapDistM: 500, cornerNumber: 2 });
    expect(result.current.cornerStats[0].time.samples.map(s => s.lapNumber)).toEqual([2, 4]);
  });

  it('counts only the laps in the shown lap\'s conditions', async () => {
    const laps = [served(2), served(3, { wet: true }), served(4, { wet: true }), served(5)];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(built([pass(2, 4), pass(3, 6), pass(4, 6.2), pass(5, 4.1)], laps)));
    const { result } = renderHook(() => useCornerConsistency(true, 'session', null, 3, trajectory(3)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cornerStats[0].time.samples.map(s => s.lapNumber)).toEqual([3, 4]);
  });

  it('asks for the class sequences when the panel shows them, again when it switches', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(json(built([pass(2, 4.1), pass(3, 4.3)]))));
    const hook = renderHook(({ segments }) => useCornerConsistency(true, 'session', null, 3, trajectory(2), undefined, undefined, segments),
      { initialProps: { segments: 'sequences' as 'sequences' | 'turns' } });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(requestUrl(fetchMock.mock.calls[0][0])).toContain('/corner-passes?segments=sequences&driverOrdinal=0');
    hook.rerender({ segments: 'turns' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestUrl(fetchMock.mock.calls[1][0])).toContain('/corner-passes?driverOrdinal=0');
  });

  it('finds the driver from the replay metadata without a trajectory', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(built([])));
    const { result } = renderHook(() => useCornerConsistency(true, 'session', metadata, 3, null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requestUrl(fetchMock.mock.calls[0][0])).toContain('driverOrdinal=2');
  });

  it('says why when the passes are not built', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ available: false, reason: 'Corner times are still being built.' }));
    const { result } = renderHook(() => useCornerConsistency(true, 'session', null, 3, trajectory(1)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ cornerStats: [], unavailableReason: 'Corner times are still being built.' });
  });

  it('settles with the error message when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCornerConsistency(true, 'session', null, 3, trajectory(1)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unavailableReason).toBe('offline');
  });

  it('aborts and ignores the previous session when the session changes', async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(json(built([pass(1, 4)])));
    const current = trajectory(1, [lapSummary(1, 100)]);
    const hook = renderHook(({ sessionId }) => useCornerConsistency(true, sessionId, null, 3, current), { initialProps: { sessionId: 'old' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    hook.rerender({ sessionId: 'new' });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => resolveOld(json({ available: false, reason: 'old session' })));
    expect(hook.result.current.unavailableReason).toBeNull();
    expect(hook.result.current.isLoading).toBe(false);
  });

  it('drops the answer when the view is disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(built([pass(1, 4)])));
    const current = trajectory(1, [lapSummary(1, 100)]);
    const hook = renderHook(({ enabled }) => useCornerConsistency(enabled, 'session', null, 3, current), { initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    hook.rerender({ enabled: false });
    expect(hook.result.current).toEqual({ cornerStats: [], isLoading: false, unavailableReason: null });
  });
});
