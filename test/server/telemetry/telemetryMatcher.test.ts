import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stands in for the DuckDB file: what the next reader opened will report, and every reader opened.
const duckdb = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  laps: [] as Array<{ lapTimeSec: number }>,
  openError: null as Error | null,
  opened: [] as Array<{ filePath: string; closed: boolean }>,
}));
vi.mock('../../../server/telemetry/duckdbReader.js', () => ({
  DuckDbReader: class {
    private readonly handle: { filePath: string; closed: boolean };
    constructor(filePath: string) {
      this.handle = { filePath, closed: false };
      duckdb.opened.push(this.handle);
    }
    async open() { if (duckdb.openError) throw duckdb.openError; }
    async getMetadata() { return duckdb.metadata; }
    async getLapList() { return duckdb.laps; }
    async close() { this.handle.closed = true; }
  },
}));

import {
  parseDuckDbFilename,
  scanDuckDbDirectory,
  enrichDuckDbFileInfo,
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

  it('matches replay to DuckDB using durationSec when replay file mtime was recorded at session end', () => {
    const replay: ReplayMetadata = {
      filename: 'Daytona_R1.Vcr',
      filePath: 'C:\\fake\\Daytona_R1.Vcr',
      fileSizeBytes: 1,
      mtimeMs: 12_400_000,
      trackName: 'Daytona International Speedway',
      sessionType: 'Race',
      timeSliceCount: 100,
      totalEvents: 1,
      durationSec: 2400, // 40-minute race
      drivers: [{ slot: 0, name: 'Samuel Lague', isPlayer: true, vehicleId: 'car' }],
    };
    const candidate: DuckDbFileInfo = {
      filename: 'Daytona_R_session_start.duckdb',
      filePath: 'C:\\fake\\Daytona.duckdb',
      fileMtimeMs: 0,
      fileSizeBytes: 1000,
      trackName: 'Daytona International Speedway',
      sessionType: 'R',
      timestampStr: '',
      timestampEpochMs: 10_000_000, // session start time matches 12_400_000 - 2400*1000
      driverName: 'Samuel Lague',
    };
    const matched = matchDuckDbToReplay([candidate], replay, 12_400_000, 300);
    expect(matched).not.toBeNull();
    expect(matched?.filename).toBe('Daytona_R_session_start.duckdb');
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

  it('rejects a low-margin replay match instead of silently choosing one candidate', () => {
    const at = (filename: string, iso: string): DuckDbFileInfo => ({
      filename, filePath: `C:\\fake\\${filename}`, fileMtimeMs: 0, fileSizeBytes: 1024,
      trackName: 'Spa', sessionType: 'R', timestampStr: iso, timestampEpochMs: Date.parse(iso),
    });
    const replay = { filename: 'Spa R1.Vcr', trackName: 'Spa', sessionType: 'Race', drivers: [] } as unknown as ReplayMetadata;
    const savedAt = Date.parse('2026-09-14T11:00:00Z');

    expect(matchDuckDbToReplay([at('a.duckdb', '2026-09-14T11:00:10Z'), at('b.duckdb', '2026-09-14T11:00:12Z')], replay, savedAt)).toBeNull();
    expect(matchDuckDbToReplay([at('a.duckdb', '2026-09-14T11:00:10Z'), at('b.duckdb', '2026-09-14T11:03:00Z')], replay, savedAt)?.filename).toBe('a.duckdb');
  });

  describe('reading the telemetry folder', () => {
    let dir: string;
    const spaName = 'Spa_P_2026-09-13T20_33_32Z.duckdb';

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-duckdb-'));
      duckdb.metadata = {};
      duckdb.laps = [];
      duckdb.openError = null;
      duckdb.opened = [];
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('lists the DuckDB files it can name, with their size and filename time', () => {
      fs.writeFileSync(path.join(dir, spaName), 'x'.repeat(10));
      fs.writeFileSync(path.join(dir, 'notes.txt'), '');
      fs.writeFileSync(path.join(dir, 'unnamed.duckdb'), '');

      const files = scanDuckDbDirectory(dir);

      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        filename: spaName, filePath: path.join(dir, spaName), fileSizeBytes: 10,
        trackName: 'Spa', sessionType: 'P', timestampEpochMs: Date.parse('2026-09-13T20:33:32Z'),
      });
    });

    it('takes the track, session, driver and recording time from inside the file, and remembers them', async () => {
      fs.writeFileSync(path.join(dir, spaName), '');
      duckdb.metadata = { trackName: 'Circuit de Spa-Francorchamps', sessionType: 'Q', driverName: 'Test Driver', carName: 'Porsche 963', RecordingTime: '2026-09-13T19_30_00Z' };
      duckdb.laps = [{ lapTimeSec: 12 }, { lapTimeSec: 139.4 }, { lapTimeSec: 137.9 }];

      const [listed] = scanDuckDbDirectory(dir);
      const enriched = await enrichDuckDbFileInfo(listed);

      expect(enriched).toMatchObject({
        trackName: 'Circuit de Spa-Francorchamps', sessionType: 'Q', driverName: 'Test Driver', carName: 'Porsche 963',
        timestampEpochMs: Date.parse('2026-09-13T19:30:00Z'), lapsCount: 3, bestLapTime: 137.9,
      });
      expect(duckdb.opened[0].closed).toBe(true);
      // A later folder scan keeps what the file said instead of re-reading the filename.
      expect(scanDuckDbDirectory(dir)[0]).toMatchObject({ trackName: 'Circuit de Spa-Francorchamps', sessionType: 'Q', driverName: 'Test Driver' });
    });

    it('keeps the filename values and records the error when the file cannot be read', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fs.writeFileSync(path.join(dir, 'Monza_R_2026-09-13T20_33_32Z.duckdb'), '');
      duckdb.openError = new Error('database is locked');

      const [listed] = scanDuckDbDirectory(dir);
      const enriched = await enrichDuckDbFileInfo(listed);

      expect(enriched).toMatchObject({ trackName: 'Monza', sessionType: 'R', enrichmentError: 'database is locked' });
      expect(duckdb.opened[0].closed).toBe(true);
    });

    it('re-reads only the files that changed or failed last time', async () => {
      for (const name of ['Spa_P_2026-09-13T20_33_32Z.duckdb', 'Spa_Q_2026-09-13T21_33_32Z.duckdb', 'Spa_R_2026-09-13T22_33_32Z.duckdb']) {
        fs.writeFileSync(path.join(dir, name), 'data');
      }
      const listed = scanDuckDbDirectory(dir);
      const byType = (type: string) => listed.find(file => file.sessionType === type)!;
      const cachedFiles = new Map<string, DuckDbFileInfo>([
        [byType('P').filePath, { ...byType('P'), lapsCount: 7 }],
        [byType('Q').filePath, { ...byType('Q'), fileSizeBytes: 1 }],
        [byType('R').filePath, { ...byType('R'), enrichmentError: 'locked' }],
      ]);
      const progress: Array<{ currentFile: string; cached: boolean }> = [];

      const results = await enrichDuckDbDirectory(dir, { cachedFiles, onProgress: p => progress.push(p) });

      expect(results).toHaveLength(3);
      expect(results.find(file => file.sessionType === 'P')?.lapsCount).toBe(7);
      expect(duckdb.opened.map(reader => path.basename(reader.filePath)).sort()).toEqual([
        'Spa_Q_2026-09-13T21_33_32Z.duckdb', 'Spa_R_2026-09-13T22_33_32Z.duckdb',
      ]);
      expect(progress.filter(p => p.cached).map(p => p.currentFile)).toEqual(['Spa_P_2026-09-13T20_33_32Z.duckdb']);
    });
  });
});
