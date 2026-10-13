import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { REPLAY_CACHE_VERSION } from '../../../../server/core/dbCache.js';
import {
  getReplayLapEdges,
  getReplayTrajectoryCache,
  getStoredReplayTrajectory,
  hasValidReplayTrajectoryCache,
  upsertReplayTrajectoryCache,
} from '../../../../server/core/replay/dbReplayTrajectoryStore.js';
import { replaceReplayDriverLapFacts } from '../../../../server/core/replay/dbReplayLapStore.js';
import { lapFactsFrom } from '../../../../server/replay/decode/replayFacts.js';
import { ReplayTrajectoryData } from '../../../../shared/types/index.js';

const lap = (lapNumber: number): ReplayTrajectoryData => ({
  replayName: 'Spa_R1.Vcr',
  pointsCount: 2,
  currentLap: lapNumber,
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
  points: [
    { x: lapNumber * 100, y: 0, z: 0, timeSec: lapNumber * 100 },
    { x: lapNumber * 100 + 50, y: 0, z: 0, timeSec: lapNumber * 100 + 50 },
  ],
});

describe('dbReplayTrajectoryStore', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');
    initDbSchema(db);
  });

  afterEach(() => db.close());

  const setVersion = (version: string) => db.prepare('UPDATE replay_trajectories SET parser_version = ?').run(version);

  describe('lap list', () => {
    const summary = (lapNumber: number, lapTimeSec: number) => ({ lapNumber, lapTimeSec, s1Sec: 30, s2Sec: 30, s3Sec: lapTimeSec - 60 });

    it('recovers pit classification for deleted recordings after rebuilding summaries from facts', () => {
      const summaries = [{ ...summary(2, 90), isBest: true }, summary(3, 100), summary(4, 101)];
      const trajectory = { ...lap(2), driverSlot: 3, laps: summaries,
        pitEvents: [{ driverSlot: 3, timeSec: 220, code: 34, action: 'Pit entry' }, { driverSlot: 3, timeSec: 280, code: 32, action: 'Pit exit' }] };
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 2, 1000, 5000, trajectory);
      replaceReplayDriverLapFacts(db, 'Spa_R1.Vcr', 3, lapFactsFrom(summaries, new Map([
        [2, { startSec: 200, endSec: 250 }], [3, { startSec: 250, endSec: 350 }], [4, { startSec: 350, endSec: 451 }],
      ])), REPLAY_CACHE_VERSION);
      const before = db.prepare('SELECT trajectory_br FROM replay_trajectories').get() as { trajectory_br: Buffer };
      const retained = getStoredReplayTrajectory(db, 'Spa_R1.Vcr', 3, 2)!;
      expect(retained.laps?.[0]).toMatchObject({ isPitStop: true, isBest: false });
      expect(retained.laps?.[1].isOutLap).toBe(true);
      expect(retained.laps?.[2].isBest).toBe(true);
      const after = db.prepare('SELECT trajectory_br FROM replay_trajectories').get() as { trajectory_br: Buffer };
      expect(after.trajectory_br.equals(before.trajectory_br)).toBe(true);
    });

    it('comes from the lap facts once the driver has them, and from the blob until then', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000, { ...lap(4), laps: [summary(4, 100)] });
      expect(getReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)?.laps).toEqual([summary(4, 100)]);

      replaceReplayDriverLapFacts(db, 'Spa_R1.Vcr', 3, lapFactsFrom([summary(4, 100), summary(5, 99)], new Map()), REPLAY_CACHE_VERSION);
      expect(getReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)?.laps).toEqual([summary(4, 100), summary(5, 99)]);
    });
  });

  describe('cache versions', () => {
    it('keeps rows of a compatible version valid, so the replay is not decoded again', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000, lap(4));
      setVersion('v4');
      expect(hasValidReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)).toBe(true);
      expect(getReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)?.currentLap).toBe(4);

      setVersion('v3');
      expect(hasValidReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)).toBe(true);
      expect(getReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)?.currentLap).toBe(4);
    });

    it('treats rows of an unknown version as stale', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000, lap(4));
      setVersion('v2');
      expect(hasValidReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000)).toBe(false);
    });

    it('writes the current version', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000, lap(4));
      const row = db.prepare('SELECT parser_version FROM replay_trajectories').get() as { parser_version: string };
      expect(row.parser_version).toBe(REPLAY_CACHE_VERSION);
    });
  });

  describe('getReplayLapEdges', () => {
    it('reads only neighbour blobs and does not rebuild their driver lap summaries', () => {
      db.close();
      const queries: string[] = [];
      db = new Database(':memory:', { verbose: sql => { if (typeof sql === 'string') queries.push(sql); } });
      initDbSchema(db);
      for (const n of [1, 2, 3]) {
        const points = Array.from({ length: 6000 }, (_, i) => {
          const timeSec = (n - 1) * 120 + i * 0.02;
          return { x: timeSec, y: 0, z: 0, timeSec, speedKmh: 180, brakeTemps: [1, 2, 3, 4] as [number, number, number, number] };
        });
        upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, n, 1000, 5000, { ...lap(n), driverSlot: 3, points, pointsCount: points.length });
      }
      queries.length = 0;
      const current = getReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 2, 1000, 5000)!;
      const { leadIn, leadOut } = getReplayLapEdges(db, 'Spa_R1.Vcr', 3, 2, current.points);
      expect(leadIn).toHaveLength(100);
      expect(leadOut).toHaveLength(100);
      expect(leadIn[0].brakeTemps).toEqual([1, 2, 3, 4]);
      expect(queries.filter(sql => sql.startsWith('SELECT') && sql.includes('trajectory_br'))).toHaveLength(3);
      expect(queries.filter(sql => sql.startsWith('SELECT') && sql.includes('FROM replay_laps'))).toHaveLength(1);
    });

    it('returns the stored laps either side of a lap, whatever their version (the replay may be deleted)', () => {
      for (const n of [3, 4, 5]) upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, n, 1000, 5000, lap(n));
      const previous = { ...lap(3), points: [{ x: 399, y: 0, z: 0, timeSec: 399 }] };
      const next = { ...lap(5), points: [{ x: 451, y: 0, z: 0, timeSec: 451 }] };
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 3, 1000, 5000, previous);
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 5, 1000, 5000, next);
      setVersion('v2');
      const edges = getReplayLapEdges(db, 'Spa_R1.Vcr', 3, 4, lap(4).points);
      expect(edges.leadIn).toEqual([{ ...previous.points[0], inGarage: false }]);
      expect(edges.leadOut).toEqual([{ ...next.points[0], inGarage: false }]);
    });

    it('only uses laps of the same driver and the same recording', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 4, 1000, 5000, lap(4));
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 7, 3, 1000, 5000, lap(3));
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 5, 2000, 5000, lap(5));
      expect(getReplayLapEdges(db, 'Spa_R1.Vcr', 3, 4, lap(4).points)).toEqual({ leadIn: [], leadOut: [] });
    });

    it('returns nothing for a lap that is not stored', () => {
      upsertReplayTrajectoryCache(db, 'Spa_R1.Vcr', 3, 3, 1000, 5000, lap(3));
      expect(getReplayLapEdges(db, 'Spa_R1.Vcr', 3, 4, lap(4).points)).toEqual({ leadIn: [], leadOut: [] });
    });
  });
});
