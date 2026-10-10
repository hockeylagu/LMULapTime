import { querySessionPage } from '../../../../server/core/sessionSummaries/pageQueries.js';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession, LapData } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { restoreStoredSessionLinks, upsertSession } from '../../../../server/core/dbSessionStore.js';
import { backfillSessionSummaries, isSessionSummaryReady, persistSessionProjection, readCompactSession } from '../../../../server/core/sessionSummaries/store.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../../../shared/types/sessionSummaries.js';

const lap: LapData = { lapNum: 1, position: 1, lapTime: 90, lapTimeString: '1:30', s1: 30, s2: 30, s3: 30,
  topSpeed: 250, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true };
const session: DetailedSession = { id: 'one', filename: 'one.xml', filePath: 'one.xml', trackVenue: 'Monza', trackCourse: 'GP',
  trackEvent: '', trackLengthMeters: 5793, timeString: 'date', timestamp: 1, sessionType: 'Race', sessionName: 'R1', driversCount: 1,
  playerDriver: { name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: '', isPlayer: true, position: 1,
    classPosition: 1, bestLapTime: 90, bestLapTimeString: '1:30', bestLapNum: 1, bestS1: 30, bestS2: 30, bestS3: 30,
    theoreticalBest: 90, theoreticalBestString: '1:30', lapsCount: 1, laps: [lap] },
  drivers: [{ name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: '', isPlayer: true, position: 1,
    classPosition: 1, bestLapTime: 90, bestLapTimeString: '1:30', bestLapNum: 1, bestS1: 30, bestS2: 30, bestS3: 30,
    theoreticalBest: 90, theoreticalBestString: '1:30', lapsCount: 1, laps: [lap] }] };

