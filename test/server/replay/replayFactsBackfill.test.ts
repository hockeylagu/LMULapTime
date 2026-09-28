import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import zlib from 'zlib';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { initDbSchema } from '../../../server/core/dbSchema.js';
import { compressTrajectory } from '../../../server/core/replay/replayTrajectoryCodec.js';
import {
  getDriverEvents,
  getReplayConditions,
  getReplayFactsVersion,
  getReplayLaps,
  replaceReplayDriverLapFacts,
  replaceReplayWideFacts,
} from '../../../server/core/replay/dbReplayLapStore.js';
import { emptyLapFact } from '../../../server/replay/replayFacts.js';
import {
  backfillReplayFactsAsyncIterator,
  listReplayFactsBacklog,
  readStoredLapHead,
  ReplayFactsBackfillResult,
  ReplayFactsBackfillRunner,
} from '../../../server/replay/replayFactsBackfill.js';
import type { ReplayTrajectoryData } from '../../../server/core/types.js';

const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 };

// A stored lap row as each cache version wrote it: every lap blob carries the replay-wide arrays.
const lapBlob = (filename: string, driverSlot: number, lap: number, withWeather = true): ReplayTrajectoryData => ({
  replayName: filename, pointsCount: 2, currentLap: lap, driverSlot, bounds,
  points: [{ x: 0, y: 0, z: 0, timeSec: lap * 100 }, { x: 1, y: 0, z: 1, timeSec: lap * 100 + 90 }],
  laps: [1, 2].map(n => ({ lapNumber: n, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 })),
  ...(withWeather ? { weatherEvents: [{ timeSec: 0, rainIntensity: 40, ambientTemp: 21 }] } : {}),
  pitEvents: [{ driverSlot: 1, timeSec: 150, code: 34, action: 'Pit entry' }],
});

function insertRow(db: DatabaseType, filename: string, driverSlot: number, lapKey: number, version: string, trajectory: ReplayTrajectoryData): void {
  db.prepare(`INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, 1)`).run(filename, `C:/gone/${filename}`, driverSlot, lapKey, version, trajectory.points.length, compressTrajectory(trajectory));
}

async function drain(iterator: AsyncGenerator<unknown, ReplayFactsBackfillResult, void>): Promise<ReplayFactsBackfillResult> {
  let step = await iterator.next();
  while (!step.done) step = await iterator.next();
  return step.value;
}

