import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatElapsedSeconds,
  parseTimeStringToSeconds,
  isSessionEmpty,
  getDisplayTrackName,
  matchesSessionType,
  parseDateStringToTimestamp,
  computeTheoreticalBest,
  computeTheoreticalGap,
  minValidTime,
  getSessionTypeWeight,
  compareSessions,
  compareSessionsBySortOption,
} from '../../shared/domain/formatters.js';

describe('formatters utility', () => {
  describe('formatTime', () => {
    it('returns placeholder string for null, undefined, or empty values', () => {
      expect(formatTime(null)).toBe('--:--.---');
      expect(formatTime(undefined)).toBe('--:--.---');
      expect(formatTime('')).toBe('--:--.---');
      expect(formatTime(NaN)).toBe('--:--.---');
      expect(formatTime(-10)).toBe('--:--.---');
      expect(formatTime(0)).toBe('--:--.---');
    });

    it('formats seconds correctly into MM:SS.mmm format', () => {
      expect(formatTime(65.123)).toBe('1:05.123');
      expect(formatTime(128.456)).toBe('2:08.456');
      expect(formatTime(9.5)).toBe('0:09.500');
      expect(formatTime(60)).toBe('1:00.000');
      expect(formatTime('142.789')).toBe('2:22.789');
    });
  });

  describe('formatElapsedSeconds', () => {
    it('returns placeholder for null, undefined, NaN, and negative inputs', () => {
      expect(formatElapsedSeconds(null)).toBe('--:--');
      expect(formatElapsedSeconds(undefined)).toBe('--:--');
      expect(formatElapsedSeconds(NaN)).toBe('--:--');
      expect(formatElapsedSeconds(-5)).toBe('--:--');
    });

    it('formats short elapsed times under 1 hour in M:SS.d format', () => {
      expect(formatElapsedSeconds(0)).toBe('0:00.0');
      expect(formatElapsedSeconds(45.5)).toBe('0:45.5');
      expect(formatElapsedSeconds(130.5)).toBe('2:10.5');
      expect(formatElapsedSeconds(3599.9)).toBe('59:59.9');
    });

    it('formats long elapsed times over 1 hour in H:MM:SS.d format', () => {
      expect(formatElapsedSeconds(3600)).toBe('1:00:00.0');
      expect(formatElapsedSeconds(3665.2)).toBe('1:01:05.2');
      expect(formatElapsedSeconds(7325.8)).toBe('2:02:05.8');
    });
  });

  describe('parseTimeStringToSeconds', () => {
    it('handles numeric inputs directly', () => {
      expect(parseTimeStringToSeconds(105.4)).toBe(105.4);
      expect(parseTimeStringToSeconds(0)).toBeNull();
      expect(parseTimeStringToSeconds(-5)).toBeNull();
      expect(parseTimeStringToSeconds(NaN)).toBeNull();
    });

    it('handles null, undefined, empty, and dash strings', () => {
      expect(parseTimeStringToSeconds('')).toBeNull();
      expect(parseTimeStringToSeconds('--.----')).toBeNull();
      expect(parseTimeStringToSeconds('--.---')).toBeNull();
      expect(parseTimeStringToSeconds('--:--.---')).toBeNull();
    });

    it('parses MM:SS.sss time strings', () => {
      expect(parseTimeStringToSeconds('1:42.500')).toBe(102.5);
      expect(parseTimeStringToSeconds('2:05.123')).toBeCloseTo(125.123);
      expect(parseTimeStringToSeconds('0:09.123')).toBeCloseTo(9.123);
      expect(parseTimeStringToSeconds('invalid:val')).toBeNull();
    });

    it('parses multi-hour H:MM:SS.sss time strings', () => {
      expect(parseTimeStringToSeconds('1:02:15.500')).toBe(3735.5);
      expect(parseTimeStringToSeconds('2:00:00.000')).toBe(7200);
      expect(parseTimeStringToSeconds('1:invalid:30')).toBeNull();
    });

    it('parses pure decimal strings', () => {
      expect(parseTimeStringToSeconds('102.50')).toBe(102.5);
      expect(parseTimeStringToSeconds('0')).toBeNull();
      expect(parseTimeStringToSeconds('abc')).toBeNull();
    });
  });

  describe('isSessionEmpty', () => {
    it('returns true when session has no playerDriver and 0 driversCount', () => {
      expect(isSessionEmpty({ driversCount: 0 })).toBe(true);
      expect(isSessionEmpty({ driversCount: 5 })).toBe(false);
    });

    it('returns true if player driver has 0 laps or bestLapTime is null', () => {
      expect(isSessionEmpty({ playerDriver: { lapsCount: 0, bestLapTime: null } })).toBe(true);
      expect(isSessionEmpty({ playerDriver: { lapsCount: 0, bestLapTime: 100 } })).toBe(true);
      expect(isSessionEmpty({ playerDriver: { lapsCount: 3, bestLapTime: null } })).toBe(true);
    });

    it('returns false if player driver has valid laps and best lap time', () => {
      expect(isSessionEmpty({ playerDriver: { lapsCount: 5, bestLapTime: 95.2 } })).toBe(false);
    });
  });

  describe('getDisplayTrackName', () => {
    it('returns venue if course is empty', () => {
      expect(getDisplayTrackName('Spa-Francorchamps', '')).toBe('Spa-Francorchamps');
      expect(getDisplayTrackName('Monza', undefined)).toBe('Monza');
    });

    it('returns venue when course is generic layout (gp, grand prix, full, wec)', () => {
      expect(getDisplayTrackName('Silverstone', 'GP')).toBe('Silverstone');
      expect(getDisplayTrackName('Silverstone', 'Grand Prix')).toBe('Silverstone');
      expect(getDisplayTrackName('Le Mans', 'Full')).toBe('Le Mans');
      expect(getDisplayTrackName('Bahrain', 'WEC')).toBe('Bahrain');
    });

    it('returns venue when venue already includes course name', () => {
      expect(getDisplayTrackName('Circuit de Spa-Francorchamps GP', 'Spa-Francorchamps')).toBe('Circuit de Spa-Francorchamps GP');
    });

    it('formats custom layouts cleanly and removes redundant venue words', () => {
      expect(getDisplayTrackName('Paul Ricard', 'Paul Ricard - 1A-V2-Short')).toBe('Paul Ricard (1A V2 Short)');
      expect(getDisplayTrackName('Silverstone', 'National Circuit')).toBe('Silverstone (National Circuit)');
      expect(getDisplayTrackName('Sebring', 'Sebring School Course')).toBe('Sebring (School Course)');
    });

    it('returns layout with venue when course provides additional layout details', () => {
      expect(getDisplayTrackName('Monza', 'Monza Circuit')).toBe('Monza (Circuit)');
    });
  });

  describe('matchesSessionType', () => {
    it('matches all types when filter is All or empty', () => {
      expect(matchesSessionType('Practice', 'P1', 'All')).toBe(true);
      expect(matchesSessionType('Qualifying', 'Q1', '')).toBe(true);
    });

    it('matches Practice sessions accurately', () => {
      expect(matchesSessionType('Practice', 'P1', 'practice')).toBe(true);
      expect(matchesSessionType('', 'Practice 1', 'Practice')).toBe(true);
      expect(matchesSessionType('Unknown', 'P2', 'Practice')).toBe(true);
      expect(matchesSessionType('Race', 'R1', 'Practice')).toBe(false);
    });

    it('matches Qualifying sessions accurately', () => {
      expect(matchesSessionType('Qualifying', 'Q1', 'Qualifying')).toBe(true);
      expect(matchesSessionType('Qualify', '', 'Qualifying')).toBe(true);
      expect(matchesSessionType('', 'Qualifying Session', 'Qualifying')).toBe(true);
      expect(matchesSessionType('Practice', 'P1', 'Qualifying')).toBe(false);
    });

    it('matches Race sessions accurately', () => {
      expect(matchesSessionType('Race', 'R1', 'Race')).toBe(true);
      expect(matchesSessionType('', 'R1', 'Race')).toBe(true);
      expect(matchesSessionType('Practice', 'P1', 'Race')).toBe(false);
    });

    it('matches custom fallback filter strings', () => {
      expect(matchesSessionType('Special Event', 'Session 1', 'Special')).toBe(true);
      expect(matchesSessionType('Warmup', 'W1', 'Warmup')).toBe(true);
    });
  });

  describe('parseDateStringToTimestamp', () => {
    it('returns 0 for empty or undefined strings', () => {
      expect(parseDateStringToTimestamp('')).toBe(0);
      expect(parseDateStringToTimestamp(undefined)).toBe(0);
    });

    it('parses valid date strings with slashes or dashes', () => {
      expect(parseDateStringToTimestamp('2026/05/28 14:00')).toBeGreaterThan(0);
      expect(parseDateStringToTimestamp('2026-05-28 14:00')).toBeGreaterThan(0);
    });
  });

  describe('computeTheoreticalBest', () => {
    it('returns null if any sector is null or undefined or <= 0', () => {
      expect(computeTheoreticalBest(null, 30.0, 40.0)).toBeNull();
      expect(computeTheoreticalBest(25.0, null, 40.0)).toBeNull();
      expect(computeTheoreticalBest(25.0, 30.0, null)).toBeNull();
      expect(computeTheoreticalBest(0, 30.0, 40.0)).toBeNull();
    });

    it('sums valid sector times correctly', () => {
      expect(computeTheoreticalBest(25.100, 32.200, 41.300)).toBeCloseTo(98.6);
    });
  });

  describe('computeTheoreticalGap', () => {
    it('returns null if either bestLapTime or theoreticalBest is missing or <= 0', () => {
      expect(computeTheoreticalGap(null, 120)).toBeNull();
      expect(computeTheoreticalGap(120, null)).toBeNull();
      expect(computeTheoreticalGap(undefined, 120)).toBeNull();
      expect(computeTheoreticalGap(0, 120)).toBeNull();
      expect(computeTheoreticalGap(120, 0)).toBeNull();
      expect(computeTheoreticalGap(-5, 120)).toBeNull();
    });

    it('calculates the positive gap between actual best and theoretical best', () => {
      expect(computeTheoreticalGap(122.500, 121.200)).toBe(1.3);
      expect(computeTheoreticalGap(95.123, 95.000)).toBe(0.123);
    });

    it('clamps negative differences to 0 to prevent floating-point noise artifacts', () => {
      expect(computeTheoreticalGap(120.000, 120.000)).toBe(0);
      expect(computeTheoreticalGap(120.000, 120.0000001)).toBe(0);
    });
  });

  describe('minValidTime', () => {
    it('returns smaller valid number', () => {
      expect(minValidTime(null, 30.5)).toBe(30.5);
      expect(minValidTime(35.0, 30.5)).toBe(30.5);
      expect(minValidTime(25.0, 30.5)).toBe(25.0);
    });

    it('ignores null, undefined, or non-positive values', () => {
      expect(minValidTime(30.0, null)).toBe(30.0);
      expect(minValidTime(30.0, undefined)).toBe(30.0);
      expect(minValidTime(30.0, 0)).toBe(30.0);
      expect(minValidTime(30.0, -5)).toBe(30.0);
      expect(minValidTime(null, null)).toBeNull();
    });
  });

  describe('getSessionTypeWeight and compareSessions', () => {
    it('ranks Race as higher weight / newer than Qualifying, and Qualifying higher than Practice', () => {
      const practiceWeight = getSessionTypeWeight('Practice', 'P1');
      const qualiWeight = getSessionTypeWeight('Qualifying', 'Q1');
      const raceWeight = getSessionTypeWeight('Race', 'R1');

      expect(practiceWeight).toBeLessThan(qualiWeight);
      expect(qualiWeight).toBeLessThan(raceWeight);
    });

    it('orders Race after Qualifying in chronological ascending order, and before in descending order', () => {
      const qualiSession = {
        id: '2026_05_28_Q1',
        timeString: '2026/05/28 14:00:00',
        sessionType: 'Qualifying',
        sessionName: 'Q1',
      };

      const raceSession = {
        id: '2026_05_28_R1',
        timeString: '2026/05/28 14:00:00',
        sessionType: 'Race',
        sessionName: 'R1',
      };

      // In descending order (newest first), Race is newer so it should come first (negative return value)
      expect(compareSessions(raceSession, qualiSession, 'desc')).toBeLessThan(0);
      expect(compareSessions(qualiSession, raceSession, 'desc')).toBeGreaterThan(0);

      // In ascending order (chronological), Quali comes before Race (negative return value)
      expect(compareSessions(qualiSession, raceSession, 'asc')).toBeLessThan(0);
      expect(compareSessions(raceSession, qualiSession, 'asc')).toBeGreaterThan(0);
    });

    it('orders multiple sessions on the same date: Practice -> Quali -> Race', () => {
      const p1 = { id: 'P1', timeString: '2026/05/28 14:00', sessionType: 'Practice', sessionName: 'P1' };
      const q1 = { id: 'Q1', timeString: '2026/05/28 14:00', sessionType: 'Qualifying', sessionName: 'Q1' };
      const r1 = { id: 'R1', timeString: '2026/05/28 14:00', sessionType: 'Race', sessionName: 'R1' };

      const list = [q1, r1, p1];

      // Chronological: Practice, Quali, Race
      const sortedAsc = [...list].sort((a, b) => compareSessions(a, b, 'asc'));
      expect(sortedAsc.map(s => s.id)).toEqual(['P1', 'Q1', 'R1']);

      // Newest first: Race, Quali, Practice
      const sortedDesc = [...list].sort((a, b) => compareSessions(a, b, 'desc'));
      expect(sortedDesc.map(s => s.id)).toEqual(['R1', 'Q1', 'P1']);
    });
  });

  describe('compareSessionsBySortOption', () => {
    const s1 = {
      id: 'sess-1',
      timeString: '2026/05/28 10:00:00',
      sessionType: 'Race',
      sessionName: 'R1',
      playerDriver: {
        position: 1,
        bestLapTime: 120.5,
        bestLapPacePercentage: 101.2,
      },
    };

    const s2 = {
      id: 'sess-2',
      timeString: '2026/05/28 12:00:00',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      playerDriver: {
        position: 2,
        bestLapTime: 119.8,
        bestLapPacePercentage: 100.5,
      },
    };

    const s3 = {
      id: 'sess-3',
      timeString: '2026/05/28 09:00:00',
      sessionType: 'Practice',
      sessionName: 'P1',
      playerDriver: {
        position: 5,
        bestLapTime: 125.0,
        bestLapPacePercentage: 104.5,
      },
    };

    const sNoData = {
      id: 'sess-empty',
      timeString: '2026/05/28 08:00:00',
      sessionType: 'Practice',
      sessionName: 'P0',
    };

    it('sorts by date-desc and date-asc', () => {
      const list = [s1, s2, s3];
      const desc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'date-desc'));
      expect(desc.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3']);

      const asc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'date-asc'));
      expect(asc.map((s) => s.id)).toEqual(['sess-3', 'sess-1', 'sess-2']);
    });

    it('sorts by pos-asc prioritizing Race over Quali over Practice, then position, then date tie-break', () => {
      const list = [s3, s2, s1];
      const sorted = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pos-asc'));
      // Race (s1) has highest type rank (0), Quali (s2) rank 1, Practice (s3) rank 2
      expect(sorted.map((s) => s.id)).toEqual(['sess-1', 'sess-2', 'sess-3']);
    });

    it('sorts by lap-asc with fastest bestLapTime first and missing laps placed last', () => {
      const list = [s1, sNoData, s3, s2];
      const sorted = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'lap-asc'));
      // 119.8 (s2) < 120.5 (s1) < 125.0 (s3) < no data (sNoData)
      expect(sorted.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3', 'sess-empty']);
    });

    it('sorts by pace-asc and pace-desc with lowest/highest pace % first and missing pace placed last', () => {
      const list = [s1, sNoData, s3, s2];
      const asc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pace-asc'));
      // 100.5 (s2) < 101.2 (s1) < 104.5 (s3) < 999 (sNoData)
      expect(asc.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3', 'sess-empty']);

      const desc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pace-desc'));
      // 104.5 (s3) > 101.2 (s1) > 100.5 (s2) (with sNoData placed at 999 first)
      expect(desc[0].id).toBe('sess-empty');
      expect(desc.slice(1).map((s) => s.id)).toEqual(['sess-3', 'sess-1', 'sess-2']);
    });

    it('supports custom selectors for lap times and pace percentages', () => {
      interface CustomSession {
        id: string;
        customLap?: number;
        customPace?: number;
      }
      const c1: CustomSession = { id: 'c1', customLap: 100, customPace: 102 };
      const c2: CustomSession = { id: 'c2', customLap: 90, customPace: 105 };

      const sortedByLap = [c1, c2].sort((a, b) =>
        compareSessionsBySortOption(a, b, 'lap-asc', {
          getBestLapTime: (s) => s.customLap,
        })
      );
      expect(sortedByLap.map((s) => s.id)).toEqual(['c2', 'c1']);

      const sortedByPace = [c1, c2].sort((a, b) =>
        compareSessionsBySortOption(a, b, 'pace-asc', {
          getPacePercentage: (s) => s.customPace,
        })
      );
      expect(sortedByPace.map((s) => s.id)).toEqual(['c1', 'c2']);
    });
  });
});
