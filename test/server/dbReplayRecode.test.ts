import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { initDbSchema, compressJson, decompressJson, REPLAY_CACHE_VERSION } from '../../server/core/dbSchema.js';
import { recodeReplayTrajectories } from '../../server/core/dbReplayRecode.js';
import { decompressTrajectory, isColumnar } from '../../server/core/replayTrajectoryCodec.js';
import { ReplayTrajectoryData } from '../../server/core/types.js';

function buildTrajectory(overrides: Partial<ReplayTrajectoryData> = {}): ReplayTrajectoryData {
  return {
    replayName: 'Recode_P1.Vcr',
    driverSlot: 1,
    currentLap: 4,
    pointsCount: 3,
    bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2, spanX: 2, spanZ: 2 },
    points: [
      { x: 0, y: 0.5, z: 0, speedKmh: 100, gear: 3, inPit: false, brakeTemps: [1, 2, 3, 4] },
      { x: 1, y: 0.5, z: 1, speedKmh: 110, gear: 3, inPit: false, engineRpm: 8000 },
      { x: 2, y: 0.5, z: 2, speedKmh: 120, gear: 4, inPit: false, brakeTemps: [5, 6, 7, 8] },
    ],
    ...overrides,
  };
}

/** Writes a row in the pre-columnar layout. */
function insertLegacyRow(db: DatabaseType, rowKey: { filename: string; slot: number; lap: number }, trajectory: ReplayTrajectoryData): void {
  db.prepare(`
    INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
    VALUES (?, NULL, ?, ?, 1000, 2048, ?, ?, ?, ?)
  `).run(rowKey.filename, rowKey.slot, rowKey.lap, REPLAY_CACHE_VERSION, trajectory.points.length, compressJson(trajectory), Date.now());
}

describe('replay trajectory columnar recode migration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');
    initDbSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('reports savings without writing during a dry run', () => {
    insertLegacyRow(db, { filename: 'Recode_P1.Vcr', slot: 1, lap: 4 }, buildTrajectory());

    const report = recodeReplayTrajectories(db);

    expect(report.recoded).toBe(1);
    expect(report.failures).toEqual([]);
    const stored = decompressJson<ReplayTrajectoryData>(
      (db.prepare('SELECT trajectory_br FROM replay_trajectories').get() as { trajectory_br: Buffer }).trajectory_br
    );
    expect(isColumnar(stored)).toBe(false);
  });

  it('rewrites legacy rows into the columnar layout without changing the data', () => {
    const trajectory = buildTrajectory();
    insertLegacyRow(db, { filename: 'Recode_P1.Vcr', slot: 1, lap: 4 }, trajectory);

    const report = recodeReplayTrajectories(db, { apply: true });

    expect(report.recoded).toBe(1);
    expect(report.failures).toEqual([]);
    expect(report.bytesAfter).toBeGreaterThan(0);

    const row = db.prepare('SELECT trajectory_br FROM replay_trajectories').get() as { trajectory_br: Buffer };
    expect(isColumnar(decompressJson<ReplayTrajectoryData>(row.trajectory_br))).toBe(true);

    const restored = decompressTrajectory(row.trajectory_br);
    expect(restored.points).toEqual(trajectory.points);
    expect(restored.bounds).toEqual(trajectory.bounds);
    expect(restored.currentLap).toBe(4);
  });

  it('is idempotent and skips rows that are already columnar', () => {
    insertLegacyRow(db, { filename: 'Recode_P1.Vcr', slot: 1, lap: 4 }, buildTrajectory());
    recodeReplayTrajectories(db, { apply: true });

    const second = recodeReplayTrajectories(db, { apply: true });

    expect(second.recoded).toBe(0);
    expect(second.skippedAlreadyColumnar).toBe(1);
  });

  it('commits in batches across many rows', () => {
    for (let lap = 0; lap < 25; lap++) {
      insertLegacyRow(db, { filename: 'Recode_P1.Vcr', slot: 1, lap }, buildTrajectory({ currentLap: lap }));
    }

    const report = recodeReplayTrajectories(db, { apply: true, batchSize: 4 });

    expect(report.recoded).toBe(25);
    const rows = db.prepare('SELECT trajectory_br FROM replay_trajectories').all() as Array<{ trajectory_br: Buffer }>;
    expect(rows).toHaveLength(25);
    for (const row of rows) {
      expect(isColumnar(decompressJson<ReplayTrajectoryData>(row.trajectory_br))).toBe(true);
    }
  });

  it('preserves rows holding a trajectory with no points', () => {
    insertLegacyRow(db, { filename: 'Empty_P1.Vcr', slot: 2, lap: 1 }, buildTrajectory({ points: [], pointsCount: 0 }));

    const report = recodeReplayTrajectories(db, { apply: true });

    expect(report.failures).toEqual([]);
    expect(decompressTrajectory(
      (db.prepare('SELECT trajectory_br FROM replay_trajectories').get() as { trajectory_br: Buffer }).trajectory_br
    ).points).toEqual([]);
  });
});
