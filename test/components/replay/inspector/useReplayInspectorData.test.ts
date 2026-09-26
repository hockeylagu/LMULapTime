import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReplayInspectorData } from '../../../../src/components/replay/inspector/useReplayInspectorData.js';
import { ComparableLap, ReplayMetadata, ReplayTrajectoryData } from '../../../../server/core/types.js';

const metadata: ReplayMetadata = {
  filename: 'Inspector_Test_P1.Vcr', filePath: '/tmp/Inspector_Test_P1.Vcr', fileSizeBytes: 1,
  mtimeMs: 1, trackName: 'Spa', displayTrack: 'Spa', trackCourse: 'Grand Prix', sessionType: 'Practice',
  timeSliceCount: 2, totalEvents: 1, durationSec: 2,
  drivers: [
    { slot: 2, name: 'Player Driver', isPlayer: true, vehicleId: '21_26_AFCO95641716' },
    { slot: 3, name: 'Other Driver', vehicleId: '21_26_AFCO95641716' },
  ],
};

const trajectory: ReplayTrajectoryData = {
  replayName: 'Inspector_Test_P1.Vcr', pointsCount: 2, driverSlot: 2, driverName: 'Player Driver', currentLap: 2,
  points: [
    { x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 },
    { x: 10, y: 0, z: 0, speedKmh: 180, timeSec: 1 },
  ],
  laps: [{ lapNumber: 2, lapTimeSec: 100, s1Sec: 30, s2Sec: 35, s3Sec: 35, isValid: true }],
  maxPoints: 2400, isFullResolution: false,
  bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 },
};

function response(value: unknown, ok = true): Response {
  return { ok, json: async () => value } as Response;
}

let observedSearch = '';

function SearchObserver({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  observedSearch = location.search;
  return React.createElement(React.Fragment, null, children);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    { initialEntries: ['/replay'] },
    React.createElement(SearchObserver, null, children),
  );
}

