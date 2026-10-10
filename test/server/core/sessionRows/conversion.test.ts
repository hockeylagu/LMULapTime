import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from '../../../../server/core/types.js';
import { memoryDb, session, driver, lap } from './builders.js';
import {
  isSessionJsonRemoved,
  canConvertSessions,
  backupSessionsJsonToSidecar,
  rebuildSessionsTableWithoutJson,
  convertSessionsToNormalizedStorage,
  restoreSessionsJsonFromSidecar,
  KEPT_SESSION_COLUMNS,
  SESSION_JSON_REMOVED_AT_KEY,
} from '../../../../server/core/sessionRows/conversion.js';
import { loadSession } from '../../../../server/core/sessionRows/access.js';
import { upsertSession, updateSessionMatchingReplay } from '../../../../server/core/dbSessionStore.js';
import { NORMALIZED_SESSION_VERSION } from '../../../../server/core/sessionRows/schema.js';
import { getMetadata } from '../../../../server/core/dbMetadataStore.js';

describe('Phase 3b: Normalized session storage conversion', () => {
  let db: DatabaseType;
  let tmpDir: string;
  let sidecarPath: string;

  beforeEach(() => {
    db = memoryDb();
    // Simulate pre-conversion database with legacy JSON columns
    db.exec(`
      ALTER TABLE sessions ADD COLUMN data_json TEXT;
      ALTER TABLE sessions ADD COLUMN metadata_json TEXT;
      ALTER TABLE sessions ADD COLUMN summary_json TEXT;
    `);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-conv-test-'));
    sidecarPath = path.join(tmpDir, 'test-sidecar.db');
  });

  const seedLegacySessionJson = (targetDb: DatabaseType, s: DetailedSession) => {
    targetDb.prepare('UPDATE sessions SET data_json = ?, metadata_json = ? WHERE id = ?')
      .run(JSON.stringify(s), JSON.stringify(s), s.id);
  };

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it('canConvertSessions returns true when empty or all rows verified', () => {
    expect(canConvertSessions(db)).toEqual({
      canConvert: true,
      totalCount: 0,
      unverifiedCount: 0,
      unverifiedIds: [],
    });

    const s1 = session([driver('Driver 1', [lap(1)])], { id: 's1' });
    upsertSession(db, s1, s1.filePath, 0, 1000);
    expect(canConvertSessions(db).canConvert).toBe(true);

    // Unverified row blocks conversion
    db.prepare('UPDATE sessions SET normalized_version = 0 WHERE id = ?').run('s1');
    const blocked = canConvertSessions(db);
    expect(blocked.canConvert).toBe(false);
    expect(blocked.unverifiedCount).toBe(1);
    expect(blocked.unverifiedIds).toEqual(['s1']);

    // Negative (mismatched) row also blocks conversion
    db.prepare('UPDATE sessions SET normalized_version = -2 WHERE id = ?').run('s1');
    expect(canConvertSessions(db).canConvert).toBe(false);

    // Re-verifying allows conversion again
    db.prepare('UPDATE sessions SET normalized_version = ? WHERE id = ?').run(NORMALIZED_SESSION_VERSION, 's1');
    expect(canConvertSessions(db).canConvert).toBe(true);
  });

  it('backupSessionsJsonToSidecar backs up data_json and metadata_json', () => {
    const s1 = session([driver('Driver 1', [lap(1)])], { id: 's1' });
    const s2 = session([driver('Driver 2', [lap(1)])], { id: 's2' });
    upsertSession(db, s1, s1.filePath, 0, 1000);
    upsertSession(db, s2, s2.filePath, 0, 1000);
    seedLegacySessionJson(db, s1);
    seedLegacySessionJson(db, s2);

    const count = backupSessionsJsonToSidecar(db, sidecarPath);
    expect(count).toBe(2);
    expect(fs.existsSync(sidecarPath)).toBe(true);

    // Attach sidecar and verify its contents directly
    db.exec(`ATTACH DATABASE '${sidecarPath.replace(/\\/g, '/')}' AS sidecar_verify;`);
    const rows = db.prepare('SELECT id, data_json, metadata_json FROM sidecar_verify.sessions_json ORDER BY id').all() as Array<{
      id: string;
      data_json: string;
      metadata_json: string;
    }>;
    db.exec('DETACH DATABASE sidecar_verify;');

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('s1');
    expect(rows[1].id).toBe('s2');
    expect(JSON.parse(rows[0].data_json).id).toBe('s1');
    expect(JSON.parse(rows[0].metadata_json).id).toBe('s1');
  });

  it('rebuildSessionsTableWithoutJson drops JSON columns and keeps all 58 columns and indexes', () => {
    const s1 = session([driver('Driver 1', [lap(1)])], { id: 's1', trackVenue: 'Spa', trackCourse: 'Grand Prix' });
    upsertSession(db, s1, s1.filePath, 12345, 1000);

    expect(isSessionJsonRemoved(db)).toBe(false);

    // Rebuild table
    rebuildSessionsTableWithoutJson(db);

    expect(isSessionJsonRemoved(db)).toBe(true);
    expect(getMetadata(db, SESSION_JSON_REMOVED_AT_KEY)).not.toBeNull();

    // Check table info: metadata_json, data_json, summary_json should not exist
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name);
    expect(cols).not.toContain('data_json');
    expect(cols).not.toContain('metadata_json');
    expect(cols).not.toContain('summary_json');

    // Every kept column must exist
    for (const kept of KEPT_SESSION_COLUMNS) {
      expect(cols).toContain(kept);
    }

    // Verify row data integrity
    const row = db.prepare('SELECT id, track_venue, track_course, file_mtime FROM sessions WHERE id = ?').get('s1') as {
      id: string;
      track_venue: string;
      track_course: string;
      file_mtime: number;
    };
    expect(row.id).toBe('s1');
    expect(row.track_venue).toBe('Spa');
    expect(row.track_course).toBe('Grand Prix');
    expect(row.file_mtime).toBe(12345);

    // Verify all 9 indexes exist
    const indexList = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all() as Array<{ name: string }>).map(i => i.name);
    expect(indexList).toContain('idx_sessions_timestamp');
    expect(indexList).toContain('idx_sessions_track');
    expect(indexList).toContain('idx_sessions_ready');
    expect(indexList).toContain('idx_sessions_layout_timestamp');
    expect(indexList).toContain('idx_sessions_layout_kind_timestamp');
    expect(indexList).toContain('idx_sessions_recording');
    expect(indexList).toContain('idx_sessions_track_course');
    expect(indexList).toContain('idx_sessions_updated');
    expect(indexList).toContain('idx_sessions_file_mtime');

    // Idempotent: running again is a no-op
    rebuildSessionsTableWithoutJson(db);
    expect(isSessionJsonRemoved(db)).toBe(true);
  });

  it('rolls back atomically if an error occurs during table rebuild', () => {
    const s1 = session([driver('Driver 1', [lap(1)])], { id: 's1' });
    upsertSession(db, s1, s1.filePath, 0, 1000);
    seedLegacySessionJson(db, s1);

    // Inject an error mid-rebuild by creating sessions_new beforehand with conflicting schema
    db.exec('CREATE TABLE sessions_new (id INTEGER PRIMARY KEY);');

    expect(() => rebuildSessionsTableWithoutJson(db)).toThrow();

    // Verify that sessions table is intact and still contains data_json
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name);
    expect(cols).toContain('data_json');
    expect(cols).toContain('metadata_json');
    expect(isSessionJsonRemoved(db)).toBe(false);
    expect(getMetadata(db, SESSION_JSON_REMOVED_AT_KEY)).toBeNull();
  });

  it('full convertSessionsToNormalizedStorage end-to-end and post-conversion operations', () => {
    const s1 = session([driver('Player', [lap(1)], { isPlayer: true })], { id: 's1', trackVenue: 'Spa' });
    upsertSession(db, s1, s1.filePath, 0, 1000);
    seedLegacySessionJson(db, s1);

    // Perform conversion
    const result = convertSessionsToNormalizedStorage(db, sidecarPath);
    expect(result.converted).toBe(true);
    expect(result.rowsBackedUp).toBe(1);
    expect(isSessionJsonRemoved(db)).toBe(true);

    // loadSession still loads from normalized rows
    const loaded = loadSession(db, 's1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('s1');
    expect(loaded?.playerDriver?.name).toBe('Player');

    // Subsequent upsertSession works without error on converted database
    const s2 = session([driver('Player 2', [lap(1)], { isPlayer: true })], { id: 's2', trackVenue: 'Le Mans' });
    upsertSession(db, s2, s2.filePath, 0, 1000);

    const loaded2 = loadSession(db, 's2');
    expect(loaded2).not.toBeNull();
    expect(loaded2?.id).toBe('s2');

    // Targeted updates work without error on converted database
    const replayLink = {
      name: 'replay_test.Vcr',
      path: 'C:/Replays/replay_test.Vcr',
      sizeBytes: 5000,
      eventTitle: 'Race',
      splitNo: 1,
      eventType: 'Race',
      durationSec: 120,
    };
    const linkResult = updateSessionMatchingReplay(db, 's2', replayLink);
    expect(linkResult.updated).toBe(true);
  });

  it('restoreSessionsJsonFromSidecar restores JSON columns and clears conversion flag', () => {
    const s1 = session([driver('Player', [lap(1)], { isPlayer: true })], { id: 's1', trackVenue: 'Spa' });
    upsertSession(db, s1, s1.filePath, 0, 1000);
    seedLegacySessionJson(db, s1);

    // Convert
    convertSessionsToNormalizedStorage(db, sidecarPath);
    expect(isSessionJsonRemoved(db)).toBe(true);

    // Rollback restore
    const restoredCount = restoreSessionsJsonFromSidecar(db, sidecarPath);
    expect(restoredCount).toBe(1);
    expect(isSessionJsonRemoved(db)).toBe(false);
    expect(getMetadata(db, SESSION_JSON_REMOVED_AT_KEY)).toBeNull();

    // Verify columns exist and data_json was restored
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(c => c.name);
    expect(cols).toContain('data_json');
    expect(cols).toContain('metadata_json');

    const row = db.prepare('SELECT data_json FROM sessions WHERE id = ?').get('s1') as { data_json: string };
    expect(JSON.parse(row.data_json).id).toBe('s1');

    const loaded = loadSession(db, 's1');
    expect(loaded?.id).toBe('s1');
  });
});
