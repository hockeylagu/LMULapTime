import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getReplayConditions, getReplayLaps } from '../../../../server/core/replay/dbReplayLapStore.js';
import { replayFailureStatus } from '../../../../server/core/replay/dbReplayIngestStore.js';
import { storeReplayTrajectoryInWorker } from '../../../../server/replay/worker/replayTrajectoryWorkerClient.js';
import { extractReplayTrajectory } from '../../../../server/replay/decode/replayTrajectory.js';
import { parseReplayMetadata } from '../../../../server/replay/decode/replayParser.js';
import { ReplayRecordingService } from '../../../../server/replay/replayRecordingService.js';
import { REPLAY_CACHE_VERSION } from '../../../../server/core/dbSchema.js';
import { createMockVcrBuffer, createSliceVcrBuffer } from '../../../utils/mockVcr.js';

describe('worker SQLite persistence', () => {
  let directory: string;
  let db: SessionDatabase;
  let filePath: string;
  const filename = 'Worker_P1.Vcr';
  let mtime: number;
  let size: number;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(process.cwd(), 'test/fixtures/worker-save-'));
    db = new SessionDatabase(path.join(directory, 'cache.db'));
    filePath = path.join(directory, filename);
    fs.writeFileSync(filePath, createMockVcrBuffer());
    const stat = fs.statSync(filePath);
    mtime = Math.floor(stat.mtimeMs);
    size = stat.size;
    db.upsertReplayMetadataCache(filename, filePath, mtime, size, parseReplayMetadata(filePath, { playerName: 'Test Driver' }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const store = async (host: SessionDatabase, source: string, fileMtime: number, fileSize: number) => {
    const extraction = storeReplayTrajectoryInWorker(host, source, { driverSlot: 1 }, {
      filename, mtime: fileMtime, size: fileSize, driverSlotKey: 1, isPrimary: true,
    });
    let step = await extraction.next();
    while (!step.done) step = await extraction.next();
    return step.value;
  };

  it('acknowledges only after all rows commit and sends only the compact summary', async () => {
    const reference = new SessionDatabase(':memory:');
    try {
      const decoded = extractReplayTrajectory(filePath, { driverSlot: 1, allLaps: true, maxPoints: 0, silent: true });
      reference.replaceReplayDriverLaps(filename, filePath, mtime, size, 1, decoded, true);
      const mainSave = vi.spyOn(db, 'replaceReplayDriverLaps');
      const summary = await store(db, filePath, mtime, size);
      expect(Object.keys(summary).sort()).toEqual(['currentLap', 'driverSlot']);
      expect(mainSave).not.toHaveBeenCalled();
      expect(db.getReplayDriverIngest(filename, 1)?.status).toBe('stored');
      expect(db.getReplayDriverIngest(filename, -1)?.status).toBe('stored');
      expect(db.getStoredReplayTrajectory(filename, -1, -1)).toEqual(reference.getStoredReplayTrajectory(filename, -1, -1));
      expect(getReplayLaps(db.getDb(), filename, 1)).toEqual(getReplayLaps(reference.getDb(), filename, 1));
      expect(getReplayConditions(db.getDb(), filename)).toEqual(getReplayConditions(reference.getDb(), filename));
      expect(db.getDb().pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      reference.close();
    }
  });

  it('rolls back a failed save and reports a storage interruption', async () => {
    await store(db, filePath, mtime, size);
    const before = db.getStoredReplayTrajectory(filename, 1, -1);
    db.getDb().exec(`CREATE TRIGGER reject_save BEFORE INSERT ON replay_trajectories
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
    const error: unknown = await store(db, filePath, mtime, size).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(replayFailureStatus(error)).toBe('interrupted');
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).toEqual(before);
    expect(db.getReplayDriverIngest(filename, 1)?.status).toBe('stored');
  });

  it('rejects changed files without committing any trajectory', async () => {
    fs.appendFileSync(filePath, Buffer.alloc(1));
    await expect(store(db, filePath, mtime, size)).rejects.toThrow('Replay source changed');
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).toBeNull();
  });

  it('rejects reused metadata names without committing any trajectory', async () => {
    const stat = fs.statSync(filePath);
    const currentMtime = Math.floor(stat.mtimeMs);
    db.getDb().prepare('UPDATE replay_metadata SET file_mtime = ?, file_path = ? WHERE filename = ?')
      .run(currentMtime, 'another recording', filename);
    await expect(store(db, filePath, currentMtime, size)).rejects.toThrow('Replay source changed');
    expect(db.getReplayDriverIngest(filename, 1)).toBeNull();
  });

  it('serves an on-demand lap from the committed cache with no main-thread save', async () => {
    const service = new ReplayRecordingService(db);
    const mainSave = vi.spyOn(db, 'replaceReplayDriverLaps');
    const result = await service.getFullTrajectory(filePath, filename, { driverSlot: 1 });
    expect(mainSave).not.toHaveBeenCalled();
    expect(result.points).toEqual(db.getStoredReplayTrajectory(filename, 1, -1)?.points);
    fs.unlinkSync(filePath);
    expect((await service.getFullTrajectory(filePath, filename, { driverSlot: 1 })).points).toEqual(result.points);
  });

  it('uses worker saves during background ingestion and upgrades', async () => {
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Test Driver', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    }));
    const stat = fs.statSync(filePath);
    db.upsertReplayMetadataCache(filename, filePath, Math.floor(stat.mtimeMs), stat.size, parseReplayMetadata(filePath, { playerName: 'Test Driver' }));

    const mainSave = vi.spyOn(db, 'replaceReplayDriverLaps');
    const sync = db.syncReplaysAsyncIterator(directory, { playerName: 'Test Driver' });
    let synced = await sync.next();
    while (!synced.done) synced = await sync.next();
    expect(db.getReplayDriverIngest(filename, -1)?.status).toBe('stored');
    expect(mainSave).not.toHaveBeenCalled();

    db.getDb().exec("UPDATE replay_trajectories SET parser_version = 'v4' WHERE driver_slot = 1; DELETE FROM replay_ingest_drivers WHERE driver_slot = 1;");
    const upgrade = db.upgradeReplaysAsyncIterator(directory, { playerName: 'Test Driver' });
    let upgraded = await upgrade.next();
    while (!upgraded.done) upgraded = await upgrade.next();
    expect(upgraded.value).toMatchObject({ failed: 0, upgraded: 1 });
    expect(db.getReplayDriverIngest(filename, 1)?.parserVersion).toBe(REPLAY_CACHE_VERSION);
    expect(mainSave).not.toHaveBeenCalled();
  });
});
