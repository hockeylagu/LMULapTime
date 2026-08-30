import { describe, it, expect } from 'vitest';
import {
  formatTime,
  parseTimeStringToSeconds,
  isSessionEmpty,
  getDisplayTrackName,
  matchesSessionType,
} from '../../src/utils/formatters';

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
});
