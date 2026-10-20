import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { ReplayIngestJob } from '../../../../shared/types/index.js';
import { createSliceVcrBuffer } from '../../../utils/mockVcr.js';

describe('Replay startup sync pipeline', () => {
  let dir: string;
  let db: SessionDatabase;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-replay-sync-'));
    db = new SessionDatabase(':memory:');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves event-loop callbacks between cached replay discovery and driver checks', async () => {
    // Every item uses up a whole time slice, so the loop turns after each one.
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock += 1000);
    for (const filename of ['a.Vcr', 'b.Vcr', 'c.Vcr']) fs.writeFileSync(path.join(dir, filename), 'cached');
    let discovered = 0;
    let verified = 0;
    const discoveryTurns: number[] = [];
    const verificationTurns: number[] = [];
    vi.spyOn(db, 'getReplayMetadataCache').mockImplementation((filename, mtimeMs, fileSizeBytes, filePath) => {
      discovered++;
      setImmediate(() => discoveryTurns.push(discovered));
      return { filename, filePath: filePath!, mtimeMs, fileSizeBytes, timeSliceCount: 0,
        totalEvents: 0, durationSec: 0, drivers: [{ slot: 1, name: 'Other' }] };
    });
    const iterator = db.syncReplaysAsyncIterator(dir, {
      playerName: 'Player',
      onMetadataReady: () => new Set(['a.Vcr', 'b.Vcr', 'c.Vcr']),
    });
    vi.spyOn(db, 'hasValidReplayTrajectoryCache').mockReturnValue(true);
    vi.spyOn(db, 'getReplayDriverIngest').mockImplementation(() => {
      verified++;
      setImmediate(() => verificationTurns.push(verified));
      return null;
    });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();
    expect(discoveryTurns).toEqual([1, 2, 3]);
    expect(step.value).toMatchObject({ added: 0, updated: 0 });
    expect(verificationTurns).toEqual([2, 2, 4, 4, 6, 6]);
  });

  it('retries a failed replay decode on Refresh without changing its source file', async () => {
    fs.writeFileSync(
      path.join(dir, 'retry.Vcr'),
      createSliceVcrBuffer({
        drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
        slices: [
          { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
          { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        ],
      })
    );
    const store = vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation(() => {
      throw new Error('Disk busy');
    });
    const jobs: ReplayIngestJob[] = [];
    const run = async () => {
      const iterator = db.syncReplaysAsyncIterator(dir, { playerName: 'Player', retryFailed: true, onReplayState: (job) => jobs.push(job) });
      let step = await iterator.next();
      while (!step.done) step = await iterator.next();
    };
    await run();
    expect(jobs[jobs.length - 1]).toMatchObject({ status: 'queued' });
    expect(db.getReplayDriverIngest('retry.Vcr', -1)).toMatchObject({ status: 'interrupted', error: 'Disk busy' });
    store.mockRestore();
    await run();
    expect(jobs[jobs.length - 1]?.status).toBe('ready');
    expect(db.getStoredReplayTrajectory('retry.Vcr', -1, -1)).not.toBeNull();
  });

  it('stores the primary alias when the configured player name is blank by using the profile player', async () => {
    const userData = path.join(dir, 'UserData');
    const replays = path.join(userData, 'Replays');
    fs.mkdirSync(path.join(userData, 'player'), { recursive: true });
    fs.mkdirSync(replays);
    fs.writeFileSync(path.join(userData, 'player', 'settings.json'), JSON.stringify({ DRIVER: { 'Player Name': 'Player' } }));
    fs.writeFileSync(path.join(replays, 'blank.Vcr'), createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    }));
    const iterator = db.syncReplaysAsyncIterator(replays, { playerName: '' });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();
    expect(db.getReplayDriverIngest('blank.Vcr', -1)).toMatchObject({ status: 'stored' });
    expect(db.getStoredReplayTrajectory('blank.Vcr', -1, -1)).not.toBeNull();
  });

  it('decodes the newest replay first, whatever the filenames', async () => {
    const bytes = createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    });
    const write = (name: string, date: Date) => {
      fs.writeFileSync(path.join(dir, name), bytes);
      fs.utimesSync(path.join(dir, name), date, date);
    };
    write('A old.Vcr', new Date('2026-09-01T12:00:00Z'));
    write('B newest.Vcr', new Date('2026-10-05T12:00:00Z'));
    write('C middle.Vcr', new Date('2026-09-20T12:00:00Z'));
    const processing: string[] = [];
    const iterator = db.syncReplaysAsyncIterator(dir, {
      playerName: 'Player',
      onReplayState: (job) => {
        if (job.status === 'processing') processing.push(job.name);
      },
    });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();

    expect(processing).toEqual(['B newest.Vcr', 'C middle.Vcr', 'A old.Vcr']);
  });

  it('discovers all replay metadata before decoding only associated recordings and reuses cached decodes', async () => {
    const bytes = createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    });
    fs.writeFileSync(path.join(dir, 'associated.Vcr'), bytes);
    fs.writeFileSync(path.join(dir, 'unrelated.Vcr'), bytes);
    const jobs: ReplayIngestJob[] = [];
    const run = async () => {
      const iterator = db.syncReplaysAsyncIterator(dir, {
        playerName: 'Player',
        onMetadataReady: async () => {
          expect(db.getReplaysCount()).toBe(2);
          expect(db.getCacheStats().replayTrajectoriesCount).toBe(0);
          await new Promise<void>((resolve) => setImmediate(resolve));
          return new Set(['associated.Vcr']);
        },
        onReplayState: (job) => jobs.push(job),
      });
      let step = await iterator.next();
      while (!step.done) step = await iterator.next();
      return step.value;
    };
    expect((await run()).added).toBe(2);
    expect(jobs.map((job) => job.status)).toEqual(['queued', 'processing', 'ready']);
    expect(jobs.every((job) => job.name === 'associated.Vcr')).toBe(true);
    expect(db.getStoredReplayTrajectory('associated.Vcr', -1, -1)).not.toBeNull();
    expect(db.getStoredReplayTrajectory('unrelated.Vcr', -1, -1)).toBeNull();
    const store = vi.spyOn(db, 'replaceReplayDriverLaps');
    const iterator = db.syncReplaysAsyncIterator(dir, { onMetadataReady: () => new Set(['associated.Vcr']) });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();
    expect(store).not.toHaveBeenCalled();
    expect(step.value).toMatchObject({ added: 0, updated: 0 });
  });

  it('only counts new or unparsed replays in progress total instead of all on disk', async () => {
    const bytes = createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    });
    const write = (name: string, date: Date) => {
      fs.writeFileSync(path.join(dir, name), bytes);
      fs.utimesSync(path.join(dir, name), date, date);
    };
    write('older1.Vcr', new Date('2026-09-01T12:00:00Z'));

    // Cache older1
    db.syncReplaysFromDir(dir, { playerName: 'Player' });

    // Now add a 2nd replay (newest)
    write('newest.Vcr', new Date('2026-10-06T12:00:00Z'));
    const totals: number[] = [];
    const iter = db.syncReplaysAsyncIterator(dir, { playerName: 'Player' });
    let s = await iter.next();
    while (!s.done) {
      totals.push(s.value.total);
      if (s.value.stage === 'Starting replay decode') break;
      s = await iter.next();
    }
    // Only the 1 new replay is counted in progress total, not both on disk
    expect(totals.length).toBeGreaterThan(0);
    expect(totals.every((total) => total === 1)).toBe(true);
  });

  it('records a replay it cannot stat and still discovers the others', async () => {
    const bytes = createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 }],
    });
    fs.writeFileSync(path.join(dir, 'locked.Vcr'), bytes);
    fs.writeFileSync(path.join(dir, 'fine.Vcr'), bytes);
    const stat = fs.promises.stat.bind(fs.promises);
    vi.spyOn(fs.promises, 'stat').mockImplementation(async (target, ...rest) => {
      if (String(target).endsWith('locked.Vcr')) throw new Error('EBUSY: resource busy');
      return stat(target, ...rest);
    });
    const jobs: ReplayIngestJob[] = [];
    const iterator = db.syncReplaysAsyncIterator(dir, { playerName: 'Player', onReplayState: (job) => jobs.push(job) });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();
    expect(step.value).toMatchObject({ added: 1, skipped: 1 });
    expect(jobs.find((job) => job.name === 'locked.Vcr')).toMatchObject({ status: 'failed', error: 'EBUSY: resource busy' });
    expect(db.getStoredReplayTrajectory('fine.Vcr', -1, -1)).not.toBeNull();
  });

  it('stops a decode in progress and leaves the replay queued for the next scan', async () => {
    fs.writeFileSync(path.join(dir, 'stopped.Vcr'), createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 }],
    }));
    let decoding = false;
    const jobs: ReplayIngestJob[] = [];
    const iterator = db.syncReplaysAsyncIterator(dir, {
      playerName: 'Player',
      // Stops at the first worker progress, after the decode has started.
      shouldStop: () => decoding,
      onReplayState: (job) => jobs.push(job),
    });
    let step = await iterator.next();
    while (!step.done) {
      if (step.value.stage === 'Verifying trajectory cache') decoding = true;
      step = await iterator.next();
    }
    expect(step.value).toMatchObject({ interrupted: true });
    expect(jobs[jobs.length - 1]).toMatchObject({ name: 'stopped.Vcr', status: 'queued' });
    expect(db.getStoredReplayTrajectory('stopped.Vcr', -1, -1)).toBeNull();
  });
});