describe('useReplayInspectorData', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads metadata and trajectory, resolves the player driver, and exposes lap metrics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response(trajectory);
    });
    const onLapChange = vi.fn();
    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true, replayName: metadata.filename, onLapChange,
    }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.selectedDriverSlot).toBe(2);
    expect(result.current.selectedDriver?.name).toBe('Player Driver');
    // Speed smoothing is a centred time window, so the recording's end samples keep their values.
    expect(result.current.currentPoint?.speedKmh).toBe(100);
    expect(result.current.maxSpeed).toBe(180);
    expect(result.current.currentLapSummary?.lapTimeSec).toBe(100);
    expect(onLapChange).toHaveBeenCalledWith(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/metadata'));
  });

  it('asks for one point every 2 m by default, and every sample at full resolution', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response(trajectory);
    });
    const trajectoryUrls = () => fetchMock.mock.calls.map(([input]) => String(input)).filter(url => url.includes('/trajectory?'));
    const lastTrajectoryUrl = () => trajectoryUrls()[trajectoryUrls().length - 1];
    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, replayName: metadata.filename }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.telemetryResolution).toBe('high');
    expect(trajectoryUrls()[0]).toContain('trajectory?pointSpacingM=2&');

    act(() => result.current.handleChangeResolution('full'));
    await waitFor(() => expect(lastTrajectoryUrl()).toContain('trajectory?maxPoints=0&'));
    act(() => result.current.handleChangeResolution('standard'));
    await waitFor(() => expect(lastTrajectoryUrl()).toContain('trajectory?pointSpacingM=4&'));
  });

  it('reports metadata load failures and resets data when closed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(null, false));
    const { result, rerender } = renderHook(
      (props: { isOpen: boolean }) => useReplayInspectorData({ isOpen: props.isOpen, replayName: 'Failure_P1.Vcr' }),
      { initialProps: { isOpen: true }, wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain('Could not load metadata');

    rerender({ isOpen: false });
    await waitFor(() => expect(result.current.metadata).toBeNull());
    expect(result.current.trajectory).toBeNull();
    expect(result.current.activeReplayName).toBe('Failure_P1.Vcr');
  });

  it('filters comparison laps and updates comparison state and URL parameters', async () => {
    observedSearch = '';
    const comparisonLap: ComparableLap = {
      id: 'baseline-1', lapNum: 4, lapTime: 98, lapTimeString: '1:38.000',
      s1: 30, s2: 34, s3: 34, topSpeed: 250, isValid: true, isPitStop: false, isOutLap: false,
      matchingReplayFile: 'Baseline_Q1.Vcr', sessionId: 'session-42', driverName: 'Baseline Driver',
      carType: 'Test Car', carClass: 'LMGT3',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [comparisonLap, { ...comparisonLap, lapTime: 0 }] });
      return response(trajectory);
    });
    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true, replayName: metadata.filename,
    }), { wrapper });

    await waitFor(() => expect(result.current.availableCompareLaps).toHaveLength(1));
    act(() => result.current.handleSelectCompareLap(comparisonLap));
    expect(result.current.isCompareMode).toBe(true);
    expect(result.current.baselineReplayName).toBe('Baseline_Q1.Vcr');
    expect(result.current.baselineLapNumber).toBe(4);
    await waitFor(() => expect(observedSearch).toContain('compareSessionId=session-42'));
    await waitFor(() => expect(result.current.isBaselineLoading).toBe(false));

    act(() => result.current.handleRemoveCompare());
    expect(result.current.isCompareMode).toBe(false);
    expect(result.current.baselineReplayName).toBeNull();
  });

  it("offers comparison laps of the inspected driver's car class, not the replay player's", async () => {
    const multiclass: ReplayMetadata = {
      ...metadata,
      carClass: 'Hyper',
      drivers: [
        { slot: 2, name: 'Player Driver', isPlayer: true, vehicleId: '93_26_PEUG27100541', carModel: 'Peugeot 9X8', carClass: 'LMH' },
        { slot: 3, name: 'GT3 Driver', vehicleId: '92_25_MANT9651C55B', carModel: 'Porsche 911 GT3 R', carClass: 'LMGT3' },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(multiclass);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response(trajectory);
    });
    const compareClasses = () => fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter(url => url.includes('/compare/laps'))
      .map(url => new URL(url).searchParams.get('carClass'));

    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true, replayName: multiclass.filename,
    }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(compareClasses().slice(-1)[0]).toBe('LMH'));

    act(() => result.current.handleSelectDriver(3));
    await waitFor(() => expect(compareClasses().slice(-1)[0]).toBe('LMGT3'));
  });

  it('never compares against a lap of another car class', async () => {
    const multiclass: ReplayMetadata = {
      ...metadata,
      drivers: [
        { slot: 2, name: 'Player Driver', isPlayer: true, vehicleId: '93_26_PEUG27100541', carModel: 'Peugeot 9X8', carClass: 'LMH' },
        { slot: 3, name: 'Other Hypercar', vehicleId: '397_26_VLMDH', carModel: 'Cadillac V-Series.R', carClass: 'LMH' },
        { slot: 4, name: 'GT3 Driver', vehicleId: '92_25_MANT9651C55B', carModel: 'Porsche 911 GT3 R', carClass: 'LMGT3' },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(multiclass);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      if (url.includes('driverName=Other')) return response({ ...trajectory, driverName: 'Other Hypercar', driverSlot: 3 });
      return response(trajectory);
    });

    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true,
      replayName: multiclass.filename,
      initialCompareMode: true,
      initialBaselineReplayName: multiclass.filename,
      initialBaselineLapNumber: 2,
      initialBaselineDriverName: 'Other Hypercar',
    }), { wrapper });
    await waitFor(() => expect(result.current.baselineTrajectory?.driverName).toBe('Other Hypercar'));
    expect(result.current.baselineError).toBeNull();

    act(() => result.current.handleSelectDriver(4));
    await waitFor(() => expect(result.current.baselineTrajectory).toBeNull());
    expect(result.current.baselineError).toContain('same car class');
    expect(result.current.lapDeltas).toBeNull();

    act(() => result.current.handleSelectDriver(2));
    await waitFor(() => expect(result.current.baselineTrajectory?.driverName).toBe('Other Hypercar'));
    expect(result.current.baselineError).toBeNull();
  });

  it('initializes baseline replay, lap, and driver directly from comparison props', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      if (url.includes('&lap=5')) return response({ ...trajectory, currentLap: 5 });
      return response(trajectory);
    });

    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true,
      replayName: metadata.filename,
      initialCompareMode: true,
      initialBaselineReplayName: 'Daytona_Q1.Vcr',
      initialBaselineLapNumber: 5,
      initialBaselineDriverName: 'Samuel Lague',
    }), { wrapper });

    expect(result.current.isCompareMode).toBe(true);
    expect(result.current.baselineReplayName).toBe('Daytona_Q1.Vcr');
    expect(result.current.baselineLapNumber).toBe(5);
    expect(result.current.baselineDriverName).toBe('Samuel Lague');
    await waitFor(() => expect(result.current.isBaselineLoading).toBe(false));
  });
});
