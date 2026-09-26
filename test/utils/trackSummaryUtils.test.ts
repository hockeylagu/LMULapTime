import { describe, it, expect } from 'vitest';
import { aggregateTrackSummaries, TrackSessionSummary } from '../../shared/domain/trackSummaryUtils.js';

describe('trackSummaryUtils', () => {
  const sampleSessions: TrackSessionSummary[] = [
    {
      id: 'session-1',
      trackVenue: 'Spa-Francorchamps',
      trackCourse: 'Grand Prix',
      timeString: '2026/06/10 10:00:00',
      timestamp: 1718013600000,
      playerDriver: {
        name: 'Sim Driver',
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        bestLapTime: 122.5,
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.5,
        lapsCount: 10,
      },
    },
    {
      id: 'session-2',
      trackVenue: 'Spa-Francorchamps',
      trackCourse: 'Grand Prix',
      timeString: '2026/06/11 15:30:00',
      timestamp: 1718120000000,
      playerDriver: {
        name: 'Sim Driver',
        carType: 'Porsche 963',
        carClass: 'Hypercar',
        bestLapTime: 121.8,
        bestS1: 33.8,
        bestS2: 41.9,
        bestS3: 46.1,
        lapsCount: 8,
      },
    },
    {
      id: 'session-3',
      trackVenue: 'Spa-Francorchamps',
      trackCourse: 'Grand Prix',
      timeString: '2026/06/12 11:00:00',
      timestamp: 1718190000000,
      playerDriver: {
        name: 'Sim Driver',
        carType: 'Porsche 911 GT3 R LMGT3',
        carClass: 'LMGT3',
        bestLapTime: 135.2,
        bestS1: 38.0,
        bestS2: 46.0,
        bestS3: 51.2,
        lapsCount: 12,
      },
    },
    {
      id: 'session-4',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Grand Prix',
      timeString: '2026/06/13 14:00:00',
      timestamp: 1718287200000,
      playerDriver: {
        name: 'Sim Driver',
        carType: 'Aston Martin Vantage GT3',
        carClass: 'LMGT3',
        bestLapTime: 108.5,
        bestS1: 27.5,
        bestS2: 38.5,
        bestS3: 42.5,
        lapsCount: 15,
      },
    },
  ];

  it('aggregates all sessions across tracks when carClass is All or omitted', () => {
    const result = aggregateTrackSummaries(sampleSessions);

    const spa = result['Spa-Francorchamps'];
    expect(spa).toBeDefined();
    expect(spa.sessionsCount).toBe(3);
    expect(spa.totalLaps).toBe(30);
    expect(spa.bestLapTime).toBe(121.8);
    expect(spa.bestLapCar).toBe('Porsche 963');
    expect(spa.bestLapClass).toBe('Hypercar');
    expect(spa.bestS1).toBe(33.8);
    expect(spa.bestS2).toBe(41.9);
    expect(spa.bestS3).toBe(46.1);
    expect(spa.theoreticalBest).toBe(121.8);
    expect(spa.carsUsed).toEqual(['Ferrari 499P', 'Porsche 963', 'Porsche 911 GT3 R LMGT3']);
    expect(spa.lastSessionTimestamp).toBe(1718190000000);

    const monza = result['Autodromo Nazionale Monza'];
    expect(monza).toBeDefined();
    expect(monza.sessionsCount).toBe(1);
    expect(monza.totalLaps).toBe(15);
    expect(monza.bestLapTime).toBe(108.5);
    expect(monza.bestLapCar).toBe('Aston Martin Vantage GT3');
    expect(monza.bestLapClass).toBe('LMGT3');
  });

  it('filters sessions by carClass accurately', () => {
    const lmgt3Only = aggregateTrackSummaries(sampleSessions, { carClass: 'LMGT3' });

    const spa = lmgt3Only['Spa-Francorchamps'];
    expect(spa).toBeDefined();
    expect(spa.sessionsCount).toBe(1);
    expect(spa.totalLaps).toBe(12);
    expect(spa.bestLapTime).toBe(135.2);
    expect(spa.bestLapCar).toBe('Porsche 911 GT3 R LMGT3');
    expect(spa.bestLapClass).toBe('LMGT3');
    expect(spa.carsUsed).toEqual(['Porsche 911 GT3 R LMGT3']);

    const monza = lmgt3Only['Autodromo Nazionale Monza'];
    expect(monza).toBeDefined();
    expect(monza.sessionsCount).toBe(1);
    expect(monza.totalLaps).toBe(15);
  });

  it('retains empty venues with 0 stats when includeEmptyVenues is true', () => {
    // Monza has no Hypercar sessions
    const hypercarOnly = aggregateTrackSummaries(sampleSessions, {
      carClass: 'Hypercar',
      includeEmptyVenues: true,
    });

    const spa = hypercarOnly['Spa-Francorchamps'];
    expect(spa.sessionsCount).toBe(2);
    expect(spa.totalLaps).toBe(18);

    const monza = hypercarOnly['Autodromo Nazionale Monza'];
    expect(monza).toBeDefined();
    expect(monza.sessionsCount).toBe(0);
    expect(monza.totalLaps).toBe(0);
    expect(monza.bestLapTime).toBeNull();
    expect(monza.carsUsed).toEqual([]);
  });

  it('handles sessions with missing timestamp by parsing timeString', () => {
    const sessionWithoutTimestamp: TrackSessionSummary[] = [
      {
        trackVenue: 'Sebring',
        trackCourse: '12h',
        timeString: '2026/07/04 18:00:00',
        playerDriver: {
          name: 'Player',
          carType: 'Cadillac V-Series.R',
          bestLapTime: 110.0,
          bestS1: 30.0,
          bestS2: 40.0,
          bestS3: 40.0,
          lapsCount: 5,
        },
      },
    ];

    const result = aggregateTrackSummaries(sessionWithoutTimestamp);
    const sebring = result['Sebring'];
    expect(sebring).toBeDefined();
    expect(sebring.lastSessionTimestamp).toBeGreaterThan(0);
    expect(sebring.sessionsCount).toBe(1);
    expect(sebring.bestLapTime).toBe(110.0);
  });

  it('returns empty object when sessions array is empty', () => {
    const result = aggregateTrackSummaries([]);
    expect(result).toEqual({});
  });
});
