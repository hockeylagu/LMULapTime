import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import {
  CompareRequest,
  deckOrder,
  defaultBaselineId,
  toggleComparedLap,
  useCompareLapsData,
} from '../../../src/components/compare-laps/useCompareLapsData.js';
import type { ComparableLap } from '../../../shared/types/index.js';

const laps = [
  {
    id: 'slow-player', sessionId: 'session-1', driverName: 'Player', lapNum: 2, lapTime: 101,
    s1: 30, s2: 34, s3: 37, isPlayer: true, isValid: true, carClass: 'LMGT3', pacePercentage: 101,
  },
  {
    id: 'fast-player', sessionId: 'session-1', driverName: 'Player', lapNum: 3, lapTime: 99,
    s1: 29, s2: 33, s3: 37, isPlayer: true, isValid: true, carClass: 'LMGT3', pacePercentage: 99,
  },
  {
    id: 'overall', sessionId: 'session-2', driverName: 'Rival', lapNum: 1, lapTime: 98,
    s1: 28, s2: 33, s3: 37, isPlayer: false, isValid: true, carClass: 'LMGT3', pacePercentage: 98,
  },
];

let navigateTo: (to: string) => void = () => {};

const NavigationBridge: React.FC = () => {
  navigateTo = useNavigate();
  return null;
};

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter initialEntries={['/compare']}>
    <NavigationBridge />
    {children}
  </MemoryRouter>
);

describe('useCompareLapsData selection fallbacks', () => {
  it('derives and adds personal, theoretical, and overall-best comparison laps', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        laps,
        allTimeBestLap: null,
        playerBestLap: null,
        overallTrackBestLap: laps[2],
        bestS1: 28,
        bestS2: 33,
        bestS3: 37,
        theoreticalBestSec: 98,
        benchmarks: [{ carClass: 'LMGT3', target100Sec: 97 }],
      }),
    });

    const { result } = renderHook(
      () => useCompareLapsData({ sessions: [{ id: 'session-1', trackVenue: 'Spa', trackCourse: 'GP' }] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.allTimePBObject?.id).toBe('fast-player'));

    result.current.handleAddPersonalBest();
    result.current.handleAddTheoreticalBest();
    result.current.handleAddOverallTrackBest();

    await waitFor(() => {
      expect(result.current.selectedLaps.some(lap => lap.isTheoreticalBest)).toBe(true);
      expect(result.current.selectedLaps.map(lap => lap.id)).toContain('overall');
    });
    expect(result.current.chartData).toHaveLength(4);
    expect(result.current.bestComparedS1).toBe(28);
  });

  it('updates comparison scope when the route query changes externally', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        laps,
        allTimeBestLap: null,
        playerBestLap: null,
        overallTrackBestLap: laps[2],
        bestS1: 28,
        bestS2: 33,
        bestS3: 37,
        theoreticalBestSec: 98,
        benchmarks: [],
      }),
    });

    const { result } = renderHook(
      () => useCompareLapsData({ sessions: [{ id: 'session-1', trackVenue: 'Spa', trackCourse: 'GP' }] }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => navigateTo('/compare?track=Monza&carClass=LMP2'));

    await waitFor(() => {
      expect(result.current.selectedTrack).toBe('Monza');
      expect(result.current.selectedCarClass).toBe('LMP2');
    });
  });

  it("drops the previous track's laps and reports the error when the next track fails to load", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url.includes('track=Monza')
      ? { ok: false, status: 500, json: () => Promise.resolve({ error: 'database is locked' }) }
      : { ok: true, status: 200, json: () => Promise.resolve({ laps, allTimeBestLap: null, overallTrackBestLap: laps[2], bestS1: 28, bestS2: 33, bestS3: 37, theoreticalBestSec: 98, benchmarks: [] }) })));

    const { result } = renderHook(
      () => useCompareLapsData({ sessions: [{ id: 'session-1', trackVenue: 'Spa', trackCourse: 'GP' }] }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.apiData.laps).toHaveLength(3));
    expect(result.current.loadError).toBeNull();

    act(() => navigateTo('/compare?track=Monza&carClass=LMGT3'));

    await waitFor(() => expect(result.current.loadError).toBe('database is locked'));
    expect(result.current.loading).toBe(false);
    expect(result.current.apiData.laps).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('never keeps the previous track’s laps in the comparison when the track changes in the URL', async () => {
    const monzaLap = { ...laps[1], id: 'monza-player', sessionId: 'session-3', lapTime: 107 };
    const reply = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('track=Monza')
      ? new Promise(resolve => setTimeout(() => resolve(reply({ laps: [monzaLap], allTimeBestLap: null, playerBestLap: monzaLap, benchmarks: [] })), 20))
      : reply({ laps, allTimeBestLap: null, playerBestLap: laps[1], benchmarks: [] })));

    const { result } = renderHook(
      () => useCompareLapsData({ sessions: [{ id: 'session-1', trackVenue: 'Spa', trackCourse: 'GP' }] }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.selectedLaps.map(lap => lap.id)).toEqual(['fast-player']));

    act(() => navigateTo('/compare?track=Monza&carClass=LMGT3'));

    await waitFor(() => expect(result.current.apiData.laps.map(lap => lap.id)).toEqual(['monza-player']));
    expect(result.current.selectedLaps.map(lap => lap.id)).toEqual(['monza-player']);
    vi.unstubAllGlobals();
  });
});

