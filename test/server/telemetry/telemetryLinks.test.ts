import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionDatabase } from '../../../server/core/db.js';
import type { DetailedSession, DuckDbLapTelemetry, ReplayMetadata } from '../../../server/core/types.js';
import type { TelemetryMetadataRecord } from '../../../server/core/dbTelemetryStore.js';
import type { ReplayFileEntry } from '../../../server/sessions/sessionXmlTypes.js';
import type { DuckDbFileInfo } from '../../../server/telemetry/telemetryMatcher.js';
import { decideTelemetryLinks, TELEMETRY_LINK_RULE, TelemetryLinks } from '../../../server/telemetry/telemetryLinks.js';

const at = (iso: string) => Date.parse(iso);

const duck = (filename: string, iso: string, sessionType = 'P'): DuckDbFileInfo => ({
  filename,
  filePath: `C:\\Telemetry\\${filename}`,
  fileMtimeMs: at(iso),
  fileSizeBytes: 1024,
  trackName: 'Circuit de la Sarthe',
  sessionType,
  timestampStr: iso,
  timestampEpochMs: at(iso),
});

const session = (id: string, iso: string, replayName?: string): DetailedSession => ({
  id,
  trackVenue: 'Circuit de la Sarthe',
  trackCourse: 'Circuit de la Sarthe',
  sessionType: 'Practice',
  sessionName: 'P1',
  timestamp: at(iso),
  drivers: [],
  ...(replayName ? { matchingReplayFile: { name: replayName } } : {}),
} as unknown as DetailedSession);

const replay = (name: string, savedIso: string, durationSec = 600): ReplayFileEntry => ({
  name,
  path: `C:\\Replays\\${name}`,
  sizeBytes: 1,
  trackName: 'Circuit de la Sarthe',
  sessionCode: 'P1',
  mtime: at(savedIso),
  durationSec,
});

const replayMetadata = { trackName: 'Circuit de la Sarthe', sessionType: 'P', durationSec: 600, drivers: [] } as unknown as ReplayMetadata;

const stored = (filename: string, matchedSessionId: string | null, matchedReplayFilename: string | null): TelemetryMetadataRecord => ({
  filename,
  filePath: `C:\\Telemetry\\${filename}`,
  matchedSessionId,
  matchedReplayFilename,
});

describe('decideTelemetryLinks', () => {
  const none = { stored: [], replays: [], loadReplayMetadata: () => null };

  it('gives a file to the closest session only, not to the empty sessions LMU saves after it', () => {
    // Le Mans, 2026-09-14: one DuckDB file, the practice it records (3 laps) and two 0-lap sessions
    // saved 9 and 54 minutes later, all inside the one-hour window.
    const file = duck('Circuit de la Sarthe_P_2026-09-14T18_37_49Z.duckdb', '2026-09-14T18:37:49Z');
    const links = decideTelemetryLinks({
      ...none,
      files: [file],
      sessions: [
        session('15_33_32-97P1', '2026-09-14T19:31:10Z', 'Circuit de la Sarthe P1 50.Vcr'),
        session('14_48_31-61P1', '2026-09-14T18:46:32Z', 'Circuit de la Sarthe P1 49.Vcr'),
        session('14_46_14-22P1', '2026-09-14T18:37:31Z', 'Circuit de la Sarthe P1 48.Vcr'),
      ],
    });

    expect(links).toEqual([{ filename: file.filename, sessionId: '14_46_14-22P1', replayName: 'Circuit de la Sarthe P1 48.Vcr' }]);
  });

  it('lets a session that lost a file take the next free one it matches', () => {
    const links = decideTelemetryLinks({
      ...none,
      files: [duck('first.duckdb', '2026-09-14T18:00:00Z'), duck('second.duckdb', '2026-09-14T18:30:00Z')],
      sessions: [session('a', '2026-09-14T18:00:10Z'), session('b', '2026-09-14T18:05:00Z')],
    });

    expect(links).toEqual([
      { filename: 'first.duckdb', sessionId: 'a', replayName: null },
      { filename: 'second.duckdb', sessionId: 'b', replayName: null },
    ]);
  });

  it('never revisits a stored match, even for a closer session', () => {
    const links = decideTelemetryLinks({
      ...none,
      files: [duck('taken.duckdb', '2026-09-14T18:00:00Z')],
      stored: [stored('taken.duckdb', 'far', null)],
      sessions: [session('far', '2026-09-14T18:50:00Z'), session('close', '2026-09-14T18:00:05Z')],
    });

    expect(links).toEqual([]);
  });

  it('counts a session as matched when its replay holds a file', () => {
    const links = decideTelemetryLinks({
      ...none,
      files: [duck('free.duckdb', '2026-09-14T18:00:00Z')],
      stored: [stored('other.duckdb', null, 'P1 48.Vcr')],
      sessions: [session('s', '2026-09-14T18:00:05Z', 'P1 48.Vcr')],
    });

    expect(links).toEqual([]);
  });

  it('matches a replay whose session has no file, and its session along with it', () => {
    // The replay is saved when the session ends: 10 minutes after the DuckDB recording started.
    const file = duck('replay-only.duckdb', '2026-09-14T18:00:00Z', 'OTHER');
    const loaded: string[] = [];
    const links = decideTelemetryLinks({
      files: [file],
      stored: [],
      // Two hours off the file: outside the session window.
      sessions: [session('late', '2026-09-14T20:00:00Z', 'P1 48.Vcr')],
      replays: [replay('P1 48.Vcr', '2026-09-14T18:10:00Z'), replay('Far P1 1.Vcr', '2026-09-20T18:10:00Z')],
      loadReplayMetadata: name => { loaded.push(name); return replayMetadata; },
    });

    expect(links).toEqual([{ filename: file.filename, sessionId: 'late', replayName: 'P1 48.Vcr' }]);
    // Replays with no free file near them in time are not even loaded.
    expect(loaded).toEqual(['P1 48.Vcr']);
  });
});