describe('replay facts backfill', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');
    initDbSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('reads a lap\'s list and span from columnar and legacy point blobs', () => {
    const lap = lapBlob('A.Vcr', 1, 2);
    expect(readStoredLapHead(compressTrajectory(lap))).toMatchObject({ span: { startSec: 200, endSec: 290 } });
    const legacy = zlib.brotliCompressSync(Buffer.from(JSON.stringify(lap)));
    expect(readStoredLapHead(legacy)).toEqual({ laps: lap.laps, span: { startSec: 200, endSec: 290 } });
  });

  it('fills lap facts and replay-wide facts for v3, v5 and v7 rows, and leaves the blobs as written', async () => {
    insertRow(db, 'V3.Vcr', 1, 1, 'v3', lapBlob('V3.Vcr', 1, 1, false));
    insertRow(db, 'V5.Vcr', 1, 1, 'v5', lapBlob('V5.Vcr', 1, 1));
    insertRow(db, 'V7.Vcr', 1, 1, 'v7', lapBlob('V7.Vcr', 1, 1));
    insertRow(db, 'V7.Vcr', 1, 2, 'v7', lapBlob('V7.Vcr', 1, 2));
    const before = db.prepare('SELECT trajectory_br FROM replay_trajectories ORDER BY filename, lap_key').all();

    const result = await drain(backfillReplayFactsAsyncIterator(db));

    expect(result).toMatchObject({ replays: 3, interrupted: false });
    expect(getReplayFactsVersion(db, 'V3.Vcr')).toBe('v3');
    expect(getReplayConditions(db, 'V3.Vcr')).toEqual([]);
    expect(getReplayConditions(db, 'V5.Vcr')).toHaveLength(1);
    expect(getReplayLaps(db, 'V7.Vcr').map(l => [l.lapNumber, l.startSec, l.endSec, l.lapTimeSec])).toEqual([[1, 100, 190, 90], [2, 200, 290, 90]]);
    expect(getReplayConditions(db, 'V7.Vcr')[0]).toMatchObject({ startSec: 0, endSec: 290, rain: 40 });
    expect(getDriverEvents(db, 'V7.Vcr').map(e => [e.kind, e.code])).toEqual([['pit', 34]]);
    expect(db.prepare('SELECT trajectory_br FROM replay_trajectories ORDER BY filename, lap_key').all()).toEqual(before);
    expect(listReplayFactsBacklog(db)).toEqual([]);
  });

  it('skips the -1 rows', async () => {
    insertRow(db, 'Alias.Vcr', -1, 1, 'v7', lapBlob('Alias.Vcr', -1, 1));
    insertRow(db, 'Alias.Vcr', 1, -1, 'v7', lapBlob('Alias.Vcr', 1, 1));

    expect(listReplayFactsBacklog(db)).toEqual([]);
    expect(await drain(backfillReplayFactsAsyncIterator(db))).toMatchObject({ replays: 0, laps: 0 });
  });

  it('stops between replays and resumes with the rest, then has nothing left to do', async () => {
    for (const name of ['A.Vcr', 'B.Vcr', 'C.Vcr']) insertRow(db, name, 1, 1, 'v7', lapBlob(name, 1, 1));
    let steps = 0;

    const first = await drain(backfillReplayFactsAsyncIterator(db, { shouldStop: () => steps++ >= 1 }));

    expect(first).toMatchObject({ replays: 1, interrupted: true });
    expect(listReplayFactsBacklog(db)).toEqual(['B.Vcr', 'C.Vcr']);
    expect(await drain(backfillReplayFactsAsyncIterator(db))).toMatchObject({ replays: 2, interrupted: false });
    expect(await drain(backfillReplayFactsAsyncIterator(db))).toMatchObject({ replays: 0, laps: 0 });
  });

  it('fills only the driver a replay is missing', async () => {
    insertRow(db, 'A.Vcr', 1, 1, 'v7', lapBlob('A.Vcr', 1, 1));
    await drain(backfillReplayFactsAsyncIterator(db));
    insertRow(db, 'A.Vcr', 2, 1, 'v7', lapBlob('A.Vcr', 2, 1));

    expect(listReplayFactsBacklog(db)).toEqual(['A.Vcr']);
    await drain(backfillReplayFactsAsyncIterator(db));
    expect(getReplayLaps(db, 'A.Vcr').map(l => l.driverSlot)).toEqual([1, 1, 2, 2]);
  });

  it('keeps the facts of a decode stored while it was reading the replay\'s rows', async () => {
    insertRow(db, 'A.Vcr', 1, 1, 'v5', lapBlob('A.Vcr', 1, 1));
    const iterator = backfillReplayFactsAsyncIterator(db);
    await iterator.next();

    // The backfill has read the replay-wide facts and is yielding before the first lap row.
    const reading = iterator.next();
    replaceReplayWideFacts(db, 'A.Vcr', { endSec: 5, sessionRunningOrder: null, conditions: [], runningOrder: [], driverEvents: [] }, 'v7');
    replaceReplayDriverLapFacts(db, 'A.Vcr', 1, [emptyLapFact(9)], 'v7');
    await reading;
    await drain(iterator);

    expect(getReplayFactsVersion(db, 'A.Vcr')).toBe('v7');
    expect(getDriverEvents(db, 'A.Vcr')).toEqual([]);
    expect(getReplayLaps(db, 'A.Vcr').map(l => l.lapNumber)).toEqual([9]);
  });

  it('runs in the background and reports its result', async () => {
    insertRow(db, 'A.Vcr', 1, 1, 'v7', lapBlob('A.Vcr', 1, 1));
    const runner = new ReplayFactsBackfillRunner(db);

    expect(runner.start()).toBe(true);
    expect(runner.start()).toBe(false);
    await expect.poll(() => runner.getStatus().running).toBe(false);

    expect(runner.getStatus()).toMatchObject({ processed: 1, error: null, result: { replays: 1, laps: 2, interrupted: false } });
  });
});
