import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboardTrends } from '../../src/components/dashboard/useDashboardTrends.js';
import type { SessionSummary } from '../../src/components/dashboard/Dashboard.js';

describe('useDashboardTrends', () => {
  it('returns safe defaults for empty sessions', () => {
    const { result } = renderHook(() => useDashboardTrends([]));
    expect(result.current.hasData).toBe(false);
    expect(result.current.driverName).toBe('Driver');
    expect(result.current.latestOuting).toBeNull();
    expect(result.current.todayActivity).toBeNull();
    expect(result.current.recentPaceTrend).toHaveLength(0);
    expect(result.current.paceTrendDirection).toBe('none');
  });

  it('detects driver name, latest outing, and calculates improving pace trend', () => {
    const mockSessions: SessionSummary[] = [
      {
        id: 'session-old',
        filename: 'old.xml',
        trackVenue: 'Circuit de Spa-Francorchamps',
        timeString: '2026/09/20 14:00:00',
        sessionType: 'Race',
        sessionName: 'Race 1',
        driversCount: 20,
        playerDriver: {
          name: 'Samuel Lague',
          carType: 'BMW M4 LMGT3',
          carClass: 'LMGT3',
          bestLapTime: 138.5,
          bestLapTimeString: '2:18.500',
          bestS1: 40,
          bestS2: 50,
          bestS3: 48.5,
          theoreticalBest: 138.5,
          theoreticalBestString: '2:18.500',
          bestLapPacePercentage: 103.5,
          bestLapPaceCategory: 'Good',
          position: 10,
          lapsCount: 8,
          laps: [
            { lapNum: 1, position: 12, lapTime: 140, lapTimeString: '2:20.000', s1: null, s2: null, s3: null, topSpeed: 280, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
            { lapNum: 2, position: 10, lapTime: 138.5, lapTimeString: '2:18.500', s1: null, s2: null, s3: null, topSpeed: 282, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
          ],
        },
      },
      {
        id: 'session-new',
        filename: 'new.xml',
        trackVenue: 'Circuit de la Sarthe',
        timeString: '2026/09/23 22:30:00',
        sessionType: 'Race',
        sessionName: 'Race 1',
        driversCount: 24,
        matchingReplayFile: {
          name: 'le_mans_gt3_100hz.Vcr',
          path: '/replays/le_mans_gt3_100hz.Vcr',
        },
        playerDriver: {
          name: 'Samuel Lague',
          carType: 'Chevrolet Corvette Z06 LMGT3.R',
          carClass: 'LMGT3',
          bestLapTime: 240.47,
          bestLapTimeString: '4:00.470',
          bestS1: 70,
          bestS2: 90,
          bestS3: 80.47,
          theoreticalBest: 240.47,
          theoreticalBestString: '4:00.470',
          bestLapPacePercentage: 102.4,
          bestLapPaceCategory: 'Good',
          position: 8,
          lapsCount: 6,
          gridPosition: 15,
          positionGain: 7,
          laps: [
            { lapNum: 1, position: 15, lapTime: 245, lapTimeString: '4:05.000', s1: null, s2: null, s3: null, topSpeed: 295, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
            { lapNum: 2, position: 8, lapTime: 240.47, lapTimeString: '4:00.470', s1: null, s2: null, s3: null, topSpeed: 298, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
          ],
        },
      },
    ];

    const { result } = renderHook(() => useDashboardTrends(mockSessions));
    expect(result.current.hasData).toBe(true);
    expect(result.current.driverName).toBe('Samuel Lague');

    // Latest outing should be the newest session (Circuit de la Sarthe)
    expect(result.current.latestOuting?.id).toBe('session-new');
    expect(result.current.latestOuting?.trackName).toBe('Circuit de la Sarthe');
    expect(result.current.latestOuting?.carName).toBe('Chevrolet Corvette Z06 LMGT3.R');
    expect(result.current.latestOuting?.bestLapTimeString).toBe('4:00.470');
    expect(result.current.latestOuting?.position).toBe(8);
    expect(result.current.latestOuting?.positionGain).toBe(7);
    expect(result.current.latestOuting?.hasReplay).toBe(true);
    expect(result.current.latestOuting?.replayName).toBe('le_mans_gt3_100hz.Vcr');

    // Pace trend: 103.5% down to 102.4% -> +1.1% gain (improving)
    expect(result.current.recentPaceTrend).toHaveLength(2);
    expect(result.current.paceDelta).toBe(1.1);
    expect(result.current.paceTrendDirection).toBe('improving');

    // Recent clean rate should be 100%
    expect(result.current.recentCleanRate).toBe(100);
    // Recent consistency should be computed
    expect(result.current.recentConsistency).toBeGreaterThan(90);
    // Recent net positions gained: +7
    expect(result.current.recentNetPositions).toBe(7);
  });

  it('filters out empty sessions and prefers Race session over Practice on the same day', () => {
    const sessionsWithEmptyAndPractice: SessionSummary[] = [
      {
        id: 'sess-empty-practice',
        filename: 'practice_empty.xml',
        trackVenue: 'Circuit de la Sarthe',
        timeString: '2026/09/23 23:45:00', // Newer timestamp than the race!
        sessionType: 'Practice',
        sessionName: 'P2',
        driversCount: 15,
        playerDriver: {
          name: 'Samuel Lague',
          carType: 'BMW M4 LMGT3',
          carClass: 'LMGT3',
          bestLapTime: null, // Empty: 0 timed laps!
          bestLapTimeString: '',
          bestS1: null,
          bestS2: null,
          bestS3: null,
          theoreticalBest: null,
          theoreticalBestString: '',
          lapsCount: 2, // Out-laps only
        },
      },
      {
        id: 'sess-valid-practice',
        filename: 'practice_valid.xml',
        trackVenue: 'Circuit de la Sarthe',
        timeString: '2026/09/23 23:30:00', // Newer than race, valid lap
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 15,
        playerDriver: {
          name: 'Samuel Lague',
          carType: 'BMW M4 LMGT3',
          carClass: 'LMGT3',
          bestLapTime: 245.0,
          bestLapTimeString: '4:05.000',
          bestS1: 72,
          bestS2: 92,
          bestS3: 81,
          theoreticalBest: 245.0,
          theoreticalBestString: '4:05.000',
          lapsCount: 5,
        },
      },
      {
        id: 'sess-valid-race',
        filename: 'race_valid.xml',
        trackVenue: 'Circuit de la Sarthe',
        timeString: '2026/09/23 22:30:00', // Race earlier on same day
        sessionType: 'Race',
        sessionName: 'R1',
        driversCount: 20,
        playerDriver: {
          name: 'Samuel Lague',
          carType: 'Chevrolet Corvette Z06 LMGT3.R',
          carClass: 'LMGT3',
          bestLapTime: 240.47,
          bestLapTimeString: '4:00.470',
          bestS1: 70,
          bestS2: 90,
          bestS3: 80.47,
          theoreticalBest: 240.47,
          theoreticalBestString: '4:00.470',
          position: 5,
          positionGain: 3,
          lapsCount: 6,
        },
      },
    ];

    const { result } = renderHook(() => useDashboardTrends(sessionsWithEmptyAndPractice));
    expect(result.current.hasData).toBe(true);

    // Should NOT pick sess-empty-practice (empty session)
    // Should PREFER the Race (sess-valid-race) over sess-valid-practice because it's a Race on the same day!
    expect(result.current.latestOuting?.id).toBe('sess-valid-race');
    expect(result.current.latestOuting?.sessionType).toBe('Race');
    expect(result.current.latestOuting?.bestLapTimeString).toBe('4:00.470');
    expect(result.current.latestOuting?.position).toBe(5);
  });

  it('prefers Race session when tied on timeString with Qualifying and Practice', () => {
    const tiedSessions: SessionSummary[] = [
      {
        id: 'sess-p1',
        filename: 'p1.xml',
        trackVenue: 'Monza',
        timeString: '2026/09/20 14:00:00',
        timestamp: 1000,
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 10,
        playerDriver: {
          name: 'Player',
          carType: 'Ferrari 499P',
          carClass: 'LMH',
          bestLapTime: 96.5,
          bestLapTimeString: '1:36.500',
          bestS1: 30,
          bestS2: 35,
          bestS3: 31.5,
          theoreticalBest: 96.5,
          theoreticalBestString: '1:36.500',
          lapsCount: 8,
        },
      },
      {
        id: 'sess-q1',
        filename: 'q1.xml',
        trackVenue: 'Monza',
        timeString: '2026/09/20 14:00:00',
        timestamp: 2000,
        sessionType: 'Qualifying',
        sessionName: 'Q1',
        driversCount: 10,
        playerDriver: {
          name: 'Player',
          carType: 'Ferrari 499P',
          carClass: 'LMH',
          bestLapTime: 95.8,
          bestLapTimeString: '1:35.800',
          bestS1: 29.5,
          bestS2: 35,
          bestS3: 31.3,
          theoreticalBest: 95.8,
          theoreticalBestString: '1:35.800',
          position: 2,
          lapsCount: 5,
        },
      },
      {
        id: 'sess-r1',
        filename: 'r1.xml',
        trackVenue: 'Monza',
        timeString: '2026/09/20 14:00:00',
        timestamp: 3000,
        sessionType: 'Race',
        sessionName: 'R1',
        driversCount: 10,
        playerDriver: {
          name: 'Player',
          carType: 'Ferrari 499P',
          carClass: 'LMH',
          bestLapTime: 95.5,
          bestLapTimeString: '1:35.500',
          bestS1: 29.5,
          bestS2: 34.8,
          bestS3: 31.2,
          theoreticalBest: 95.5,
          theoreticalBestString: '1:35.500',
          position: 1,
          lapsCount: 20,
        },
      },
    ];

    const { result } = renderHook(() => useDashboardTrends(tiedSessions));
    expect(result.current.latestOuting?.id).toBe('sess-r1');
    expect(result.current.latestOuting?.sessionType).toBe('Race');
  });
});
