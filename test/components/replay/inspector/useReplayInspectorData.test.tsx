import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReplayInspectorData } from '../../../../src/components/replay/inspector/useReplayInspectorData.js';
import type { ComparableLap, ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { requestUrl } from '../../../fixtures/requestUrl.js';

const metadata: ReplayMetadata = {
  filename: 'Inspector_Test_P1.Vcr', filePath: '/tmp/Inspector_Test_P1.Vcr', fileSizeBytes: 1,
  mtimeMs: 1, trackName: 'Spa', displayTrack: 'Spa', trackCourse: 'Grand Prix', sessionType: 'Practice',
  timeSliceCount: 2, totalEvents: 1, durationSec: 2,
  drivers: [
    { slot: 2, name: 'Player Driver', isPlayer: true, vehicleId: '21_26_AFCO95641716', sessionDriverOrdinal: 0, sessionLapOrdinals: { '2': 0 } },
    { slot: 3, name: 'Other Driver', vehicleId: '21_26_AFCO95641716', sessionDriverOrdinal: 1, sessionLapOrdinals: { '2': 0 } },
  ],
};

const trajectory: ReplayTrajectoryData = {
  replayName: 'Inspector_Test_P1.Vcr', sessionId: 'session-1', driverOrdinal: 0, lapOrdinal: 0,
  pointsCount: 2, driverSlot: 2, driverName: 'Player Driver', currentLap: 2,
  points: [
    { x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 },
    { x: 10, y: 0, z: 0, speedKmh: 180, timeSec: 1 },
  ],
  laps: [{ lapNumber: 2, lapTimeSec: 100, s1Sec: 30, s2Sec: 35, s3Sec: 35, isValid: true }],
  maxPoints: 2400, isFullResolution: false,
  bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 0, spanX: 10, spanZ: 0 },
};

function response(value: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: async () => value } as Response;
}

let observedSearch = '';
function SearchObserver({ children }: { children: React.ReactNode }) {
  observedSearch = useLocation().search;
  return React.createElement(React.Fragment, null, children);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, { initialEntries: ['/replay'] },
    React.createElement(SearchObserver, null, children));
}

