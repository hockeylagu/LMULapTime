import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { useCompareLapsData } from '../../../src/components/compare-laps/useCompareLapsData.js';

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
    result.current.setPlayerOnly(false);
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
    act(() => navigateTo('/compare?track=Monza&carClass=LMP2&playerOnly=false&hideEmpty=false'));

    await waitFor(() => {
      expect(result.current.selectedTrack).toBe('Monza');
      expect(result.current.selectedCarClass).toBe('LMP2');
      expect(result.current.playerOnly).toBe(false);
      expect(result.current.hideEmpty).toBe(false);
    });
  });
});