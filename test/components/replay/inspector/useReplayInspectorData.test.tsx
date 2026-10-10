import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReplayInspectorData } from '../../../../src/components/replay/inspector/useReplayInspectorData.js';
import type { ComparableLap, ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';

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
  it('pages comparison laps and scopes same-session requests while excluding missing replay links', async () => {
    const urls: URLSearchParams[] = [];
    const candidate = { id: 'first', sessionId: 'session-1', matchingReplayFile: metadata.filename,
      driverOrdinal: 0, lapOrdinal: 0, driverName: 'Player Driver', lapNum: 2, lapTime: 100,
      isValid: true, isPitStop: false, isOutLap: false } as ComparableLap;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/telemetry/metadata')) return response(metadata);
      if (url.includes('/compare/laps')) {
        const params = new URL(url, 'http://localhost').searchParams;
        urls.push(params);
        const id = params.get('page') === '2' ? 'later' : 'first';
        return response({ laps: [{ ...candidate, id }, { ...candidate, id: 'unavailable', matchingReplayFile: undefined }], total: 51 });
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

  afterEach(() => vi.restoreAllMocks());

  it('loads metadata and telemetry by session ID and keeps driver/lap ordinals in the request', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
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
      const url = String(input);
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
      driverName: 'Baseline Driver', carType: 'GT3', carClass: 'LMGT3', lapTime: 98,
      lapTimeString: '1:38.000', s1: 30, s2: 34, s3: 34, topSpeed: 200,
      isValid: true, isPitStop: false, matchingReplayFile: 'Baseline_Q1.Vcr',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
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
});