describe('useReplayInspectorData session locators', () => {
  it.each(['source', 'resolution'] as const)('preserves the scrub location and chart range when changing %s', async change => {
    const dense: ReplayTrajectoryData = {
      ...trajectory, source: 'duckdb', trackLengthM: 1000, pointsCount: 11,
      points: Array.from({ length: 11 }, (_, i) => ({
        x: i * 10, y: 0, z: 0, distM: i * 10, stationM: i * 10, timeSec: i,
      })),
    };
    const sparse: ReplayTrajectoryData = {
      ...trajectory, source: 'vcr', trackLengthM: 1000, pointsCount: 6,
      // The replay's driven distance differs; canonical stations identify the same spot.
      points: Array.from({ length: 6 }, (_, i) => ({
        x: i * 20, y: 0, z: 0, distM: i * 22, stationM: i * 20, timeSec: 100 + i * 2,
      })),
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response(url.includes('source=vcr') || url.includes('pointSpacingM=4') ? sparse : dense);
    });
    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.trajectory?.points).toHaveLength(11));
    act(() => {
      result.current.setCurrentIndex(6);
      result.current.setChartZoomRange({ start: 2, end: 8 });
    });
    act(() => {
      if (change === 'source') result.current.handleSelectSource('vcr');
      else result.current.handleChangeResolution('standard');
    });
    await waitFor(() => expect(result.current.trajectory?.points).toHaveLength(6));
    expect(result.current.currentIndex).toBe(3);
    expect(result.current.currentPoint?.stationM).toBe(60);
    expect(result.current.chartZoomRange).toEqual({ start: 1, end: 4 });
    act(() => {
      if (change === 'source') result.current.handleSelectSource('duckdb');
      else result.current.handleChangeResolution('high');
    });
    await waitFor(() => expect(result.current.trajectory?.points).toHaveLength(11));
    expect(result.current.currentIndex).toBe(6);
    expect(result.current.chartZoomRange).toEqual({ start: 2, end: 8 });
  });

  it('remaps the latest scrub position if it moves while a new source loads', async () => {
    let completeSource: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      if (url.includes('source=vcr')) return new Promise<Response>(resolve => { completeSource = resolve; });
      return response(trajectory);
    });
    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.trajectory?.points).toHaveLength(2));
    act(() => result.current.handleSelectSource('vcr'));
    act(() => result.current.setCurrentIndex(1));
    await act(async () => completeSource?.(response({
      ...trajectory, pointsCount: 3,
      points: [trajectory.points[0], { x: 5, y: 0, z: 0, timeSec: 0.5 }, trajectory.points[1]],
    })));
    await waitFor(() => expect(result.current.currentIndex).toBe(2));
    expect(result.current.currentPoint?.x).toBe(10);
  });

  it('pages comparison laps as the server returns them and scopes same-session requests', async () => {
    const urls: URLSearchParams[] = [];
    const candidate = { id: 'first', sessionId: 'session-1', matchingReplayFile: metadata.filename,
      driverOrdinal: 0, lapOrdinal: 0, driverName: 'Player Driver', lapNumber: 2, lapTime: 100,
      isValid: true, isPitStop: false, isOutLap: false } as ComparableLap;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) {
        const params = new URL(url, 'http://localhost').searchParams;
        urls.push(params);
        const id = params.get('page') === '2' ? 'later' : 'first';
        return response({ laps: [{ ...candidate, id }], total: 51 });
      }
      return response(trajectory);
    });
    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.availableCompareLaps.map(lap => lap.id)).toEqual(['first']));
    expect(urls[urls.length - 1]?.get('telemetryOnly')).toBe('true');
    act(() => result.current.comparePagination.onPageChange(2));
    await waitFor(() => expect(result.current.availableCompareLaps.map(lap => lap.id)).toEqual(['later']));
    expect(result.current.comparePagination.total).toBe(51);
    act(() => result.current.setCompareLapFilter('same-sessions'));
    await waitFor(() => {
      expect(urls[urls.length - 1]?.get('sessionId')).toBe('session-1');
      expect(urls[urls.length - 1]?.get('page')).toBe('1');
      expect(result.current.availableCompareLaps.map(lap => lap.id)).toEqual(['first']);
    });
  });

  it('sends the picker order and filters to the server, returns to page 1 when they change and keeps the scope car types', async () => {
    const urls: URLSearchParams[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response({ ...metadata, weatherCondition: 'Wet' });
      if (url.includes('/compare/laps')) {
        urls.push(new URL(url, 'http://localhost').searchParams);
        // The server lists the car types on page 1 only.
        const page = new URL(url, 'http://localhost').searchParams.get('page');
        return response(page === '1' ? { laps: [], total: 120, carTypes: ['BMW M4 LMGT3', 'Lexus RCF LMGT3'] } : { laps: [], total: 120 });
      }
      return response(trajectory);
    });
    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.compareCarTypes).toEqual(['BMW M4 LMGT3', 'Lexus RCF LMGT3']));
    const first = urls[urls.length - 1];
    expect(first.get('sort')).toBe('lap');
    expect(first.get('condition')).toBe('Wet');
    expect(first.has('carType')).toBe(false);
    expect(first.has('sessionType')).toBe(false);

    act(() => result.current.comparePagination.onPageChange(3));
    await waitFor(() => expect(urls[urls.length - 1].get('page')).toBe('3'));
    await waitFor(() => expect(result.current.comparePagination.page).toBe(3));
    expect(result.current.compareCarTypes).toEqual(['BMW M4 LMGT3', 'Lexus RCF LMGT3']);
    act(() => result.current.setCompareControls({ sort: 'recent', carType: 'Lexus RCF LMGT3', sessionKind: 'race', condition: 'all' }));
    await waitFor(() => expect(result.current.comparePagination.page).toBe(1));
    await waitFor(() => {
      const last = urls[urls.length - 1];
      expect(last.get('page')).toBe('1');
      expect(last.get('sort')).toBe('recent');
      expect(last.get('carType')).toBe('Lexus RCF LMGT3');
      expect(last.get('sessionType')).toBe('race');
      expect(last.has('condition')).toBe(false);
    });
    act(() => result.current.setCompareControls({ ...result.current.compareControls, condition: 'Dynamic Weather' }));
    await waitFor(() => expect(urls[urls.length - 1].get('condition')).toBe('Dynamic Weather'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads metadata and telemetry by session ID and keeps driver/lap ordinals in the request', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response(trajectory);
    });

    const { result } = renderHook(() => useReplayInspectorData({
      isOpen: true, sessionId: 'session-1', initialDriverOrdinal: 0, initialLapOrdinal: 0,
    }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.trajectory?.sessionId).toBe('session-1');
    expect(urls).toContain('/api/session/session-1/telemetry/metadata');
    expect(urls.some(url => url.startsWith('/api/session/session-1/telemetry?') &&
      url.includes('driverOrdinal=0') && url.includes('lapOrdinal=0'))).toBe(true);
    expect(urls.some(url => url.includes('Inspector_Test_P1.Vcr/trajectory'))).toBe(false);
  });

  it('changes the selected driver using its session ordinal and updates route locators', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      if (url.includes('driverOrdinal=1')) return response({
        ...trajectory, driverOrdinal: 1, driverSlot: 3, driverName: 'Other Driver',
      });
      return response(trajectory);
    });

    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.handleSelectDriver(3));
    await waitFor(() => expect(result.current.trajectory?.driverOrdinal).toBe(1));

    expect(result.current.trajectory?.driverName).toBe('Other Driver');
    expect(urls.some(url => url.includes('driverOrdinal=1') && url.includes('lapOrdinal=0'))).toBe(true);
  });

  it('selects comparison candidates with session and ordinal locators in the URL', async () => {
    const candidate: ComparableLap = {
      id: 'other-session-lap', sessionId: 'session-2', driverOrdinal: 2, lapOrdinal: 4,
      driverName: 'Baseline Driver', carType: 'GT3', carClass: 'GT3', lapTime: 98,
 s1: 30, s2: 34, s3: 34, topSpeed: 200,
      isValid: true, isPitStop: false, matchingReplayFile: 'Baseline_Q1.Vcr',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [candidate] });
      if (url.startsWith('/api/session/session-2/telemetry/metadata')) return response(metadata);
      if (url.startsWith('/api/session/session-2/telemetry?')) return response({
        ...trajectory, sessionId: 'session-2', driverOrdinal: 2, lapOrdinal: 4, driverName: 'Baseline Driver',
      });
      return response(trajectory);
    });

    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.availableCompareLaps).toHaveLength(1));
    act(() => result.current.handleSelectCompareLap(candidate));
    await waitFor(() => expect(result.current.baselineTrajectory?.sessionId).toBe('session-2'));

    const params = new URLSearchParams(observedSearch);
    expect(params.get('baselineSessionId')).toBe('session-2');
    expect(params.get('baselineDriverOrdinal')).toBe('2');
    expect(params.get('baselineLapOrdinal')).toBe('4');
  });

  it('preserves the interpolated playback position when pausing so the car does not rewind', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = requestUrl(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) return response({ laps: [] });
      return response({
        ...trajectory,
        points: [
          { x: 0, y: 0, z: 0, speedKmh: 100, timeSec: 0 },
          { x: 5, y: 0, z: 0, speedKmh: 150, timeSec: 1 },
          { x: 10, y: 0, z: 0, speedKmh: 200, timeSec: 2 },
        ],
      });
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const { result } = renderHook(() => useReplayInspectorData({ isOpen: true, sessionId: 'session-1' }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(performance, 'now').mockReturnValue(1000);

    // Start playback
    act(() => {
      result.current.setIsPlaying(true);
    });

    // Advance 500ms (halfway between sample 0 and 1)
    act(() => {
      const nextFrame = rafCallbacks.shift();
      nextFrame?.(1500);
    });

    // Check position during playback: index 0, fraction ~0.5
    const snapshotDuringPlay = result.current.playbackCursor.getSnapshot();
    expect(snapshotDuringPlay).not.toBeNull();
    expect(snapshotDuringPlay?.index).toBe(0);
    expect(snapshotDuringPlay?.fraction).toBeCloseTo(0.5, 1);

    // Pause playback
    act(() => {
      result.current.setIsPlaying(false);
    });

    // The cursor snapshot MUST NOT be cleared or rewound to fraction 0!
    const snapshotAfterPause = result.current.playbackCursor.getSnapshot();
    expect(snapshotAfterPause).not.toBeNull();
    expect(snapshotAfterPause?.index).toBe(0);
    expect(snapshotAfterPause?.fraction).toBeCloseTo(0.5, 1);

    // Resuming playback continues from the exact fractional position rather than resetting to 0
    act(() => {
      vi.spyOn(performance, 'now').mockReturnValue(2000);
      result.current.setIsPlaying(true);
    });
    act(() => {
      const nextFrame = rafCallbacks.shift();
      nextFrame?.(2250); // advance 250ms more (total 750ms -> fraction 0.75)
    });
    const snapshotAfterResume = result.current.playbackCursor.getSnapshot();
    expect(snapshotAfterResume?.index).toBe(0);
    expect(snapshotAfterResume?.fraction).toBeCloseTo(0.75, 1);

    // Manually scrubbing (selecting an index) clears the cursor back to the discrete sample
    act(() => {
      result.current.setCurrentIndex(2);
    });
    expect(result.current.playbackCursor.getSnapshot()).toBeNull();
    expect(result.current.currentIndex).toBe(2);
  });
});
