import { afterEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { initReplayMatchingSchema } from '../../../../server/core/replay/dbReplayMatchingStore.js';
import { findMatchingReplay, replayIndexEntryFromStored, type ReplayMatchTarget } from '../../../../server/sessions/replayMatching.js';
import type { ReplayMetadata } from '../../../../server/core/types.js';

const databases: SessionDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database(): SessionDatabase { const db = new SessionDatabase(':memory:'); databases.push(db); return db; }
const end = Date.parse('2026-10-10T12:00:00Z');
const target: ReplayMatchTarget = { trackVenue: 'Monza', trackCourse: 'GP', sessionCode: 'R1', sessionTimestampMs: end - 3600_000, xmlFileMtimeMs: end };
function save(db: SessionDatabase, name: string, mtime = end, duration = 3600, sceneDesc = 'Monza Grand Prix') {
  db.upsertReplayMetadataCache(name, `C:/replays/${name}`, mtime, 100, { durationSec: duration, sceneDesc } as ReplayMetadata);
}

describe('persistent replay matching facts', () => {
  it('selects end and start candidates with the same deterministic matching result as full metadata', () => {
    const db = database();
    save(db, 'Monza R1 1.Vcr');
    save(db, 'Monza R1 2.Vcr', end + 3600_000, 7200); // Same start, much later save.
    save(db, 'Monza R1 3.Vcr', end - 24 * 3600_000);
    save(db, 'Monza P1.Vcr');
    const candidates = db.getReplayMatchingEntries(target);
    expect(candidates.map(row => row.name)).not.toContain('Monza R1 3.Vcr');
    expect(candidates.map(row => row.name)).toContain('Monza R1 2.Vcr');
    const all = db.getAllStoredReplayFiles().map(replayIndexEntryFromStored);
    expect(findMatchingReplay(candidates, target)).toEqual(findMatchingReplay(all, target));
    const plan = db.getDb().prepare(`EXPLAIN QUERY PLAN SELECT filename FROM replay_metadata
      WHERE file_mtime BETWEEN ? AND ? OR recording_start_ms BETWEEN ? AND ?`).all(0, 1, 0, 1) as Array<{ detail: string }>;
    expect(plan.some(row => row.detail.includes('idx_replay_matching_end'))).toBe(true);
    expect(plan.some(row => row.detail.includes('idx_replay_matching_start'))).toBe(true);
  });

  it('retains unknown-duration start fallback and strict layout rejection', () => {
    const db = database();
    save(db, 'Monza R1 unknown.Vcr', target.sessionTimestampMs, 0);
    save(db, 'Bahrain R1.Vcr', end, 3600, 'Bahrain Grand Prix');
    const candidates = db.getReplayMatchingEntries(target);
    expect(findMatchingReplay(candidates, target)?.name).toBe('Monza R1 unknown.Vcr');
    expect(db.getReplayMatchingEntry('missing.Vcr')).toBeUndefined();
  });

  it('serves compact matching facts without decompressing rosters and preserves archive identity', () => {
    const db = database();
    save(db, 'Monza R1.Vcr');
    save(db, 'Monza R1.Vcr', end + 24 * 3600_000);
    const archive = db.getReplayMatchingEntries(target).find(row => row.name.includes('@'))!;
    expect(archive.name).toContain('@');
    expect(archive.path).toContain(archive.name);
    db.getDb().prepare('UPDATE replay_metadata SET metadata_br=?').run(Buffer.from('unreadable roster'));
    expect(db.getReplayMatchingEntry(archive.name)).toEqual(archive);
    expect(findMatchingReplay(db.getReplayMatchingEntries(target), target)?.name).toBe(archive.name);
  });

  it('backfills old rows from retained metadata once and resumes only missing projections', () => {
    const db = database();
    save(db, 'Monza R1.Vcr');
    db.getDb().exec('UPDATE replay_metadata SET matching_json=NULL,recording_start_ms=NULL');
    initReplayMatchingSchema(db.getDb());
    expect(findMatchingReplay(db.getReplayMatchingEntries(target), target)?.name).toBe('Monza R1.Vcr');
    db.getDb().prepare('UPDATE replay_metadata SET metadata_br=?').run(Buffer.from('unreadable roster'));
    expect(() => initReplayMatchingSchema(db.getDb())).not.toThrow();
  });
});