describe('the laps compared', () => {
  const lap = (id: string, isPlayer = false) => ({ id, isPlayer, driverName: id } as ComparableLap);
  const ids = (list: ComparableLap[]) => list.map((l) => l.id);

  it('keeps the two newest picks, and takes a lap out when it is picked again', () => {
    const one = toggleComparedLap([], lap('P1'));
    const two = toggleComparedLap(one, lap('P2'));
    expect(ids(two)).toEqual(['P1', 'P2']);
    expect(ids(toggleComparedLap(two, lap('P3')))).toEqual(['P2', 'P3']);
    expect(ids(toggleComparedLap(two, lap('P1')))).toEqual(['P2']);
  });

  it("measures the player's lap against the other driver's, and shows it on the left", () => {
    const pair = [lap('me', true), lap('rival')];
    expect(defaultBaselineId(pair)).toBe('rival');
    expect(ids(deckOrder(pair))).toEqual(['me', 'rival']);
    expect(defaultBaselineId([lap('P1'), lap('P2')])).toBe('P1');
    expect(ids(deckOrder([lap('P1'), lap('P2')]))).toEqual(['P1', 'P2']);
  });

  it('applies the picks and pairs the leaderboard asks for', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ laps, allTimeBestLap: null, playerBestLap: laps[1], benchmarks: [] }),
    });
    let compareRequest: CompareRequest | null = null;
    const { result, rerender } = renderHook(
      () => useCompareLapsData({ sessions: [{ id: 'session-1', trackVenue: 'Spa', trackCourse: 'GP' }], compareRequest }),
      { wrapper }
    );
    await waitFor(() => expect(ids(result.current.selectedLaps)).toEqual(['fast-player']));

    compareRequest = { key: 1, lap: lap('alien-1') };
    rerender();
    await waitFor(() => expect(ids(result.current.selectedLaps)).toEqual(['fast-player', 'alien-1']));
    expect(result.current.baselineLap?.id).toBe('alien-1');
    expect(ids(result.current.deckLaps)).toEqual(['fast-player', 'alien-1']);

    compareRequest = { key: 2, lap: lap('alien-2') };
    rerender();
    await waitFor(() => expect(ids(result.current.selectedLaps)).toEqual(['alien-1', 'alien-2']));
    expect(result.current.baselineLap?.id).toBe('alien-1');

    compareRequest = { key: 3, reference: lap('rival'), lap: lap('fast-player', true) };
    rerender();
    await waitFor(() => expect(ids(result.current.deckLaps)).toEqual(['fast-player', 'rival']));
    expect(result.current.baselineLap?.id).toBe('rival');
  });
});
