import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RaceReplayOverview, ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { createRaceClock } from '../../../../../src/components/replay/race/raceClock.js';

const fetchSessionTelemetry = vi.fn<(sessionId: string, request: {driverOrdinal: number; lapOrdinal: number; source?: string}) => Promise<ReplayTrajectoryData>>();
const loadReadoutLapExtras = vi.fn(() => Promise.resolve());
vi.mock('../../../../../src/api/replayApi.js', () => ({ fetchSessionTelemetry: (...args: Parameters<typeof fetchSessionTelemetry>) => fetchSessionTelemetry(...args) }));
vi.mock('../../../../../src/components/replay/inspector/readoutLapLoader.js', () => ({ loadReadoutLapExtras: () => loadReadoutLapExtras() }));
const { useRaceCockpitLap } = await import('../../../../../src/components/replay/view3d/race/useRaceCockpitLap.js');

const overview = {
  replayName: 'r', startSec: 0, endSec: 300, windowSec: 10, runningOrder: [], events: [], daylight: { sessionStartMinute: null, cloudCover: null },
  cars: [{ slot: 3, name: 'A', sessionDriverOrdinal: 1, sessionLapOrdinals: { '1': 10, '2': 11 } }, { slot: 4, name: 'B' }],
  laps: [
    { slot: 3, lapNumber: 1, startSec: 0, endSec: 100, lapTimeSec: 100, isValid: true },
    { slot: 3, lapNumber: 2, startSec: 100, endSec: 200, lapTimeSec: 100, isValid: true },
  ],
} as unknown as RaceReplayOverview;
const lapOf = (lapOrdinal: number) => ({ currentLap: lapOrdinal - 9, driverOrdinal: 1, points: [{ x: 0, z: 0, timeSec: 0 }] }) as unknown as ReplayTrajectoryData;

afterEach(() => { fetchSessionTelemetry.mockReset(); loadReadoutLapExtras.mockClear(); });

describe('useRaceCockpitLap', () => {
  it('loads the followed car\'s lap only while active, and the next one when it crosses the line', async () => {
    fetchSessionTelemetry.mockImplementation((_, request) => Promise.resolve(lapOf(request.lapOrdinal)));
    const clock = createRaceClock(0, 300, 50);
    const { result, rerender } = renderHook(({ active }) => useRaceCockpitLap(active, 's', overview, clock, 3), { initialProps: { active: false } });
    expect(result.current).toBeNull();
    expect(fetchSessionTelemetry).not.toHaveBeenCalled();
    rerender({ active: true });
    await waitFor(() => expect(result.current?.trajectory.currentLap).toBe(1));
    expect(fetchSessionTelemetry).toHaveBeenCalledWith('s', expect.objectContaining({ driverOrdinal: 1, lapOrdinal: 10, source: 'vcr' }), expect.anything());
    expect(result.current).toMatchObject({ slot: 3, startSec: 0 });
    expect(loadReadoutLapExtras).toHaveBeenCalledTimes(1);
    act(() => clock.seek(60));
    expect(fetchSessionTelemetry).toHaveBeenCalledTimes(1);
    act(() => clock.seek(150));
    await waitFor(() => expect(result.current).toMatchObject({ startSec: 100, trajectory: { currentLap: 2 } }));
    rerender({ active: false });
    expect(result.current).toBeNull();
  });

  it('loads nothing for a car that is not a session driver', () => {
    const clock = createRaceClock(0, 300, 50);
    const { result } = renderHook(() => useRaceCockpitLap(true, 's', overview, clock, 4));
    expect(result.current).toBeNull();
    expect(fetchSessionTelemetry).not.toHaveBeenCalled();
  });
});
