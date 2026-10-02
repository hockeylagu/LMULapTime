import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getReplayConditions, getReplayLaps } from '../../../../server/core/replay/dbReplayLapStore.js';
import { decompressTrajectory } from '../../../../server/core/replay/replayTrajectoryCodec.js';
import type { ReplayTrajectoryData } from '../../../../server/core/types.js';
import { createSliceVcrBuffer } from '../../../utils/mockVcr.js';

const name = 'Ingest_P1.Vcr';

// One decode of a driver: a trajectory whose allLapsData holds each lap.
const decoded = (lapNumbers: number[]): ReplayTrajectoryData => {
  const lap = (currentLap: number) => ({ replayName: name, pointsCount: 1, currentLap, driverSlot: 2, points: [{ x: currentLap, y: 0, z: 0 }] } as ReplayTrajectoryData);
  return { ...lap(lapNumbers[0]), allLapsData: lapNumbers.map(lap) };
};

describe('replay ingest', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('replacing a driver\'s laps', () => {
    it('drops laps the new decode no longer has', () => {
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, decoded([1, 2, 3]), false);
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, decoded([1, 2]), false);

      expect(db.getStoredReplayTrajectory(name, 2, 2)).not.toBeNull();
      expect(db.getStoredReplayTrajectory(name, 2, 3)).toBeNull();
      expect(getReplayLaps(db.getDb(), name, 2).map(l => l.lapNumber)).toEqual([1, 2]);
    });

    it('keeps the previous set whole when a write fails partway', () => {
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, decoded([1, 2, 3]), false);
      const write = db.upsertReplayTrajectoryCache.bind(db);
      let writes = 0;
      vi.spyOn(db, 'upsertReplayTrajectoryCache').mockImplementation((...args) => {
        if (++writes === 2) throw new Error('disk full');
        write(...args);
      });

      expect(() => db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, decoded([4, 5]), false)).toThrow('disk full');

      expect([1, 2, 3].map(n => db.getStoredReplayTrajectory(name, 2, n)?.currentLap)).toEqual([1, 2, 3]);
      expect(db.getStoredReplayTrajectory(name, 2, 4)).toBeNull();
      expect(getReplayLaps(db.getDb(), name, 2).map(l => l.lapNumber)).toEqual([1, 2, 3]);
      expect(db.getReplayDriverIngest(name, 2)?.fileMtime).toBe(1);
    });

    it('records the driver as stored for this file version and parser version', () => {
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 10, 20, 2, decoded([1]), true);

      expect(db.getReplayDriverIngest(name, 2)).toMatchObject({ fileMtime: 10, fileSize: 20, status: 'stored' });
      // The player's decode also settles the "no driver requested" alias.
      expect(db.getReplayDriverIngest(name, -1)).toMatchObject({ status: 'stored' });
    });

    describe('stored rows', () => {
      const ownPit = { driverSlot: 2, timeSec: 0.5, code: 34, action: 'Pit entry' };
      const lapSummary = { lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 };
      const withFacts = (driverSlot: number | undefined): ReplayTrajectoryData => {
        const lap: ReplayTrajectoryData = {
          replayName: name, pointsCount: 1, currentLap: 1, driverSlot,
          bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
          points: [{ x: 0, y: 0, z: 0, timeSec: 1 }],
          laps: [lapSummary],
          weatherEvents: [{ timeSec: 0, rainIntensity: 40, ambientTemp: 20 }],
          pitEvents: [ownPit, { ...ownPit, driverSlot: 5 }],
          standingsHistory: [{ timeSec: 0, order: [2, 5] }],
        };
        return { ...lap, allLapsData: [lap] };
      };
      const storedBlob = (slot: number) => decompressTrajectory((db.getDb()
        .prepare('SELECT trajectory_br FROM replay_trajectories WHERE driver_slot = ? AND lap_key = 1')
        .get(slot) as { trajectory_br: Buffer }).trajectory_br);

      it('leave out what the tables hold, and reads still serve it', () => {
        db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, withFacts(2), false);

        const blob = storedBlob(2);
        expect(blob.weatherEvents).toBeUndefined();
        expect(blob.standingsHistory).toBeUndefined();
        expect(blob.laps).toBeUndefined();
        expect(blob.pitEvents).toEqual([ownPit]);

        expect(db.getStoredReplayTrajectory(name, 2, 1)?.laps).toEqual([expect.objectContaining({ lapNumber: 1, lapTimeSec: 90 })]);
        expect(getReplayConditions(db.getDb(), name)[0]).toMatchObject({ rain: 40 });
      });

      it('keep the lap list of a decode that could not name its driver', () => {
        db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, -1, withFacts(undefined), true);

        expect(storedBlob(-1).laps).toEqual([lapSummary]);
        expect(db.getStoredReplayTrajectory(name, -1, 1)?.laps).toEqual([lapSummary]);
      });

      it('written directly stay whole', () => {
        db.upsertReplayTrajectoryCache(name, 2, 1, 1, 1, withFacts(2));

        expect(storedBlob(2).pitEvents).toHaveLength(2);
      });
    });
  });

  describe('sync', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-replay-ingest-'));
      fs.writeFileSync(path.join(dir, name), createSliceVcrBuffer({
        drivers: [
          { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' },
          { name: 'Rival Driver', vehicleId: '21_26_AFCO95641716', team: 'B', carNumber: '22' },
        ],
        slices: [
          { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
          { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
          { sTime: 0, driverSlot: 2, x: 5, y: 0, z: 0 },
          { sTime: 1, driverSlot: 2, x: 15, y: 0, z: 10 },
        ],
      }));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const fileVersion = () => {
      const stat = fs.statSync(path.join(dir, name));
      return { mtime: Math.floor(stat.mtimeMs), size: stat.size };
    };

    it('does not decode again a driver that failed for this file and parser version', () => {
      const { mtime, size } = fileVersion();
      db.recordReplayDriverIngest(name, 2, mtime, size, 'failed', 'bad stream');

      db.syncReplaysFromDir(dir, { playerName: 'Player Driver' });

      expect(db.getStoredReplayTrajectory(name, 2, -1)).toBeNull();
      expect(db.getReplayDriverIngest(name, 2)).toMatchObject({ status: 'failed', error: 'bad stream' });
      expect(db.getStoredReplayTrajectory(name, 1, -1)).not.toBeNull();
    });

    it('tries a failed driver again once the parser version changes', () => {
      const { mtime, size } = fileVersion();
      db.recordReplayDriverIngest(name, 2, mtime, size, 'failed', 'bad stream');
      (db as unknown as { db: { prepare(sql: string): { run(): void } } }).db
        .prepare("UPDATE replay_ingest_drivers SET parser_version = 'v4'").run();

      db.syncReplaysFromDir(dir, { playerName: 'Player Driver' });

      expect(db.getStoredReplayTrajectory(name, 2, -1)).not.toBeNull();
      expect(db.getReplayDriverIngest(name, 2)?.status).toBe('stored');
    });

    it('marks a replay playable when the primary trajectory is cached but a secondary driver fails', async () => {
      const replace = db.replaceReplayDriverLaps.bind(db);
      vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation((...args) => {
        if (!args[6]) throw new Error('secondary driver write failed');
        replace(...args);
      });
      const jobs: Array<{ status: string; playable?: boolean; error?: string }> = [];
      const iterator = db.syncReplaysAsyncIterator(dir, {
        playerName: 'Player Driver',
        onReplayState: job => jobs.push(job),
      });
      let step = await iterator.next();
      while (!step.done) step = await iterator.next();

      expect(db.getStoredReplayTrajectory(name, -1, -1)).not.toBeNull();
      expect(jobs[jobs.length - 1]).toMatchObject({ status: 'failed', playable: true, error: 'secondary driver write failed' });

      const secondRun: Array<{ status: string; playable?: boolean; error?: string }> = [];
      const retryCheck = db.syncReplaysAsyncIterator(dir, {
        playerName: 'Player Driver',
        onReplayState: job => secondRun.push(job),
      });
      step = await retryCheck.next();
      while (!step.done) step = await retryCheck.next();
      expect(secondRun[secondRun.length - 1]).toMatchObject({ status: 'failed', playable: true, error: 'secondary driver write failed' });
    });

    it('leaves a replay unplayable when its primary trajectory cannot be stored', async () => {
      vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation(() => {
        throw new Error('trajectory write failed');
      });
      const jobs: Array<{ status: string; playable?: boolean; error?: string }> = [];
      const iterator = db.syncReplaysAsyncIterator(dir, {
        playerName: 'Player Driver',
        onReplayState: job => jobs.push(job),
      });
      let step = await iterator.next();
      while (!step.done) step = await iterator.next();

      expect(db.getStoredReplayTrajectory(name, -1, -1)).toBeNull();
      expect(jobs[jobs.length - 1]).toMatchObject({ status: 'failed', playable: false, error: 'trajectory write failed' });
    });
  });
});