describe('session summary persistence', () => {
  it('writes source and projection atomically and serves a compact page without nested laps', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, session, 'one.xml', 1, 10);
    const compact = readCompactSession(db, 'one');
    expect(compact?.playerDriver).toMatchObject({ cleanLapsCount: 1, completedLapsCount: 1 });
    expect(compact?.playerDriver).not.toHaveProperty('laps');
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_laps WHERE leaderboard_eligible = 1').get()).toMatchObject({ count: 1 });
    expect(querySessionPage(db, { page: 1, pageSize: 10, track: 'monza_gp' }).total).toBe(1);
    db.close();
  });

  it('rolls back source and projection together if projection persistence fails', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    db.exec('DROP TABLE session_driver_condition_summaries');
    expect(() => upsertSession(db, session, 'one.xml', 1, 10)).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toMatchObject({ count: 0 });
    db.close();
  });

  it('backfills only the requested bounded batch from retained session JSON', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, session, 'one.xml', 1, 10);
    upsertSession(db, { ...session, id: 'two', filename: 'two.xml' }, 'two.xml', 2, 10);
    db.exec('UPDATE sessions SET projection_version=0');
    expect(backfillSessionSummaries(db, 1).processed).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE projection_version=0').get()).toMatchObject({ count: 1 });
    expect(backfillSessionSummaries(db, 1).processed).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE projection_version=0').get()).toMatchObject({ count: 0 });
    db.close();
  });

  it('resumes a partially persisted rebuild and rejects an older source projection', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, session, 'missing-one.xml', 1, 10);
    upsertSession(db, { ...session, id: 'two', filename: 'two.xml' }, 'missing-two.xml', 2, 10);
    db.exec('UPDATE sessions SET projection_version=0');
    expect(backfillSessionSummaries(db, 1).processed).toBe(1);
    const persisted = db.serialize();
    db.close();
    const reopened = new Database(persisted);
    try {
      initDbSchema(reopened);
      expect(backfillSessionSummaries(reopened, 1).processed).toBe(1);
      expect(backfillSessionSummaries(reopened, 1).processed).toBe(0);
      const before = readCompactSession(reopened, session.id);
      const revision = reopened.prepare("SELECT value FROM cache_metadata WHERE key='session_data_revision'").get();
      expect(() => persistSessionProjection(reopened, { ...session, sessionName: 'stale' }, 0)).toThrow('stale');
      expect(readCompactSession(reopened, session.id)).toEqual(before);
      expect(reopened.prepare("SELECT value FROM cache_metadata WHERE key='session_data_revision'").get()).toEqual(revision);
    } finally { reopened.close(); }
  });

  it('leaves a session it cannot summarize out of history reads instead of stalling the rebuild', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, session, 'one.xml', 1, 1);
    upsertSession(db, { ...session, id: 'two', filename: 'two.xml', timestamp: 2 }, 'two.xml', 1, 1);
    db.exec(`
      UPDATE sessions SET projection_version=0;
      CREATE TRIGGER fail_one BEFORE INSERT ON session_driver_condition_summaries
      WHEN NEW.session_id = 'one'
      BEGIN SELECT RAISE(ABORT, 'projection error'); END;
    `);
    expect(isSessionSummaryReady(db)).toBe(false);

    const batch = backfillSessionSummaries(db, 10);

    expect(batch.processed).toBe(2);
    expect(batch.failed.map(failure => failure.id)).toEqual(['one']);
    expect(isSessionSummaryReady(db)).toBe(true);
    expect(backfillSessionSummaries(db, 10).processed).toBe(0);
    expect(readCompactSession(db, 'one')).toMatchObject({ id: 'one', isEmpty: true });
    expect(readCompactSession(db, 'one')?.playerDriver).toBeUndefined();
    expect(db.prepare("SELECT count(*) AS count FROM session_drivers WHERE session_id='one' AND clean_laps_count IS NOT NULL").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT projection_error FROM sessions WHERE id='one'").get()).toMatchObject({ projection_error: expect.any(String) });
    expect(querySessionPage(db, {}).sessions.map(card => card.id)).toEqual(['two', 'one']);
    db.close();
  });

  it('answers readiness from the projection index, without reading session JSON', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT 1 FROM sessions WHERE projection_version != ? OR projection_revision != source_revision LIMIT 1')
      .all(1) as Array<{ detail: string }>;
    expect(plan.map(row => row.detail).join(' ')).toContain('COVERING INDEX idx_sessions_ready');
    db.close();
  });

  it('rebuilds version-two aggregates from retained source in bounded batches without changing source revisions', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      upsertSession(db, session, 'deleted-one.xml', 1, 1);
      upsertSession(db, { ...session, id: 'two' }, 'deleted-two.xml', 2, 1);
      const source = db.prepare('SELECT id,source_revision FROM sessions ORDER BY id').all();
      db.exec('UPDATE sessions SET projection_version=2; DELETE FROM session_summary_facts');
      expect(isSessionSummaryReady(db)).toBe(false);
      expect(backfillSessionSummaries(db, 1).processed).toBe(1);
      expect(db.prepare('SELECT count(*) n FROM session_summary_facts').get()).toEqual({ n: 1 });
      expect(backfillSessionSummaries(db, 1).processed).toBe(1);
      expect(isSessionSummaryReady(db)).toBe(true);
      expect(db.prepare('SELECT id,source_revision FROM sessions ORDER BY id').all()).toEqual(source);
      expect(db.prepare('SELECT projection_version FROM sessions WHERE id=?').get('one')).toEqual({ projection_version: SESSION_SUMMARY_PROJECTION_VERSION });
      expect(db.prepare('SELECT laps_count,distance_km,driving_time_sum FROM session_summary_facts WHERE session_id=?').get('one'))
        .toEqual({ laps_count: 1, distance_km: 5.793, driving_time_sum: 90 });
    } finally { db.close(); }
  });

  it('replaces a session contribution on source updates and rolls it back with the source on failure', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      upsertSession(db, session, 'one.xml', 1, 1);
      const changed = { ...session, trackLengthMeters: 6000, drivers: [{ ...session.drivers[0], positionGain: 2 }] };
      upsertSession(db, changed, 'one.xml', 2, 1);
      expect(db.prepare('SELECT count(*) n,sum(distance_km) km,sum(position_gain) gain FROM session_summary_facts').get())
        .toEqual({ n: 1, km: 6, gain: 2 });
      db.exec("CREATE TRIGGER reject_aggregate BEFORE INSERT ON session_summary_facts BEGIN SELECT RAISE(ABORT,'aggregate rejected'); END;");
      expect(() => upsertSession(db, session, 'one.xml', 3, 1)).toThrow('aggregate rejected');
      expect(db.prepare('SELECT distance_km FROM session_summary_facts').get()).toEqual({ distance_km: 6 });
      expect(db.prepare('SELECT file_mtime FROM sessions').get()).toEqual({ file_mtime: 2 });
    } finally { db.close(); }
  });

  it('keeps the stored replay link and DuckDB file when a session is parsed again', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const link = { name: 'Monza R1.Vcr', path: 'Monza R1.Vcr', sizeBytes: 1 };
    upsertSession(db, { ...session, matchingReplayFile: link, duckdbFilename: 'monza.duckdb', hasDuckDbTelemetry: true }, 'one.xml', 1, 1);
    const reparsed: DetailedSession = { ...session };

    restoreStoredSessionLinks(db, reparsed);

    expect(reparsed.matchingReplayFile).toMatchObject(link);
    expect(reparsed).toMatchObject({ duckdbFilename: 'monza.duckdb', hasDuckDbTelemetry: true });
    db.close();
  });
});

