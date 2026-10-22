import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReplayMetadata } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertReplayMetadataCache } from '../../../../server/core/replay/dbReplayMetadataStore.js';
import { deleteReplayDriverLaps } from '../../../../server/core/replay/dbReplayIngestStore.js';
import { upsertReplayTrajectoryCache } from '../../../../server/core/replay/dbReplayTrajectoryStore.js';
import { AVAILABLE_REPLAY_LAP_SQL, backfillReplayDriverRosters } from '../../../../server/core/replay/replayLapAvailability.js';

const filename = 'retained.Vcr';
const metadata: ReplayMetadata = {
  filename, filePath: '/deleted/retained.Vcr', fileSizeBytes: 1, mtimeMs: 1,
  timeSliceCount: 0, totalEvents: 0, durationSec: 100,
  drivers: [{ slot: 7, name: ' ÉLODIE ' }],
};
const availabilitySql = `SELECT ${AVAILABLE_REPLAY_LAP_SQL} available
  FROM (SELECT ? recording_name) s CROSS JOIN (SELECT ? name) dn CROSS JOIN (SELECT ? lap_number) l`;

describe('persisted replay lap availability', () => {
  let db: Database.Database;
  const available = (name = 'Élodie', lapNumber = 20, replayName = filename): boolean =>
    Boolean((db.prepare(availabilitySql).get(replayName, name, lapNumber) as { available: number }).available);
  const storeLap = (points = 1, slot = 7, lapNumber = 20): void => {
    upsertReplayTrajectoryCache(db, filename, slot, lapNumber, 1, 1, {
      replayName: filename, currentLap: lapNumber, driverSlot: slot,
      pointsCount: points, points: Array.from({ length: points }, () => ({ x: 0, y: 0, z: 0 })),
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
    });
  };
  beforeEach(() => {
    db = new Database(':memory:');
    initDbSchema(db);
    upsertReplayMetadataCache(db, filename, metadata.filePath, 1, 1, metadata);
  });
  afterEach(() => db.close());

  it('uses exact retained driver laps and reacts to writes, empty replacements and driver deletion', () => {
    expect(available()).toBe(false);
    storeLap(1, 8);
    expect(available()).toBe(false);
    storeLap();
    expect(available()).toBe(true);
    expect(available('Élodie', 19)).toBe(false);
    expect(available('Another driver')).toBe(false);
    storeLap(0);
    expect(available()).toBe(false);
    storeLap();
    deleteReplayDriverLaps(db, filename, 7);
    expect(available()).toBe(false);
  });

  it('backfills retained metadata once outside schema initialization and never reads blobs during queries', () => {
    storeLap();
    db.prepare('DELETE FROM replay_driver_roster').run();
    db.prepare('UPDATE replay_metadata SET roster_version=0').run();
    initDbSchema(db);
    expect(available()).toBe(false);
    backfillReplayDriverRosters(db);
    expect(available()).toBe(true);
    db.prepare('UPDATE replay_metadata SET metadata_br=?').run(Buffer.alloc(0));
    db.prepare('UPDATE replay_trajectories SET trajectory_br=?').run(Buffer.alloc(0));
    expect(() => backfillReplayDriverRosters(db)).not.toThrow();
    expect(available()).toBe(true);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${availabilitySql}`).all(filename, 'Élodie', 20) as Array<{ detail: string }>;
    expect(plan.some(row => row.detail.includes('SEARCH rr USING PRIMARY KEY'))).toBe(true);
    expect(plan.some(row => row.detail.includes('SEARCH rt USING INDEX'))).toBe(true);
  });

  it('refreshes roster identities and rejects ambiguous normalized names', () => {
    storeLap();
    upsertReplayMetadataCache(db, filename, metadata.filePath, 1, 1, {
      ...metadata, drivers: [{ slot: 7, name: 'Élodie' }, { name: ' ÉLODIE ' }],
    });
    expect(available()).toBe(false);
    upsertReplayMetadataCache(db, filename, metadata.filePath, 1, 1, {
      ...metadata, drivers: [{ slot: 7, name: 'New driver' }],
    });
    expect(available()).toBe(false);
    expect(available('New driver')).toBe(true);
  });

  it('moves roster keys with archived recordings and removes them when metadata is deleted', () => {
    storeLap();
    db.prepare('UPDATE replay_metadata SET filename=? WHERE filename=?').run('archive.Vcr', filename);
    db.prepare('UPDATE replay_trajectories SET filename=? WHERE filename=?').run('archive.Vcr', filename);
    expect(available()).toBe(false);
    expect(available('Élodie', 20, 'archive.Vcr')).toBe(true);
    db.prepare('DELETE FROM replay_metadata WHERE filename=?').run('archive.Vcr');
    expect(available('Élodie', 20, 'archive.Vcr')).toBe(false);
    expect(db.prepare('SELECT count(*) n FROM replay_driver_roster').get()).toEqual({ n: 0 });
  });
});
