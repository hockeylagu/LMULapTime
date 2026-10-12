import { afterEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { initReplayMatchingSchema } from '../../../../server/core/replay/dbReplayMatchingStore.js';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { resolveReplayPrimarySlot } from '../../../../server/replay/decode/replayParser.js';

const databases: SessionDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return db;
}
function metadata(): ReplayMetadata {
  return {
    filename: 'Custom R1.Vcr', filePath: 'C:/deleted/Custom R1.Vcr', fileSizeBytes: 100, mtimeMs: 1000,
    timeSliceCount: 1, totalEvents: 0, durationSec: 100, trackVenue: 'Custom', trackCourse: 'Short',
    drivers: [{ name: 'Joann', slot: 1, isPlayer: true }, { name: 'Ann', slot: 2 }],
    laps: [{ lapNumber: 1, lapTimeSec: 100, s1Sec: 30, s2Sec: 30, s3Sec: 40 }],
  };
}

describe('retained replay identity reconciliation', () => {
  it('resolves only a unique primary and never falls back from an explicit unmatched name', () => {
    const meta = metadata();
    expect(resolveReplayPrimarySlot(meta)).toBe(1);
    expect(resolveReplayPrimarySlot(meta, ' ANN ')).toBe(2);
    expect(resolveReplayPrimarySlot(meta, 'Missing')).toBeUndefined();
    expect(resolveReplayPrimarySlot(meta, '')).toBeUndefined();
    meta.drivers.push({ name: 'Ann', slot: 3 });
    expect(resolveReplayPrimarySlot(meta, 'Ann')).toBeUndefined();
    meta.drivers[1].isPlayer = true;
    expect(resolveReplayPrimarySlot(meta)).toBeUndefined();
  });
  it('repairs list ownership before on-demand reads and preserves explicit driver recordings', () => {
    const db = database();
    const meta = metadata();
    db.upsertReplayMetadataCache(meta.filename, meta.filePath, meta.mtimeMs, meta.fileSizeBytes, meta);
    const trajectory: ReplayTrajectoryData = { replayName: meta.filename, driverSlot: 1, currentLap: 1,
      pointsCount: 0, points: [], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 } };
    db.upsertReplayTrajectoryCache(meta.filename, 1, 1, meta.mtimeMs, meta.fileSizeBytes, trajectory);
    db.reconcileReplayPlayerOwnership('Ann');
    const stored = db.getAllStoredReplayFiles()[0].metadata;
    expect(stored.drivers.map(driver => driver.isPlayer)).toEqual([false, true]);
    expect(stored.laps).toBeUndefined();
    expect(db.getStoredReplayTrajectory(meta.filename, 1, 1)?.driverSlot).toBe(1);
    const changes = db.getDb().prepare('SELECT total_changes() AS count').get();
    const revision = db.getReplayMetadataRevision();
    db.reconcileReplayPlayerOwnership('Ann');
    expect(db.getStoredReplayMetadata(meta.filename, 'Ann')?.drivers.map(driver => driver.isPlayer)).toEqual([false, true]);
    expect(db.getReplayMetadataCache(meta.filename, meta.mtimeMs, meta.fileSizeBytes, meta.filePath, 'Ann')?.laps).toBeUndefined();
    db.getStoredReplayMetadata(meta.filename);
    expect(db.getDb().prepare('SELECT total_changes() AS count').get()).toEqual(changes);
    expect(db.getReplayMetadataRevision()).toBe(revision);
    db.reconcileReplayPlayerOwnership('Joann');
    expect(db.getAllStoredReplayFiles()[0].metadata.drivers.map(driver => driver.isPlayer)).toEqual([true, false]);
    db.reconcileReplayPlayerOwnership('Unknown');
    expect(db.getAllStoredReplayFiles()[0].metadata.drivers.every(driver => !driver.isPlayer)).toBe(true);
  });

  it('leaves duplicate exact configured names unresolved', () => {
    const db = database();
    const meta = metadata();
    meta.drivers.push({ name: 'Ann', slot: 3 });
    db.upsertReplayMetadataCache(meta.filename, meta.filePath, meta.mtimeMs, meta.fileSizeBytes, meta);
    db.reconcileReplayPlayerOwnership('Ann');
    expect(db.getAllStoredReplayFiles()[0].metadata.drivers.every(driver => !driver.isPlayer)).toBe(true);
    expect(db.getAllStoredReplayFiles()[0].metadata.laps).toBeUndefined();
  });

  it('rebuilds old compact matching facts with the exact custom course from retained metadata', () => {
    const db = database();
    const meta = metadata();
    db.upsertReplayMetadataCache(meta.filename, meta.filePath, meta.mtimeMs, meta.fileSizeBytes, meta);
    db.getDb().exec("UPDATE replay_metadata SET matching_version=1,matching_json='{}'");
    initReplayMatchingSchema(db.getDb());
    expect(db.getReplayMatchingEntry(meta.filename)).toMatchObject({ trackVenue: 'Custom', trackCourse: 'Short' });
    const changes = db.getDb().prepare('SELECT total_changes() AS count').get();
    initReplayMatchingSchema(db.getDb());
    expect(db.getDb().prepare('SELECT total_changes() AS count').get()).toEqual(changes);
  });
});
