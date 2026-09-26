import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboardMetrics } from '../../src/components/dashboard/useDashboardMetrics.js';
import { DashboardSessionItem } from '../../src/components/dashboard/useDashboardMetrics.js';
import type { LapData } from '../../server/core/types.js';

function makeSession(overrides: Partial<DashboardSessionItem> = {}): DashboardSessionItem {
  return {
    id: 's-1',
    filename: 'session.xml',
    trackVenue: 'Algarve International Circuit',
    trackLengthMeters: 4653,
    timeString: '2026-01-01 12:00:00',
    sessionType: 'Practice',
    sessionName: 'P1',
    driversCount: 1,
    playerDriver: {
      name: 'Player',
      carType: 'Ferrari 499P',
      carClass: 'Hypercar',
      bestLapTime: 100,
      bestLapTimeString: '1:40.000',
      bestS1: 30,
      bestS2: 35,
      bestS3: 35,
      theoreticalBest: 100,
      theoreticalBestString: '1:40.000',
      lapsCount: 3,
      laps: [
        { lapNum: 1, lapTime: 100, isValid: true, isPitStop: false, topSpeed: 280 },
        { lapNum: 2, lapTime: 101, isValid: true, isPitStop: false, topSpeed: 281 },
        { lapNum: 3, lapTime: 102, isValid: true, isPitStop: false, topSpeed: 279 },
      ],
    },
    ...overrides,
  } as unknown as DashboardSessionItem;
}

describe('useDashboardMetrics', () => {
  it('computes both lap counts and distance in km per track and per car', () => {
    const sessions = [makeSession()];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    expect(result.current.rankedTracks).toEqual([
      { track: 'Algarve International Circuit', laps: 3, km: (4653 / 1000) * 3 },
    ]);
    expect(result.current.rankedCars).toEqual([
      { car: 'Ferrari 499P', laps: 3, km: (4653 / 1000) * 3 },
    ]);
  });

  it('accumulates km across multiple sessions on the same track', () => {
    const sessions = [
      makeSession({ id: 's-1' }),
      makeSession({
        id: 's-2',
        trackLengthMeters: 4653,
        playerDriver: {
          ...makeSession().playerDriver!,
          lapsCount: 2,
          laps: [
            { lapNum: 1, lapTime: 95, isValid: true, isPitStop: false, topSpeed: 285 },
            { lapNum: 2, lapTime: 96, isValid: true, isPitStop: false, topSpeed: 286 },
          ] as unknown as LapData[],
        },
      }),
    ];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    const track = result.current.rankedTracks.find((t) => t.track === 'Algarve International Circuit');
    expect(track?.laps).toBe(5);
    expect(track?.km).toBeCloseTo((4653 / 1000) * 5, 5);
  });

  it('averages the benchmark pace percentage across sessions with a recorded pace category', () => {
    const sessions = [
      makeSession({
        id: 's-1',
        playerDriver: {
          ...makeSession().playerDriver!,
          bestLapPacePercentage: 101,
          bestLapPaceCategory: 'Competitive',
        },
      }),
      makeSession({
        id: 's-2',
        playerDriver: {
          ...makeSession().playerDriver!,
          bestLapPacePercentage: 105,
          bestLapPaceCategory: 'Midpack',
        },
      }),
    ];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    expect(result.current.averageBenchmarkPacePercentage).toBe(103);
    expect(result.current.averageBenchmarkPaceCategory).toBe('Good');
  });

  it('returns null benchmark pace when no session has a recorded pace category', () => {
    const sessions = [makeSession()];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    expect(result.current.averageBenchmarkPacePercentage).toBeNull();
    expect(result.current.averageBenchmarkPaceCategory).toBeNull();
  });

  it('sorts Best Position by session importance (Race, then Qualifying, then Practice) before position', () => {
    const sessions = [
      makeSession({ id: 'practice-p1', sessionType: 'Practice', sessionName: 'P1', playerDriver: { ...makeSession().playerDriver!, position: 1 } }),
      makeSession({ id: 'qualifying-p2', sessionType: 'Qualifying', sessionName: 'Q1', playerDriver: { ...makeSession().playerDriver!, position: 2 } }),
      makeSession({ id: 'race-p5', sessionType: 'Race', sessionName: 'R1', playerDriver: { ...makeSession().playerDriver!, position: 5 } }),
      makeSession({ id: 'race-p1', sessionType: 'Race', sessionName: 'R2', playerDriver: { ...makeSession().playerDriver!, position: 1 } }),
    ];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'pos-asc',
      })
    );

    expect(result.current.sortedSessions.map((s) => s.id)).toEqual([
      'race-p1',
      'race-p5',
      'qualifying-p2',
      'practice-p1',
    ]);
  });

  it('calculates clean laps excluding start laps, pit stops, and out-laps while keeping total laps intact', () => {
    const sessions = [
      makeSession({
        id: 's-clean-test',
        playerDriver: {
          ...makeSession().playerDriver!,
          lapsCount: 6,
          laps: [
            { lapNum: 1, lapTime: 105, isValid: true, isPitStop: false }, // start lap excluded
            { lapNum: 2, lapTime: 100, isValid: true, isPitStop: false }, // clean flying lap 1
            { lapNum: 3, lapTime: 101, isValid: true, isPitStop: false }, // clean flying lap 2
            { lapNum: 4, lapTime: 130, isValid: true, isPitStop: true },  // in-lap / pit stop excluded
            { lapNum: 5, lapTime: 140, isValid: true, isOutLap: true },   // out-lap excluded
            { lapNum: 6, lapTime: 102, isValid: true, isPitStop: false }, // clean flying lap 3
          ] as unknown as LapData[],
        },
      }),
    ];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    // Total laps must preserve all 6 completed laps
    expect(result.current.totalLaps).toBe(6);
    // Clean laps must only count the 3 clean flying laps (laps 2, 3, 6)
    expect(result.current.cleanLaps).toBe(3);
    expect(result.current.cleanLapsPercentage).toBe(50);
  });

  it('preserves clean laps fallback when session has avgLapTime and lapsCount but no laps array', () => {
    const sessions = [
      makeSession({
        id: 's-no-laps-array',
        playerDriver: {
          ...makeSession().playerDriver!,
          lapsCount: 4,
          avgLapTime: 101.5,
          laps: undefined,
        },
      }),
    ];

    const { result } = renderHook(() =>
      useDashboardMetrics({
        sessions,
        selectedTrack: 'All',
        selectedCarClass: 'All',
        filterType: 'All',
        searchQuery: '',
        hideEmpty: false,
        sortBy: 'date-desc',
      })
    );

    expect(result.current.totalLaps).toBe(4);
    expect(result.current.cleanLaps).toBe(4);
    expect(result.current.cleanLapsPercentage).toBe(100);
  });
});
