import { describe, it, expect } from 'vitest';
import {
  parseDuckDbFilename,
  normalizeSessionType,
  matchDuckDbToSession,
  matchDuckDbToReplay,
  DuckDbFileInfo,
} from '../../server/telemetryMatcher.js';
import { DetailedSession, ReplayMetadata } from '../../server/types.js';

describe('telemetryMatcher', () => {
  it('parses typical DuckDB telemetry filenames accurately', () => {
    const parsed1 = parseDuckDbFilename('Bahrain International Circuit_P_2026-09-13T20_33_32Z.duckdb');
    expect(parsed1).not.toBeNull();
    expect(parsed1!.trackName).toBe('Bahrain International Circuit');
    expect(parsed1!.sessionType).toBe('P');
    expect(parsed1!.timestampStr).toBe('2026-09-13T20:33:32Z');
    expect(parsed1!.timestampEpochMs).toBeGreaterThan(0);

    const parsed2 = parseDuckDbFilename('Autodromo Nazionale Monza_Q_2026-09-08T09_03_49Z.duckdb');
    expect(parsed2).not.toBeNull();
    expect(parsed2!.trackName).toBe('Autodromo Nazionale Monza');
    expect(parsed2!.sessionType).toBe('Q');
  });

  it('normalizes session types correctly', () => {
    expect(normalizeSessionType('P')).toBe('P');
    expect(normalizeSessionType('PRACTICE 1')).toBe('P');
    expect(normalizeSessionType('Qualify')).toBe('Q');
    expect(normalizeSessionType('R1')).toBe('R');
    expect(normalizeSessionType('Race')).toBe('R');
    expect(normalizeSessionType('Warmup')).toBe('W');
  });

  it('matches DuckDb file to a session based on track, session type, and time proximity', () => {
    const duckFiles: DuckDbFileInfo[] = [
      {
        filename: 'Bahrain International Circuit_P_2026-09-13T20_33_32Z.duckdb',
        filePath: 'C:\\fake\\Bahrain.duckdb',
        fileMtimeMs: 1773606812000,
        fileSizeBytes: 1024,
        trackName: 'Bahrain International Circuit',
        sessionType: 'P',
        timestampStr: '2026-09-13T20:33:32Z',
        timestampEpochMs: new Date('2026-09-13T20:33:32Z').getTime(),
      },
      {
        filename: 'Autodromo Nazionale Monza_R_2026-09-08T09_13_20Z.duckdb',
        filePath: 'C:\\fake\\Monza.duckdb',
        fileMtimeMs: 1773134000000,
        fileSizeBytes: 1024,
        trackName: 'Autodromo Nazionale Monza',
        sessionType: 'R',
        timestampStr: '2026-09-08T09:13:20Z',
        timestampEpochMs: new Date('2026-09-08T09:13:20Z').getTime(),
      },
    ];

    const mockSession = {
      id: 'session-1',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Grand Prix',
      sessionType: 'Race',
      timestamp: '2026-09-08T09:14:00Z', // 40 seconds delta
      drivers: [],
    } as unknown as DetailedSession;

    const matched = matchDuckDbToSession(duckFiles, mockSession);
    expect(matched).not.toBeNull();
    expect(matched!.trackName).toBe('Autodromo Nazionale Monza');
    expect(matched!.sessionType).toBe('R');
  });

  it('matches DuckDb file to a replay metadata object', () => {
    const duckFiles: DuckDbFileInfo[] = [
      {
        filename: 'Bahrain International Circuit_P_2026-09-13T20_33_32Z.duckdb',
        filePath: 'C:\\fake\\Bahrain.duckdb',
        fileMtimeMs: 1773606812000,
        fileSizeBytes: 1024,
        trackName: 'Bahrain International Circuit',
        sessionType: 'P',
        timestampStr: '2026-09-13T20:33:32Z',
        timestampEpochMs: new Date('2026-09-13T20:33:32Z').getTime(),
      },
    ];

    const mockReplay: ReplayMetadata = {
      filename: 'Bahrain_P1.Vcr',
      filePath: 'C:\\fake\\Bahrain_P1.Vcr',
      fileSizeBytes: 1024,
      mtimeMs: 1773606812000,
      trackName: 'Bahrain International Circuit',
      sessionType: 'Practice',
      timeSliceCount: 100,
      totalEvents: 10,
      durationSec: 120,
      drivers: [],
    };

    const matched = matchDuckDbToReplay(duckFiles, mockReplay, new Date('2026-09-13T20:33:40Z').getTime());
    expect(matched).not.toBeNull();
    expect(matched!.trackName).toBe('Bahrain International Circuit');
  });
});
