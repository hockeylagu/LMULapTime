import { describe, it, expect } from 'vitest';
import { formatTime, formatElapsedSeconds, parseTimeStringToSeconds } from '../../../shared/domain/timing/timeFormat.js';

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

  it('carries rounded milliseconds into the next unit instead of showing 60.000', () => {
    expect(formatTime(59.9996)).toBe('1:00.000');
    expect(formatTime(119.9999)).toBe('2:00.000');
    expect(formatTime(Infinity)).toBe('--:--.---');
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

  it('carries rounded tenths into the next unit instead of showing 60.0', () => {
    expect(formatElapsedSeconds(59.96)).toBe('1:00.0');
    expect(formatElapsedSeconds(3599.96)).toBe('1:00:00.0');
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