describe('TelemetryLinks', () => {
  let db: SessionDatabase;
  let tempDir: string;
  const lap = { lapNumber: 1, lapTimeSec: 90, pointsCount: 0, sampleRateHz: 100, points: [] } as unknown as DuckDbLapTelemetry;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test', 'fixtures', 'telemetry-links-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const onDisk = (file: DuckDbFileInfo): DuckDbFileInfo => {
    const filePath = path.join(tempDir, file.filename);
    fs.writeFileSync(filePath, '');
    return { ...file, filePath };
  };

  it('reads the session file first, then the file of its replay', () => {
    db.upsertTelemetryMetadata(onDisk(duck('session.duckdb', '2026-09-14T18:00:00Z')), 's');
    db.upsertTelemetryMetadata(onDisk(duck('replay.duckdb', '2026-09-14T18:00:00Z')), undefined, 'P1 48.Vcr');
    const links = TelemetryLinks.load(db);

    expect(links.forSession(session('s', '2026-09-14T18:00:00Z', 'P1 48.Vcr'))).toBe('session.duckdb');
    expect(links.forSession(session('t', '2026-09-14T18:00:00Z', 'P1 48.Vcr'))).toBe('replay.duckdb');
    expect(links.forReplay('P1 48.Vcr', { id: 's' })).toBe('session.duckdb');
    expect(links.forReplay('P1 48.Vcr')).toBe('replay.duckdb');
    expect(links.forReplay('P1 49.Vcr')).toBeUndefined();
  });

  it('keeps a deleted file only while some of its laps are cached', () => {
    db.upsertTelemetryMetadata(duck('deleted.duckdb', '2026-09-14T18:00:00Z'), 's');
    expect(TelemetryLinks.load(db).forSession({ id: 's' })).toBeUndefined();

    db.upsertTelemetryLapCache('deleted.duckdb', 1, lap);
    const links = TelemetryLinks.load(db);
    expect(links.forSession({ id: 's' })).toBe('deleted.duckdb');
    expect(links.isOnDisk('deleted.duckdb')).toBe(false);
  });
});

describe('stored telemetry matches', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('never overwrites a stored match', () => {
    db.upsertTelemetryMetadata(duck('a.duckdb', '2026-09-14T18:00:00Z'));
    db.linkTelemetryFiles([{ filename: 'a.duckdb', sessionId: 'first', replayName: null }]);
    db.linkTelemetryFiles([{ filename: 'a.duckdb', sessionId: 'second', replayName: 'P1 48.Vcr' }]);

    expect(db.getTelemetryMetadata()[0]).toMatchObject({ matchedSessionId: 'first', matchedReplayFilename: 'P1 48.Vcr' });
  });

  it('clears the matches stored under an earlier rule once', () => {
    db.upsertTelemetryMetadata(duck('a.duckdb', '2026-09-14T18:00:00Z'), 'old', 'Old.Vcr');

    expect(db.resetTelemetryLinksForRule(TELEMETRY_LINK_RULE)).toBe(true);
    expect(db.getTelemetryMetadata()[0]).toMatchObject({ matchedSessionId: null, matchedReplayFilename: null });

    db.linkTelemetryFiles([{ filename: 'a.duckdb', sessionId: 'new', replayName: null }]);
    expect(db.resetTelemetryLinksForRule(TELEMETRY_LINK_RULE)).toBe(false);
    expect(db.getTelemetryMetadata()[0]).toMatchObject({ matchedSessionId: 'new' });
  });
});
