import { Database as DatabaseType } from 'better-sqlite3';
import zlib from 'zlib';
import { ReplayTrajectoryData, ReplayTrajectoryPoint, DuckDbLapTelemetry } from './types.js';

function compressJson(value: unknown): Buffer {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(value), 'utf8'), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
  });
}

function decompressJson<T>(buf: Buffer): T {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')) as T;
}

function normalizePointsArray(points: ReplayTrajectoryPoint[] | undefined): boolean {
  if (!points || points.length === 0) return false;
  let maxAbs = 0;
  for (const p of points) {
    if (typeof p.steerYaw === 'number') {
      maxAbs = Math.max(maxAbs, Math.abs(p.steerYaw));
    }
  }
  if (maxAbs <= 1.01) return false;

  const divisor = maxAbs > 270.5 ? 540 : 270;
  let changed = false;
  for (const p of points) {
    if (typeof p.steerYaw === 'number' && Math.abs(p.steerYaw) > 1.01) {
      p.steerYaw = parseFloat((p.steerYaw / divisor).toFixed(4));
      changed = true;
    }
  }
  return changed;
}

function normalizeTrajectory(trajectory: ReplayTrajectoryData): boolean {
  let changed = normalizePointsArray(trajectory.points);

  if (Array.isArray(trajectory.allLapsData)) {
    for (const lapTraj of trajectory.allLapsData) {
      if (normalizePointsArray(lapTraj.points)) {
        changed = true;
      }
    }
  }

  return changed;
}

export interface SteeringMigrationResult {
  replayMetadataUpdated: number;
  replayTrajectoriesMigrated: number;
  telemetryLapsMigrated: number;
}

export function migrateSteeringCache(db: DatabaseType): SteeringMigrationResult {
  let replayMetadataUpdated = 0;
  let replayTrajectoriesMigrated = 0;
  let telemetryLapsMigrated = 0;

  const hasTable = (tableName: string): boolean => {
    try {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
      return Boolean(row);
    } catch {
      return false;
    }
  };

  // 1. Update replay_metadata version to 'v2' if it was 'v1'
  if (hasTable('replay_metadata')) {
    const unmigratedMeta = (db.prepare("SELECT COUNT(*) as count FROM replay_metadata WHERE parser_version != 'v2'").get() as { count: number }).count;
    if (unmigratedMeta > 0) {
      console.log(`[Migration] Updating ${unmigratedMeta} replay_metadata rows to v2...`);
      const metaStmt = db.prepare("UPDATE replay_metadata SET parser_version = 'v2' WHERE parser_version != 'v2'");
      const metaRes = metaStmt.run();
      replayMetadataUpdated = metaRes.changes;
    }
  }

  // 2. Migrate replay_trajectories using streaming iterator, WHERE parser_version != 'v2'
  if (hasTable('replay_trajectories')) {
    const unmigratedCount = (db.prepare("SELECT COUNT(*) as count FROM replay_trajectories WHERE parser_version != 'v2'").get() as { count: number }).count;

    if (unmigratedCount > 0) {
      console.log(`[Migration] Found ${unmigratedCount} unmigrated trajectory entries in database...`);

      const updateTrajStmt = db.prepare(
        "UPDATE replay_trajectories SET parser_version = 'v2', trajectory_br = ?, updated_at = ? WHERE filename = ? AND driver_slot = ? AND lap_key = ?"
      );
      const updateVersionOnlyStmt = db.prepare(
        "UPDATE replay_trajectories SET parser_version = 'v2', updated_at = ? WHERE filename = ? AND driver_slot = ? AND lap_key = ?"
      );

      const now = Date.now();
      const BATCH_SIZE = 1000;
      let processed = 0;

      const iterator = db.prepare(
        "SELECT filename, driver_slot, lap_key, parser_version, trajectory_br FROM replay_trajectories WHERE parser_version != 'v2'"
      ).all() as Array<{
        filename: string;
        driver_slot: number;
        lap_key: number;
        parser_version: string;
        trajectory_br: Buffer;
      }>;

      let pendingActions: Array<() => void> = [];

      const flushBatch = () => {
        if (pendingActions.length === 0) return;
        const tx = db.transaction(() => {
          for (const action of pendingActions) action();
        });
        tx();
        pendingActions = [];
      };

      for (const row of iterator) {
        processed++;
        try {
          const trajectory = decompressJson<ReplayTrajectoryData>(row.trajectory_br);
          const pointsChanged = normalizeTrajectory(trajectory);

          if (pointsChanged) {
            const compressed = compressJson(trajectory);
            pendingActions.push(() => {
              updateTrajStmt.run(compressed, now, row.filename, row.driver_slot, row.lap_key);
              replayTrajectoriesMigrated++;
            });
          } else {
            pendingActions.push(() => {
              updateVersionOnlyStmt.run(now, row.filename, row.driver_slot, row.lap_key);
              replayTrajectoriesMigrated++;
            });
          }
        } catch (err) {
          console.error(`[Migration] Failed to process trajectory ${row.filename} slot ${row.driver_slot}:`, err);
        }

        if (pendingActions.length >= BATCH_SIZE) {
          flushBatch();
          console.log(`[Migration] Processed ${processed}/${unmigratedCount} trajectories (${replayTrajectoriesMigrated} updated)...`);
        }
      }

      flushBatch();
      console.log(`[Migration] Completed trajectory migration: ${processed}/${unmigratedCount} processed.`);
    }
  }

  // 3. Migrate telemetry_lap_cache
  if (hasTable('telemetry_lap_cache')) {
    const telRows = db.prepare(
      'SELECT filename, lap_number, telemetry_br FROM telemetry_lap_cache'
    ).all() as Array<{
      filename: string;
      lap_number: number;
      telemetry_br: Buffer;
    }>;

    if (telRows.length > 0) {
      console.log(`[Migration] Checking ${telRows.length} telemetry lap entries...`);
      const updateTelStmt = db.prepare(
        'UPDATE telemetry_lap_cache SET telemetry_br = ?, updated_at = ? WHERE filename = ? AND lap_number = ?'
      );

      const BATCH_SIZE = 1000;
      const now = Date.now();
      let pendingActions: Array<() => void> = [];

      for (let i = 0; i < telRows.length; i++) {
        const row = telRows[i];
        try {
          const lapData = decompressJson<DuckDbLapTelemetry>(row.telemetry_br);
          const pointsChanged = normalizePointsArray(lapData.points);

          if (pointsChanged) {
            const compressed = compressJson(lapData);
            pendingActions.push(() => {
              updateTelStmt.run(compressed, now, row.filename, row.lap_number);
              telemetryLapsMigrated++;
            });
          }
        } catch (err) {
          console.error(`[Migration] Failed to process telemetry lap ${row.filename} lap ${row.lap_number}:`, err);
        }

        if (pendingActions.length >= BATCH_SIZE) {
          const tx = db.transaction(() => {
            for (const action of pendingActions) action();
          });
          tx();
          pendingActions = [];
        }
      }

      if (pendingActions.length > 0) {
        const tx = db.transaction(() => {
          for (const action of pendingActions) action();
        });
        tx();
      }
    }
  }

  return {
    replayMetadataUpdated,
    replayTrajectoriesMigrated,
    telemetryLapsMigrated,
  };
}




