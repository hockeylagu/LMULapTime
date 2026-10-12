import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getReplayConditions, getReplayLaps } from '../../../../server/core/replay/dbReplayLapStore.js';
import { MAX_DECODE_ATTEMPTS, replayFailureStatus } from '../../../../server/core/replay/dbReplayIngestStore.js';
import { storeReplayTrajectoryInWorker, storeReplayDriversInWorker } from '../../../../server/replay/worker/replayTrajectoryWorkerClient.js';
import { extractReplayTrajectory } from '../../../../server/replay/decode/replayTrajectory.js';
import { parseReplayMetadata } from '../../../../server/replay/decode/replayParser.js';
import { ReplayRecordingService } from '../../../../server/replay/replayRecordingService.js';
import type { ReplayStreamProgress } from '../../../../server/replay/replayProgress.js';
import { REPLAY_CACHE_VERSION } from '../../../../server/core/dbSchema.js';
import { createMockVcrBuffer, createSliceVcrBuffer } from '../../../utils/mockVcr.js';

describe('worker SQLite persistence', () => {
  let directory: string;
  let db: SessionDatabase;
  let filePath: string;
  const filename = 'Worker_P1.Vcr';
  let mtimeMs: number;
  let fileSizeBytes: number;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(process.cwd(), 'test/fixtures/worker-save-'));
    db = new SessionDatabase(path.join(directory, 'cache.db'));
    filePath = path.join(directory, filename);
    fs.writeFileSync(filePath, createMockVcrBuffer());
    const stat = fs.statSync(filePath);
    mtimeMs = Math.floor(stat.mtimeMs);
    fileSizeBytes = stat.size;
    db.upsertReplayMetadataCache(filename, filePath, mtimeMs, fileSizeBytes, parseReplayMetadata(filePath, { playerName: 'Test Driver' }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const store = async (host: SessionDatabase, source: string, mtimeMs: number, fileSizeBytes: number) => {
    const extraction = storeReplayTrajectoryInWorker(host, source, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: true,
    });
    let step = await extraction.next();
    while (!step.done) step = await extraction.next();
    return step.value;
  };

  const drain = async <T>(iterator: AsyncGenerator<ReplayStreamProgress, T, void>,
    first: IteratorResult<ReplayStreamProgress, T>, progress: string[]): Promise<T> => {
    let step = first;
    while (!step.done) { progress.push(step.value.stageDescription); step = await iterator.next(); }
    return step.value;
  };

  it('acknowledges only after all rows commit and sends only the compact summary', async () => {
    const reference = new SessionDatabase(':memory:');
    try {
      const decoded = extractReplayTrajectory(filePath, { driverSlot: 1, allLaps: true, maxPoints: 0, silent: true });
      reference.replaceReplayDriverLaps(filename, filePath, mtimeMs, fileSizeBytes, 1, decoded, true);
      const mainSave = vi.spyOn(db, 'replaceReplayDriverLaps');
      const summary = await store(db, filePath, mtimeMs, fileSizeBytes);
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

  it('shares one file-backed decode when a batch waits for a single-driver request', async () => {
    const single = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    let singleStep = await single.next();
    const singleProgress: string[] = [];
    const batch = storeReplayDriversInWorker(db, filePath, { playerName: 'Test Driver' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1], includePrimary: false,
    });
    let batchStep = await batch.next();
    const batchProgress: string[] = [];
    const [, batchResult] = await Promise.all([
      drain(single, singleStep, singleProgress),
      drain(batch, batchStep, batchProgress),
    ]);

    expect(singleProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(1);
    expect(batchProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(0);
    expect(batchResult.drivers).toEqual([expect.objectContaining({ driverSlotKey: 1, isPrimary: false })]);
  });

  it('shares one file-backed decode when a single-driver request waits for a batch', async () => {
    const batch = storeReplayDriversInWorker(db, filePath, { playerName: 'Test Driver' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1], includePrimary: false,
    });
    const batchFirst = await batch.next();
    const single = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const singleFirst = await single.next();
    const batchProgress: string[] = [];
    const singleProgress: string[] = [];
    const [, singleResult] = await Promise.all([
      drain(batch, batchFirst, batchProgress),
      drain(single, singleFirst, singleProgress),
    ]);

    expect(batchProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(1);
    expect(singleProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(0);
    expect(singleResult.driverSlot).toBe(1);
  });

  it('promotes an explicit request result to primary without another decode or blob write', async () => {
    const owner = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const ownerFirst = await owner.next();
    const batch = storeReplayDriversInWorker(db, filePath, { playerName: 'Samuel Lague' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1], includePrimary: true,
    });
    const batchFirst = await batch.next();
    await drain(owner, ownerFirst, []);
    const rows = () => db.getDb().prepare('SELECT * FROM replay_trajectories WHERE filename = ? ORDER BY driver_slot, lap_key').all(filename);
    const before = rows();
    const progress: string[] = [];
    const result = await drain(batch, batchFirst, progress);
    expect(result.drivers).toEqual([expect.objectContaining({ driverSlotKey: 1, isPrimary: true })]);
    expect(progress).not.toContain('Initializing binary frame stream');
    expect(rows()).toEqual(before);
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(1);
    expect(db.getReplayDriverIngest(filename, -1)?.status).toBe('stored');
  });

  it('reuses an already cached primary before starting a worker', async () => {
    await store(db, filePath, mtimeMs, fileSizeBytes);
    db.getDb().exec('DELETE FROM replay_trajectory_defaults WHERE driver_slot = -1; DELETE FROM replay_ingest_drivers WHERE driver_slot = -1');
    const batch = storeReplayDriversInWorker(db, filePath, { playerName: 'Samuel Lague' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1], includePrimary: true,
    });
    const progress: string[] = [];
    const result = await drain(batch, await batch.next(), progress);
    expect(progress).not.toContain('Initializing binary frame stream');
    expect(result.drivers).toEqual([expect.objectContaining({ driverSlotKey: 1, isPrimary: true })]);
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(1);
  });

  it.each(['stored', 'failed'] as const)('switches a settled %s primary alias to the configured cached driver without decoding', async (status) => {
    const first = db.syncReplaysAsyncIterator(directory, { playerName: 'Samuel Lague' });
    let step = await first.next();
    while (!step.done) step = await first.next();
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(1);
    const playerName = db.getStoredReplayMetadata(filename)?.drivers.find(driver => driver.slot === 2)?.name;
    expect(playerName).toBeDefined();
    if (status === 'failed') {
      for (let attempt = 0; attempt < MAX_DECODE_ATTEMPTS; attempt++) db.recordReplayDriverIngest(filename, -1, mtimeMs, fileSizeBytes, 'failed', 'Old player failure');
    }
    const rows = () => db.getDb().prepare('SELECT * FROM replay_trajectories WHERE filename = ? ORDER BY driver_slot, lap_key').all(filename);
    const before = rows();
    const next = db.syncReplaysAsyncIterator(directory, { playerName });
    let switched = await next.next();
    while (!switched.done) switched = await next.next();
    expect(switched.value.updated).toBe(1);
    expect(rows()).toEqual(before);
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(2);
    expect(db.getReplayDriverIngest(filename, -1)?.status).toBe('stored');
  });

  it('ingests explicit drivers with no guessed primary and does not queue them again', async () => {
    const sync = db.syncReplaysAsyncIterator(directory, { playerName: 'Missing Player' });
    let synced = await sync.next();
    while (!synced.done) synced = await sync.next();
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).not.toBeNull();
    expect(db.getStoredReplayTrajectory(filename, -1, -1)).toBeNull();
    expect(db.getReplayDriverIngest(filename, -1)).toBeNull();
    const repeat = db.syncReplaysAsyncIterator(directory, { playerName: 'Missing Player' });
    let step = await repeat.next();
    const stages: string[] = [];
    while (!step.done) { stages.push(step.value.stage ?? ''); step = await repeat.next(); }
    expect(stages).not.toContain('Verifying trajectory cache');
    expect(step.value).toMatchObject({ added: 0, updated: 0 });
    await expect(new ReplayRecordingService(db).getFullTrajectory(filePath, filename, { playerName: 'Missing Player' }))
      .rejects.toThrow('no recorded laps');
  });

  it.each(['source', 'metadata'])('rejects primary promotion after the %s version changes', async (changed) => {
    await store(db, filePath, mtimeMs, fileSizeBytes);
    db.getDb().exec('DELETE FROM replay_trajectory_defaults WHERE driver_slot = -1; DELETE FROM replay_ingest_drivers WHERE driver_slot = -1');
    if (changed === 'source') fs.appendFileSync(filePath, Buffer.alloc(1));
    else db.getDb().prepare('UPDATE replay_metadata SET file_size_bytes = file_size_bytes + 1 WHERE filename = ?').run(filename);
    expect(() => db.promoteReplayPrimary(filename, filePath, mtimeMs, fileSizeBytes, 1)).toThrow('Replay source changed');
    expect(db.getStoredReplayTrajectory(filename, -1, -1)).toBeNull();
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).not.toBeNull();
  });

  it('requires the current decoder version and rolls back failed alias publication', async () => {
    await store(db, filePath, mtimeMs, fileSizeBytes);
    db.getDb().exec(`DELETE FROM replay_trajectory_defaults WHERE driver_slot = -1;
      DELETE FROM replay_ingest_drivers WHERE driver_slot = -1;
      UPDATE replay_trajectories SET parser_version = 'v4'`);
    expect(db.promoteReplayPrimary(filename, filePath, mtimeMs, fileSizeBytes, 1)).toBe(false);
    db.getDb().prepare('UPDATE replay_trajectories SET parser_version = ?').run(REPLAY_CACHE_VERSION);
    db.getDb().exec(`CREATE TRIGGER reject_primary BEFORE INSERT ON replay_ingest_drivers
      WHEN NEW.driver_slot = -1 BEGIN SELECT RAISE(ABORT, 'injected alias failure'); END`);
    expect(() => db.promoteReplayPrimary(filename, filePath, mtimeMs, fileSizeBytes, 1)).toThrow('injected alias failure');
    expect(db.getStoredReplayTrajectory(filename, -1, -1)).toBeNull();
    expect(db.getReplayDriverIngest(filename, -1)).toBeNull();
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).not.toBeNull();
  });

  it('releases a waiter canceled just after its owner grants the file lease', async () => {
    const owner = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const ownerFirst = await owner.next();
    const waiter = storeReplayDriversInWorker(db, filePath, { playerName: 'Test Driver' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1], includePrimary: false,
    });
    const waiterFirst = await waiter.next();
    expect(waiterFirst.done).toBe(false);
    if (!waiterFirst.done) expect(waiterFirst.value.stageDescription).toBe('Waiting for another decode of this replay');

    await drain(owner, ownerFirst, []);
    await waiter.return({ drivers: [], failures: [] });

    const nextCaller = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const nextFirst = await nextCaller.next();
    expect(nextFirst.done).toBe(false);
    if (!nextFirst.done) expect(nextFirst.value.stageDescription).not.toBe('Waiting for another decode of this replay');
    await drain(nextCaller, nextFirst, []);
  });

  it('returns the owning decode failure to a waiter without starting another worker', async () => {
    db.getDb().exec(`CREATE TRIGGER reject_concurrent_save BEFORE INSERT ON replay_trajectories
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
    const owner = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const ownerFirst = await owner.next();
    const waiter = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const waiterFirst = await waiter.next();
    const ownerProgress: string[] = [];
    const waiterProgress: string[] = [];
    const consume = (iterator: AsyncGenerator<ReplayStreamProgress, unknown, void>, first: IteratorResult<ReplayStreamProgress, unknown>, progress: string[]) =>
      drain(iterator, first, progress).then(() => null, (error: unknown) => error);
    const [ownerError, waiterError] = await Promise.all([
      consume(owner, ownerFirst, ownerProgress),
      consume(waiter, waiterFirst, waiterProgress),
    ]);

    expect(ownerError).toBeInstanceOf(Error);
    expect(waiterError).toBeInstanceOf(Error);
    expect(ownerProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(1);
    expect(waiterProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(0);
    db.getDb().exec('DROP TRIGGER reject_concurrent_save');
  });

  it('shares a failed explicit driver with a primary-only waiter', async () => {
    db.getDb().exec(`CREATE TRIGGER reject_primary_slot BEFORE INSERT ON replay_trajectories
      WHEN NEW.driver_slot = 1 BEGIN SELECT RAISE(ABORT, 'injected primary failure'); END`);
    const owner = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const ownerFirst = await owner.next();
    const batch = storeReplayDriversInWorker(db, filePath, { playerName: 'Samuel Lague' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [], includePrimary: true,
    });
    const batchFirst = await batch.next();
    await expect(drain(owner, ownerFirst, [])).rejects.toThrow('injected primary failure');
    const progress: string[] = [];
    const result = await drain(batch, batchFirst, progress);
    expect(progress).not.toContain('Initializing binary frame stream');
    expect(result).toMatchObject({ drivers: [], failures: [{ driverSlotKey: 1, isPrimary: true, message: 'injected primary failure' }] });
  });

  it.each([false, true])('preserves a failed slot across an unrelated waiter (canceled: %s)', async (cancelUnrelated) => {
    db.getDb().exec(`CREATE TRIGGER reject_slot_one BEFORE INSERT ON replay_trajectories
      WHEN NEW.driver_slot = 1 BEGIN SELECT RAISE(ABORT, 'injected slot one failure'); END`);
    const owner = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const ownerFirst = await owner.next();
    const unrelated = storeReplayDriversInWorker(db, filePath, { playerName: 'Test Driver' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [2], includePrimary: false,
    });
    const unrelatedFirst = await unrelated.next();
    const later = storeReplayTrajectoryInWorker(db, filePath, { driverSlot: 1 }, {
      filename, mtimeMs, fileSizeBytes, driverSlotKey: 1, isPrimary: false,
    });
    const laterFirst = await later.next();

    const ownerProgress: string[] = [];
    const unrelatedProgress: string[] = [];
    const laterProgress: string[] = [];
    const consume = async <T>(iterator: AsyncGenerator<ReplayStreamProgress, T, void>,
      first: IteratorResult<ReplayStreamProgress, T>, progress: string[]): Promise<{ value?: T; error?: unknown }> => {
      try { return { value: await drain(iterator, first, progress) }; }
      catch (error) { return { error }; }
    };
    const ownerResult = await consume(owner, ownerFirst, ownerProgress);
    expect(ownerResult.error).toBeInstanceOf(Error);
    if (cancelUnrelated) {
      await unrelated.return({ drivers: [], failures: [] });
    } else {
      const unrelatedResult = await consume(unrelated, unrelatedFirst, unrelatedProgress);
      expect(unrelatedResult.value?.drivers).toEqual([expect.objectContaining({ driverSlotKey: 2, isPrimary: false })]);
    }
    const laterResult = await consume(later, laterFirst, laterProgress);
    expect(laterResult.error).toBeInstanceOf(Error);
    expect(ownerProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(1);
    expect(unrelatedProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(cancelUnrelated ? 0 : 1);
    expect(laterProgress.filter(stage => stage === 'Initializing binary frame stream')).toHaveLength(0);
    db.getDb().exec('DROP TRIGGER reject_slot_one');
  });

  it('rolls back a failed save and reports a storage interruption', async () => {
    await store(db, filePath, mtimeMs, fileSizeBytes);
    const before = db.getStoredReplayTrajectory(filename, 1, -1);
    db.getDb().exec(`CREATE TRIGGER reject_save BEFORE INSERT ON replay_trajectories
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
    const error: unknown = await store(db, filePath, mtimeMs, fileSizeBytes).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(replayFailureStatus(error)).toBe('interrupted');
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).toEqual(before);
    expect(db.getReplayDriverIngest(filename, 1)?.status).toBe('stored');
  });

  it('rejects changed files without committing any trajectory', async () => {
    fs.appendFileSync(filePath, Buffer.alloc(1));
    await expect(store(db, filePath, mtimeMs, fileSizeBytes)).rejects.toThrow('Replay source changed');
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).toBeNull();
  });

  it('rejects reused metadata names without committing any trajectory', async () => {
    const stat = fs.statSync(filePath);
    const currentMtime = Math.floor(stat.mtimeMs);
    db.getDb().prepare('UPDATE replay_metadata SET file_mtime_ms = ?, file_path = ? WHERE filename = ?')
      .run(currentMtime, 'another recording', filename);
    await expect(store(db, filePath, currentMtime, fileSizeBytes)).rejects.toThrow('Replay source changed');
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

  it('isolates a driver write failure during one replay-wide worker scan', async () => {
    db.getDb().exec(`CREATE TRIGGER reject_rival BEFORE INSERT ON replay_trajectories
      WHEN NEW.driver_slot = 2 BEGIN SELECT RAISE(ABORT, 'rival storage failure'); END`);
    const extraction = storeReplayDriversInWorker(db, filePath, { playerName: 'Samuel Lague' }, {
      filename, mtimeMs, fileSizeBytes, driverSlots: [1, 2], includePrimary: true,
    });
    let traversals = 0;
    let step = await extraction.next();
    while (!step.done) {
      if (step.value.stage === 'stream_init') traversals++;
      step = await extraction.next();
    }
    expect(traversals).toBe(1);
    expect(step.value.drivers.map(driver => driver.driverSlotKey)).toEqual([1]);
    expect(step.value.failures).toEqual([expect.objectContaining({ driverSlotKey: 2, code: 'SQLITE_CONSTRAINT_TRIGGER' })]);
    expect(db.getStoredReplayTrajectory(filename, 1, -1)).not.toBeNull();
    expect(db.getStoredReplayTrajectory(filename, 2, -1)).toBeNull();
    expect(db.getReplayDriverIngest(filename, -1)?.status).toBe('stored');
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

  it('preserves the stored default during a file-backed upgrade with a different player', async () => {
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [
        { name: 'Original Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' },
        { name: 'New Player', vehicleId: '21_26_AFCO95641716', team: 'B', carNumber: '22' },
      ],
      slices: [1, 2].flatMap(driverSlot => [
        { sTime: 0, driverSlot, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot, x: 10, y: 0, z: 10 },
      ]),
    }));
    const sync = db.syncReplaysAsyncIterator(directory, { playerName: 'Original Player' });
    let synced = await sync.next();
    while (!synced.done) synced = await sync.next();
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(1);
    db.getDb().exec("UPDATE replay_trajectories SET parser_version = 'v4'; DELETE FROM replay_ingest_drivers;");
    const upgrade = db.upgradeReplaysAsyncIterator(directory, { playerName: 'New Player' });
    let upgraded = await upgrade.next();
    while (!upgraded.done) upgraded = await upgrade.next();
    expect(upgraded.value).toMatchObject({ upgraded: 2, failed: 0 });
    expect(db.getStoredReplayTrajectory(filename, -1, -1)?.driverSlot).toBe(1);
  });
});
