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

const duck = (filename: string, iso: string, sessionType = 'P', lapsCount = 3): DuckDbFileInfo => ({
  filename,
  filePath: `C:\\Telemetry\\${filename}`,
  fileMtimeMs: at(iso),
  fileSizeBytes: 1024,
  trackName: 'Circuit de la Sarthe',
  sessionType,
  timestampStr: iso,
  timestampEpochMs: at(iso),
  lapsCount,
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
  lapsCount: 3,
});

describe('decideTelemetryLinks', () => {
  const none = { stored: [], replays: [], loadReplayMetadata: () => null };
  const endsAt = (ends: Record<string, string>) => (s: DetailedSession) => (ends[s.id] ? at(ends[s.id]) : undefined);

  it('gives a file to the session it was recorded in, not to the empty sessions LMU saves after it', () => {
    // Le Mans, 2026-09-14: the practice (3 laps, 18:37-18:46) and two 0-lap sessions saved after it.
    const file = duck('Circuit de la Sarthe_P_2026-09-14T18_37_49Z.duckdb', '2026-09-14T18:37:49Z');
    const links = decideTelemetryLinks({
      ...none,
      files: [file],
      sessions: [
        session('15_33_32-97P1', '2026-09-14T19:31:10Z', 'Circuit de la Sarthe P1 50.Vcr'),
        session('14_48_31-61P1', '2026-09-14T18:46:32Z', 'Circuit de la Sarthe P1 49.Vcr'),
        session('14_46_14-22P1', '2026-09-14T18:37:31Z', 'Circuit de la Sarthe P1 48.Vcr'),
      ],
      sessionEndMs: endsAt({ '14_46_14-22P1': '2026-09-14T18:46:14Z', '14_48_31-61P1': '2026-09-14T18:48:31Z', '15_33_32-97P1': '2026-09-14T19:33:32Z' }),
    });

    expect(links).toEqual([{ filename: file.filename, sessionId: '14_46_14-22P1', replayName: 'Circuit de la Sarthe P1 48.Vcr' }]);
  });

  it('gives every file LMU wrote for a session to that session', () => {
    // Monza, 2026-09-18: two short 0-lap files seconds before the real one; a 0-lap session saved after.
    // Algarve, 2026-09-23: the car went out again 6 minutes into qualifying (laps 4-5 in the second file).
    const monza = ['17_52_11', '17_52_59', '17_53_06'].map(t => duck(`Monza_P_2026-09-18T${t}Z.duckdb`, `2026-09-18T${t.replace(/_/g, ':')}Z`));
    const algarve = ['19_19_18', '19_25_40'].map(t => duck(`Algarve_Q_2026-09-23T${t}Z.duckdb`, `2026-09-23T${t.replace(/_/g, ':')}Z`, 'Q'));
    const qualifying = { ...session('15_30_09-72Q1', '2026-09-23T19:18:30Z'), sessionType: 'Qualifying' as const, sessionName: 'Q1' } as DetailedSession;
    const links = decideTelemetryLinks({
      ...none,
      files: [...monza, ...algarve],
      sessions: [session('14_00_52-53P1', '2026-09-18T17:51:56Z'), session('14_03_29-09P1', '2026-09-18T18:01:07Z'), qualifying],
      sessionEndMs: endsAt({ '14_00_52-53P1': '2026-09-18T18:00:52Z', '14_03_29-09P1': '2026-09-18T18:03:29Z', '15_30_09-72Q1': '2026-09-23T19:30:09Z' }),
    });

    expect(links.map(link => [link.filename, link.sessionId])).toEqual([
      ...monza.map(file => [file.filename, '14_00_52-53P1']),
      ...algarve.map(file => [file.filename, '15_30_09-72Q1']),
    ]);
  });

  it('gives a file recorded as a session starts to that session, not the one that just ended', () => {
    const links = decideTelemetryLinks({
      ...none,
      files: [duck('start.duckdb', '2026-09-14T18:46:40Z')],
      sessions: [session('ended', '2026-09-14T18:00:00Z'), session('starting', '2026-09-14T18:46:30Z')],
      sessionEndMs: endsAt({ ended: '2026-09-14T18:46:14Z', starting: '2026-09-14T19:00:00Z' }),
    });

    expect(links).toEqual([{ filename: 'start.duckdb', sessionId: 'starting', replayName: null }]);
  });

  it('never revisits a stored match', () => {
    const links = decideTelemetryLinks({
      ...none,
      files: [duck('taken.duckdb', '2026-09-14T18:00:30Z')],
      stored: [stored('taken.duckdb', 'other', null)],
      sessions: [session('running', '2026-09-14T18:00:00Z')],
    });

    expect(links).toEqual([]);
  });

  it.each([false, true])('separates restarted races sharing their XML start (reverse order: %s)', reverse => {
    // Road Atlanta, 2026-10-08: Restart Race retains 17:59:52.301 in both result logs.
    // The new recording starts ten seconds after the empty attempt ends, inside clock slack.
    const attempts = [
      { ...session('empty', '2026-10-08T17:59:52.301Z', 'R1 2.Vcr'), sessionType: 'Race' as const, sessionName: 'R1' },
      { ...session('completed', '2026-10-08T17:59:52.301Z', 'R1 3.Vcr'), sessionType: 'Race' as const, sessionName: 'R1' },
    ];
    const links = decideTelemetryLinks({
      ...none,
      files: [
        duck('before-restart.duckdb', '2026-10-08T18:00:40Z', 'R', 0),
        duck('after-restart.duckdb', '2026-10-08T18:03:41Z', 'R', 22),
        duck('second-stint.duckdb', '2026-10-08T18:20:00Z', 'R', 8),
      ],
      sessions: reverse ? attempts.reverse() : attempts,
      sessionEndMs: endsAt({ empty: '2026-10-08T18:03:31.718Z', completed: '2026-10-08T18:36:45.170Z' }),
    });

    expect(links).toEqual([
      { filename: 'before-restart.duckdb', sessionId: 'empty', replayName: 'R1 2.Vcr' },
      { filename: 'after-restart.duckdb', sessionId: 'completed', replayName: 'R1 3.Vcr' },
      { filename: 'second-stint.duckdb', sessionId: 'completed', replayName: 'R1 3.Vcr' },
    ]);
  });

  it('matches a replay with no session, when the file was recorded during it', () => {
    const file = duck('replay-only.duckdb', '2026-09-14T18:02:00Z', 'OTHER');
    const loaded: string[] = [];
    const links = decideTelemetryLinks({
      files: [file],
      stored: [],
      sessions: [],
      // Recorded 18:00-18:10; the other replay is days away.
      replays: [replay('P1 48.Vcr', '2026-09-14T18:10:00Z'), replay('Far P1 1.Vcr', '2026-09-20T18:10:00Z')],
      loadReplayMetadata: name => { loaded.push(name); return replayMetadata; },
    });

    expect(links).toEqual([{ filename: file.filename, sessionId: null, replayName: 'P1 48.Vcr' }]);
    // Replays not recording when the file started are not even loaded.
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

  it('serves only session-owned files while retaining replay ownership for maintenance', () => {
    db.upsertTelemetryMetadata(onDisk(duck('session.duckdb', '2026-09-14T18:00:00Z')), 's');
    db.upsertTelemetryMetadata(onDisk(duck('replay.duckdb', '2026-09-14T18:00:00Z')), undefined, 'P1 48.Vcr');
    const links = TelemetryLinks.load(db);

    expect(links.forSession(session('s', '2026-09-14T18:00:00Z', 'P1 48.Vcr'))).toBe('session.duckdb');
    expect(links.forSession(session('t', '2026-09-14T18:00:00Z', 'P1 48.Vcr'))).toBeUndefined();
    expect(links.forReplay('P1 48.Vcr', { id: 's' })).toBe('session.duckdb');
    expect(links.forReplay('P1 48.Vcr')).toBe('replay.duckdb');
    expect(links.forReplay('P1 49.Vcr')).toBeUndefined();
    db.upsertTelemetryLapCache('session.duckdb', 1, lap);
    db.upsertTelemetryLapCache('replay.duckdb', 1, lap);
    expect(db.getTelemetryMetadata('s').map(row => row.filename)).toEqual(['session.duckdb']);
    expect([...db.getTelemetryLapCacheFilenames('s')]).toEqual(['session.duckdb']);
    const scoped = TelemetryLinks.load(db, 's');
    expect(scoped.filesForSession({ id: 's' })).toEqual(['session.duckdb']);
    expect(scoped.row('replay.duckdb')).toBeUndefined();
  });

  it('lists every file of a session in recording order and shows the one with the most laps', () => {
    db.upsertTelemetryMetadata(onDisk(duck('Algarve_Q_2026-09-23T19_25_40Z.duckdb', '2026-09-23T19:25:40Z', 'Q', 2)), 'q');
    db.upsertTelemetryMetadata(onDisk(duck('Algarve_Q_2026-09-23T19_19_18Z.duckdb', '2026-09-23T19:19:18Z', 'Q', 3)), 'q');
    db.upsertTelemetryMetadata(onDisk(duck('Algarve_Q_2026-09-23T19_18_49Z.duckdb', '2026-09-23T19:18:49Z', 'Q', 0)), 'q');
    const links = TelemetryLinks.load(db);

    expect(links.filesForSession({ id: 'q' })).toEqual([
      'Algarve_Q_2026-09-23T19_18_49Z.duckdb', 'Algarve_Q_2026-09-23T19_19_18Z.duckdb', 'Algarve_Q_2026-09-23T19_25_40Z.duckdb',
    ]);
    expect(links.forSession({ id: 'q' })).toBe('Algarve_Q_2026-09-23T19_19_18Z.duckdb');
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
