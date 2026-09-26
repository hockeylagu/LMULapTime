import { describe, it, expect } from 'vitest';
import {
  parseDuckDbFilename,
  normalizeSessionType,
  matchDuckDbToSession,
  matchDuckDbToReplay,
  enrichDuckDbDirectory,
  DuckDbFileInfo,
} from '../../../server/telemetry/telemetryMatcher.js';
import { DetailedSession, ReplayMetadata } from '../../../server/core/types.js';

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

  it('preserves underscore-containing track names in fallback filenames', () => {
    const parsed = parseDuckDbFilename('Circuit_de_la_Sarthe_R_partial.duckdb');
    expect(parsed).toEqual({
      trackName: 'Circuit_de_la_Sarthe',
      sessionType: 'R',
      timestampStr: '',
      timestampEpochMs: 0,
    });
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

  it('matches Le Mans aliases and chooses the nearest telemetry session', () => {
    const duckFiles: DuckDbFileInfo[] = [
      {
        filename: 'Circuit de la Sarthe_R_2026-09-14T18_58_09Z.duckdb',
        filePath: 'C:\\fake\\lemans-old.duckdb',
        fileMtimeMs: 0,
        fileSizeBytes: 1024,
        trackName: 'Circuit de la Sarthe',
        sessionType: 'R',
        timestampStr: '2026-09-14T18:58:09Z',
        timestampEpochMs: new Date('2026-09-14T18:58:09Z').getTime(),
      },
      {
        filename: 'Circuit de la Sarthe_R_2026-09-14T19_42_54Z.duckdb',
        filePath: 'C:\\fake\\lemans-last.duckdb',
        fileMtimeMs: 0,
        fileSizeBytes: 1024,
        trackName: 'Circuit de la Sarthe',
        sessionType: 'R',
        timestampStr: '2026-09-14T19:42:54Z',
        timestampEpochMs: new Date('2026-09-14T19:42:54Z').getTime(),
      },
    ];

    const session = {
      id: 'lemans-session',
      trackVenue: 'Le Mans',
      trackCourse: '24 Heures du Mans',
      sessionType: 'Race',
      timestamp: '2026-09-14T19:43:10Z',
      drivers: [],
    } as unknown as DetailedSession;

    expect(matchDuckDbToSession(duckFiles, session)?.filename).toBe(
      'Circuit de la Sarthe_R_2026-09-14T19_42_54Z.duckdb'
    );
  });

  it('allows local versus UTC timestamp drift when matching a session', () => {
    const duckFile: DuckDbFileInfo = {
      filename: 'Circuit de la Sarthe_R_2026-09-14T18_58_09Z.duckdb',
      filePath: 'C:\\fake\\lemans.duckdb',
      fileMtimeMs: 0,
      fileSizeBytes: 1024,
      trackName: 'Circuit de la Sarthe',
      sessionType: 'R',
      timestampStr: '2026-09-14T18:58:09Z',
      timestampEpochMs: new Date('2026-09-14T18:58:09Z').getTime(),
    };
    const session = {
      id: 'lemans-offset-session',
      trackVenue: 'Circuit de la Sarthe',
      trackCourse: 'Circuit de la Sarthe',
      sessionType: 'Race',
      timestamp: '2026-09-14T15:31:10',
      drivers: [],
    } as unknown as DetailedSession;

    expect(matchDuckDbToSession([duckFile], session)).toBe(duckFile);
  });

  it('prefers the larger recording when duplicate files belong to one session burst', () => {
    const partial: DuckDbFileInfo = {
      filename: 'Circuit de la Sarthe_R_partial.duckdb',
      filePath: 'C:\\fake\\partial.duckdb',
      fileMtimeMs: 0,
      fileSizeBytes: 1024,
      trackName: 'Circuit de la Sarthe',
      sessionType: 'R',
      timestampStr: '2026-09-14T18:58:09Z',
      timestampEpochMs: new Date('2026-09-14T18:58:09Z').getTime(),
    };
    const complete = { ...partial,
      filename: 'Circuit de la Sarthe_R_complete.duckdb',
      filePath: 'C:\\fake\\complete.duckdb',
      fileSizeBytes: 37 * 1024 * 1024,
      timestampStr: '2026-09-14T18:58:30Z',
      timestampEpochMs: new Date('2026-09-14T18:58:30Z').getTime(),
    };
    const session = {
      id: 'lemans-duplicate-session',
      trackVenue: 'Circuit de la Sarthe',
      trackCourse: 'Circuit de la Sarthe',
      sessionType: 'Race',
      timestamp: '2026-09-14T18:58:00Z',
      drivers: [],
    } as unknown as DetailedSession;

    expect(matchDuckDbToSession([partial, complete], session)).toBe(complete);
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

  it('rejects a low-margin session match instead of silently choosing one candidate', () => {
    const first = {
      filename: 'Spa_P_2026-09-14T10_00_00Z.duckdb',
      filePath: 'C:\\fake\\spa-first.duckdb',
      fileMtimeMs: 0,
      fileSizeBytes: 1024,
      trackName: 'Spa-Francorchamps',
      sessionType: 'P',
      timestampStr: '2026-09-14T10:00:00Z',
      timestampEpochMs: new Date('2026-09-14T10:00:00Z').getTime(),
    } satisfies DuckDbFileInfo;
    const second = { ...first,
      filename: 'Spa_P_2026-09-14T10_00_08Z.duckdb',
      filePath: 'C:\\fake\\spa-second.duckdb',
      timestampStr: '2026-09-14T10:00:08Z',
      timestampEpochMs: new Date('2026-09-14T10:00:08Z').getTime(),
    };
    const session = {
      id: 'ambiguous-session',
      trackVenue: 'Spa-Francorchamps',
      trackCourse: 'Grand Prix',
      sessionType: 'Practice',
      timestamp: '2026-09-14T10:00:04Z',
      drivers: [],
    } as unknown as DetailedSession;

    expect(matchDuckDbToSession([first, second], session)).toBeNull();
  });

  it('returns null for empty candidates and rejects incompatible track or session type', () => {
    const session = {
      id: 'session', trackVenue: 'Spa-Francorchamps', trackCourse: 'Grand Prix',
      sessionType: 'Race', timestamp: '2026-09-14T10:00:00Z', drivers: [],
    } as unknown as DetailedSession;
    expect(matchDuckDbToSession([], session)).toBeNull();

    const wrongTrack: DuckDbFileInfo = {
      filename: 'Bahrain_R_2026-09-14T10_00_00Z.duckdb', filePath: 'wrong', fileMtimeMs: 0,
      fileSizeBytes: 1, trackName: 'Bahrain', sessionType: 'R', timestampStr: '', timestampEpochMs: 0,
    };
    const wrongType = { ...wrongTrack, trackName: 'Spa-Francorchamps', sessionType: 'P' };
    expect(matchDuckDbToSession([wrongTrack, wrongType], session)).toBeNull();
  });

  it('uses a single untimed candidate but rejects multiple untimed candidates', () => {
    const replay: ReplayMetadata = {
      filename: 'Spa_P1.Vcr', filePath: 'C:\\fake\\Spa_P1.Vcr', fileSizeBytes: 1, mtimeMs: 0,
      trackName: 'Spa-Francorchamps', sessionType: 'Practice', timeSliceCount: 1, totalEvents: 1,
      durationSec: 1, drivers: [],
    };
    const candidate: DuckDbFileInfo = {
      filename: 'Spa_P_partial.duckdb', filePath: 'single', fileMtimeMs: 0, fileSizeBytes: 1,
      trackName: 'Spa-Francorchamps', sessionType: 'P', timestampStr: '', timestampEpochMs: 0,
    };
    expect(matchDuckDbToReplay([candidate], replay)).toBe(candidate);
    expect(matchDuckDbToReplay([candidate, { ...candidate, filename: 'Spa_P_other.duckdb', filePath: 'other' }], replay)).toBeNull();
  });

  it('rejects replay candidates outside the time window and with mismatched drivers', () => {
    const replay: ReplayMetadata = {
      filename: 'Spa_P1.Vcr', filePath: 'C:\\fake\\Spa_P1.Vcr', fileSizeBytes: 1, mtimeMs: 0,
      trackName: 'Spa-Francorchamps', sessionType: 'Practice', timeSliceCount: 1, totalEvents: 1,
      durationSec: 1, drivers: [{ slot: 1, name: 'Samuel', carNumber: '1', vehicleId: 'car' }],
    };
    const candidate: DuckDbFileInfo = {
      filename: 'Spa_P_2026.duckdb', filePath: 'candidate', fileMtimeMs: 0, fileSizeBytes: 1,
      trackName: 'Spa-Francorchamps', sessionType: 'P', timestampStr: '', timestampEpochMs: 2_000_000,
      driverName: 'Other Driver',
    };
    expect(matchDuckDbToReplay([candidate], replay, 0, 300)).toBeNull();
  });

  it('prefers the nearest replay candidate when the time margin is unambiguous', () => {
    const replay: ReplayMetadata = {
      filename: 'Spa_P1.Vcr', filePath: 'C:\\fake\\Spa_P1.Vcr', fileSizeBytes: 1, mtimeMs: 0,
      trackName: 'Spa-Francorchamps', sessionType: 'Practice', timeSliceCount: 1, totalEvents: 1,
      durationSec: 1, drivers: [],
    };
    const makeCandidate = (name: string, timestampEpochMs: number): DuckDbFileInfo => ({
      filename: name, filePath: name, fileMtimeMs: 0, fileSizeBytes: 1,
      trackName: 'Spa-Francorchamps', sessionType: 'P', timestampStr: '', timestampEpochMs,
    });
    const nearest = makeCandidate('nearest.duckdb', 105_000);
    const distant = makeCandidate('distant.duckdb', 120_000);
    expect(matchDuckDbToReplay([distant, nearest], replay, 100_000)?.filename).toBe('nearest.duckdb');
  });

  describe('enrichDuckDbDirectory', () => {
    it('returns an empty array when directory does not exist', async () => {
      const progressUpdates: unknown[] = [];
      const results = await enrichDuckDbDirectory('C:\\non_existent_telemetry_directory_xyz', {
        onProgress: (p) => progressUpdates.push(p),
      });
      expect(results).toEqual([]);
      expect(progressUpdates).toHaveLength(0);
    });
  });
});

