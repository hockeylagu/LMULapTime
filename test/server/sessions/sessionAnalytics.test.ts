import { describe, it, expect } from 'vitest';
import {
  computeProgression,
  extractComparableLaps,
  computeAverageLapTime,
  toComparableLap,
} from '../../../server/sessions/sessionAnalytics.js';
import { DetailedSession, DriverData, LapData } from '../../../server/core/types.js';

describe('sessionAnalytics server module', () => {
  describe('computeAverageLapTime', () => {
    it('computes average lap time across valid clean laps', () => {
      const laps: LapData[] = [
        { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 30, s2: 45, s3: 45, topSpeed: 300, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: false },
        { lapNum: 3, position: 1, lapTime: 122.0, lapTimeString: '2:02.000', s1: 31, s2: 45, s3: 46, topSpeed: 302, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: false },
      ];
      expect(computeAverageLapTime(laps)).toBe(121.0);
    });

    it('returns null when no clean laps are present', () => {
      const laps: LapData[] = [
        { lapNum: 1, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 30, s2: 45, s3: 45, topSpeed: 300, fCompound: 'Hard', rCompound: 'Hard', isValid: false, isPitStop: false },
        { lapNum: 2, position: 1, lapTime: 180.0, lapTimeString: '3:00.000', s1: 40, s2: 60, s3: 80, topSpeed: 200, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: true },
      ];
      expect(computeAverageLapTime(laps)).toBeNull();
    });
  });

  describe('computeProgression', () => {
    it('computes chronological progression points for sessions', () => {
      const mockSessions: DetailedSession[] = [
        {
          id: 'sess2',
          filename: 'sess2.xml',
          filePath: '/path/2',
          trackVenue: 'Spa',
          trackCourse: 'GP',
          trackEvent: '',
          trackLengthMeters: 7004,
          timeString: '2026/05/29 14:00',
          timestamp: 2000,
          sessionType: 'Qualifying',
          sessionName: 'Q1',
          driversCount: 1,
          drivers: [
            {
              name: 'Player',
              isPlayer: true,
              carType: 'Ferrari 499P',
              carClass: 'LMH',
              carNumber: '50',
              teamName: 'AF',
              position: 1,
              classPosition: 1,
              bestLapTime: 120.0,
              bestLapTimeString: '2:00.000',
              bestS1: 34.0,
              bestS2: 41.0,
              bestS3: 45.0,
              theoreticalBest: 120.0,
              theoreticalBestString: '2:00.000',
              lapsCount: 2,
              laps: [
                { lapNum: 1, position: 1, lapTime: 121.0, lapTimeString: '2:01.000', s1: 34, s2: 42, s3: 45, topSpeed: 320, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
                { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 34, s2: 41, s3: 45, topSpeed: 322, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              ],
            },
          ],
          playerDriver: undefined,
        },
        {
          id: 'sess1',
          filename: 'sess1.xml',
          filePath: '/path/1',
          trackVenue: 'Spa',
          trackCourse: 'GP',
          trackEvent: '',
          trackLengthMeters: 7004,
          timeString: '2026/05/28 14:00',
          timestamp: 1000,
          sessionType: 'Practice',
          sessionName: 'P1',
          driversCount: 1,
          drivers: [
            {
              name: 'Player',
              isPlayer: true,
              carType: 'Ferrari 499P',
              carClass: 'LMH',
              carNumber: '50',
              teamName: 'AF',
              position: 1,
              classPosition: 1,
              bestLapTime: 122.0,
              bestLapTimeString: '2:02.000',
              bestS1: 35.0,
              bestS2: 42.0,
              bestS3: 45.0,
              theoreticalBest: 122.0,
              theoreticalBestString: '2:02.000',
              lapsCount: 1,
              laps: [
                { lapNum: 1, position: 1, lapTime: 122.0, lapTimeString: '2:02.000', s1: 35, s2: 42, s3: 45, topSpeed: 320, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              ],
            },
          ],
          playerDriver: undefined,
        },
      ];

      const progression = computeProgression(mockSessions, 'Player');
      expect(progression.length).toBe(2);
      // Verify chronological order (timestamp 1000 first, 2000 second)
      expect(progression[0].sessionId).toBe('sess1');
      expect(progression[0].bestLapTime).toBe(122.0);
      expect(progression[1].sessionId).toBe('sess2');
      expect(progression[1].bestLapTime).toBe(120.0);
      expect(progression[1].cleanLapsCount).toBe(1);
      expect(progression[1].avgLapTime).toBe(120.0);
      expect(progression[1].top3AvgLapTime).toBe(120.0);
      expect(progression[1].theoreticalGap).toBe(0);
      expect(progression[1].consistencyScore).toBe(100);
    });

    it('excludes pit stops, out-laps, and start laps from cleanLapsCount while preserving totalLapsCount and bestLapTime', () => {
      const mockSession: DetailedSession = {
        id: 'sess-pit-test',
        filename: 'sess_pit.xml',
        filePath: '/path/pit',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        trackEvent: '',
        trackLengthMeters: 7004,
        timeString: '2026/05/30 14:00',
        timestamp: 3000,
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 1,
        drivers: [
          {
            name: 'Player',
            isPlayer: true,
            carType: 'Ferrari 499P',
            carClass: 'LMH',
            carNumber: '50',
            teamName: 'AF',
            position: 1,
            classPosition: 1,
            bestLapTime: 120.0,
            bestLapTimeString: '2:00.000',
            bestS1: 34.0,
            bestS2: 41.0,
            bestS3: 45.0,
            theoreticalBest: 120.0,
            theoreticalBestString: '2:00.000',
            lapsCount: 5,
            laps: [
              { lapNum: 1, position: 1, lapTime: 125.0, lapTimeString: '2:05.000', s1: 35, s2: 43, s3: 47, topSpeed: 318, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 34, s2: 41, s3: 45, topSpeed: 322, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
              { lapNum: 3, position: 1, lapTime: 145.0, lapTimeString: '2:25.000', s1: 34, s2: 42, s3: 69, topSpeed: 280, fCompound: 'H', rCompound: 'H', isPitStop: true, isValid: true },
              { lapNum: 4, position: 1, lapTime: 180.0, lapTimeString: '3:00.000', s1: 60, s2: 60, s3: 60, topSpeed: 300, fCompound: 'H', rCompound: 'H', isOutLap: true, isPitStop: false, isValid: true },
              { lapNum: 5, position: 1, lapTime: 120.5, lapTimeString: '2:00.500', s1: 34, s2: 41.5, s3: 45, topSpeed: 321, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
            ],
          },
        ],
      };

      const progression = computeProgression([mockSession], 'Player');
      expect(progression[0].totalLapsCount).toBe(5);
      expect(progression[0].cleanLapsCount).toBe(2);
      expect(progression[0].bestLapTime).toBe(120.0);
    });
  });

  describe('extractComparableLaps layout isolation', () => {
    it('does not mix Sebring Full and Sebring School laps when filtering', () => {
      const mockSessions = [
        {
          id: 'sebring_full_1',
          trackVenue: 'Sebring International Raceway',
          trackCourse: '12h',
          sessionType: 'Practice',
          sessionName: 'P1',
          drivers: [
            {
              name: 'Driver 1',
              isPlayer: true,
              carType: 'Porsche 911 GT3 R',
              carClass: 'LMGT3',
              bestLapTime: 121.5,
              laps: [
                { lapNum: 1, lapTime: 121.5, s1: 30.0, s2: 45.0, s3: 46.5, isValid: true, isPitStop: false },
              ],
            },
          ],
        },
        {
          id: 'sebring_school_1',
          trackVenue: 'Sebring International Raceway',
          trackCourse: 'School',
          sessionType: 'Practice',
          sessionName: 'P1',
          drivers: [
            {
              name: 'Driver 1',
              isPlayer: true,
              carType: 'Porsche 911 GT3 R',
              carClass: 'LMGT3',
              bestLapTime: 63.2,
              laps: [
                { lapNum: 1, lapTime: 63.2, s1: 15.0, s2: 24.0, s3: 24.2, isValid: true, isPitStop: false },
              ],
            },
          ],
        },
      ] as unknown as DetailedSession[];

      // Query Full track
      const fullResults = extractComparableLaps(mockSessions, { trackName: 'Sebring International Raceway' });
      expect(fullResults.laps.length).toBe(1);
      expect(fullResults.laps[0].lapTime).toBe(121.5);
      expect(fullResults.allTimeBestLap?.lapTime).toBe(121.5);

      // Query School track
      const schoolResults = extractComparableLaps(mockSessions, { trackName: 'Sebring (school)' });
      expect(schoolResults.laps.length).toBe(1);
      expect(schoolResults.laps[0].lapTime).toBe(63.2);
      expect(schoolResults.allTimeBestLap?.lapTime).toBe(63.2);
    });
  });

  describe('extractComparableLaps', () => {
    const mockSessions: DetailedSession[] = [
      {
        id: 'sess_1',
        filename: 'sess_1.xml',
        filePath: '/path/1',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        trackEvent: '',
        trackLengthMeters: 7004,
        timeString: '2026/05/28 14:00',
        timestamp: 1000,
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 2,
        playerDriver: {
          name: 'Player Driver',
          isPlayer: true,
          carType: 'Porsche 911 GT3 R',
          carClass: 'LMGT3',
          carNumber: '92',
          teamName: 'Manthey',
          position: 2,
          classPosition: 2,
          bestLapTime: 122.5,
          bestLapTimeString: '2:02.500',
          theoreticalBest: 122.0,
          theoreticalBestString: '2:02.000',
          lapsCount: 2,
          laps: [
            { lapNum: 1, position: 2, lapTime: 124.0, lapTimeString: '2:04.000', s1: 31.0, s2: 46.0, s3: 47.0, isValid: true },
            { lapNum: 2, position: 2, lapTime: 122.5, lapTimeString: '2:02.500', s1: 30.5, s2: 45.5, s3: 46.5, isValid: true },
          ],
        },
        drivers: [
          {
            name: 'Player Driver',
            isPlayer: true,
            carType: 'Porsche 911 GT3 R',
            carClass: 'LMGT3',
            carNumber: '92',
            teamName: 'Manthey',
            position: 2,
            classPosition: 2,
            bestLapTime: 122.5,
            bestLapTimeString: '2:02.500',
            lapsCount: 2,
            laps: [
              { lapNum: 1, position: 2, lapTime: 124.0, lapTimeString: '2:04.000', s1: 31.0, s2: 46.0, s3: 47.0, isValid: true },
              { lapNum: 2, position: 2, lapTime: 122.5, lapTimeString: '2:02.500', s1: 30.5, s2: 45.5, s3: 46.5, isValid: true },
            ],
          },
          {
            name: 'Alien AI Opponent',
            isPlayer: false,
            carType: 'Ferrari 296 GT3',
            carClass: 'LMGT3',
            carNumber: '55',
            teamName: 'AF Corse',
            position: 1,
            classPosition: 1,
            bestLapTime: 120.0,
            bestLapTimeString: '2:00.000',
            lapsCount: 2,
            laps: [
              { lapNum: 1, position: 1, lapTime: 121.0, lapTimeString: '2:01.000', s1: 30.0, s2: 45.0, s3: 46.0, isValid: true },
              { lapNum: 2, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 29.8, s2: 44.5, s3: 45.7, isValid: true },
            ],
          },
        ],
      },
    ] as unknown as DetailedSession[];

    it('extracts comparable laps and finds personal best and overall track best without driver restriction', () => {
      const result = extractComparableLaps(mockSessions, {
        trackName: 'Spa',
        carClass: 'LMGT3',
        playerOnly: true,
      });

      // Player laps are extracted
      expect(result.laps.length).toBe(2);
      expect(result.laps[0].driverName).toBe('Player Driver');

      // Player personal best is 122.5s
      expect(result.allTimeBestLap).toBeDefined();
      expect(result.allTimeBestLap?.lapTime).toBe(122.5);
      expect(result.allTimeBestLap?.driverName).toBe('Player Driver');

      // Overall track best is the Alien AI Opponent (120.0s), even with playerOnly: true!
      expect(result.overallTrackBestLap).toBeDefined();
      expect(result.overallTrackBestLap?.lapTime).toBe(120.0);
      expect(result.overallTrackBestLap?.driverName).toBe('Alien AI Opponent');
      expect(result.overallTrackBestLap?.isOverallTrackBest).toBe(true);

      // Best sectors across player laps (when playerOnly is true)
      expect(result.bestS1).toBe(30.5);
      expect(result.bestS2).toBe(45.5);
      expect(result.bestS3).toBe(46.5);
    });

    it('filters strictly by carClass and returns empty when class does not match', () => {
      const result = extractComparableLaps(mockSessions, {
        trackName: 'Spa',
        carClass: 'Hypercar',
      });

      expect(result.laps.length).toBe(0);
      expect(result.allTimeBestLap).toBeNull();
      expect(result.overallTrackBestLap).toBeNull();
    });

    it('correctly filters LMP3 and differentiates LMP2 ELMS vs WEC', () => {
      const multiClassSessions = [
        {
          id: 'session_multiclass',
          sessionName: 'P1',
          sessionType: 'Practice',
          trackVenue: 'Spa',
          drivers: [
            {
              name: 'LMP3 Driver',
              carClass: 'LMP3',
              carType: 'Ligier JS P320',
              laps: [{ lapNum: 1, lapTime: 130.0, lapTimeString: '2:10.000', isValid: true }],
            },
            {
              name: 'ELMS Driver',
              carClass: 'LMP2',
              carType: 'Oreca 07 ELMS',
              laps: [{ lapNum: 1, lapTime: 125.0, lapTimeString: '2:05.000', isValid: true }],
            },
            {
              name: 'WEC Driver',
              carClass: 'LMP2',
              carType: 'Oreca 07 WEC',
              laps: [{ lapNum: 1, lapTime: 124.0, lapTimeString: '2:04.000', isValid: true }],
            },
          ],
        },
      ] as unknown as DetailedSession[];

      const lmp3Result = extractComparableLaps(multiClassSessions, {
        trackName: 'Spa',
        carClass: 'LMP3',
      });
      expect(lmp3Result.laps.length).toBe(1);
      expect(lmp3Result.laps[0].driverName).toBe('LMP3 Driver');

      const elmsResult = extractComparableLaps(multiClassSessions, {
        trackName: 'Spa',
        carClass: 'LMP2elms',
      });
      expect(elmsResult.laps.length).toBe(1);
      expect(elmsResult.laps[0].driverName).toBe('ELMS Driver');

      const wecResult = extractComparableLaps(multiClassSessions, {
        trackName: 'Spa',
        carClass: 'LMP2wec',
      });
      expect(wecResult.laps.length).toBe(1);
      expect(wecResult.laps[0].driverName).toBe('WEC Driver');
    });
  });

  describe('toComparableLap', () => {
    it('accurately projects session, driver, and lap details with overrides', () => {
      const mockSession: DetailedSession = {
        id: 'sess_1',
        filename: 'sess_1.xml',
        filePath: '/mock/sess_1.xml',
        trackVenue: 'Monza',
        trackCourse: 'GP',
        trackEvent: '',
        trackLengthMeters: 5793,
        timeString: '2026-09-20 10:00:00',
        timestamp: 1726826400,
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 1,
        drivers: [],
        matchingReplayFile: { name: 'Monza_P1.Vcr', path: '/replays/Monza_P1.Vcr', sizeBytes: 1024 },
      };

      const mockDriver: DriverData = {
        name: 'Test Pilot',
        isPlayer: true,
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        carNumber: '51',
        teamName: 'AF Corse',
        position: 1,
        classPosition: 1,
        bestLapTime: 96.425,
        bestLapTimeString: '1:36.425',
        bestS1: 27.12,
        bestS2: 38.45,
        bestS3: 30.855,
        theoreticalBest: 96.425,
        theoreticalBestString: '1:36.425',
        lapsCount: 1,
        laps: [],
      };

      const mockLap: LapData = {
        lapNum: 4,
        position: 1,
        lapTime: 96.425,
        lapTimeString: '1:36.425',
        s1: 27.12,
        s2: 38.45,
        s3: 30.855,
        topSpeed: 334.2,
        fCompound: 'Medium',
        rCompound: 'Medium',
        isValid: true,
        isPitStop: false,
        isOutLap: false,
        isInferred: false,
      };

      const projected = toComparableLap(mockSession, mockDriver, mockLap, {
        isSessionBest: true,
        tag: '⭐ Session Best',
      });

      expect(projected.id).toBe('sess_1_Test Pilot_lap_4');
      expect(projected.sessionId).toBe('sess_1');
      expect(projected.driverName).toBe('Test Pilot');
      expect(projected.carType).toBe('Ferrari 499P');
      expect(projected.carClass).toBe('Hypercar');
      expect(projected.lapNum).toBe(4);
      expect(projected.lapTime).toBe(96.425);
      expect(projected.matchingReplayFile).toBe('Monza_P1.Vcr');
      expect(projected.isSessionBest).toBe(true);
      expect(projected.tag).toBe('⭐ Session Best');
      expect(projected.isOutLap).toBe(false);
      expect(projected.isInferred).toBe(false);
    });
  });
});
