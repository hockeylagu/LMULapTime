import type { Database } from 'better-sqlite3';
import type { ReplayMetadata } from '../../../shared/types/index.js';
import { decompressJson } from '../dbCache.js';

const REPLAY_ROSTER_VERSION = 1;

/** Called inside the metadata write transaction. Ambiguous names cannot identify a replay slot. */
export function writeReplayDriverRoster(db: Database, filename: string, metadata: ReplayMetadata): void {
  const names = new Map<string, number[]>();
  for (const driver of metadata.drivers ?? []) {
    // A driver without a name identifies nothing (the roster key is the name).
    if (typeof driver.name !== 'string') continue;
    const key = driver.name.trim().toLowerCase();
    const slots = names.get(key) ?? [];
    // Count unnamed slots too: a duplicate name is ambiguous even if only one has a slot.
    slots.push(driver.slot ?? -1);
    names.set(key, slots);
  }
  db.prepare('DELETE FROM replay_driver_roster WHERE filename=?').run(filename);
  const insert = db.prepare('INSERT INTO replay_driver_roster (filename,driver_name,driver_slot) VALUES (?,?,?)');
  for (const [name, slots] of names) {
    if (name && slots.length === 1 && slots[0] >= 0) insert.run(filename, name, slots[0]);
  }
  db.prepare('UPDATE replay_metadata SET roster_version=? WHERE filename=?').run(REPLAY_ROSTER_VERSION, filename);
}

/**
 * Versioned startup projection from retained metadata, including recordings whose VCR was deleted. A row that
 * cannot be read is marked done with no roster (its laps show no telemetry) and logged: it never stops the start.
 */
export function backfillReplayDriverRosters(db: Database): void {
  const pending = db.prepare('SELECT filename,metadata_br FROM replay_metadata WHERE roster_version!=? LIMIT 50');
  const skip = db.prepare('UPDATE replay_metadata SET roster_version=? WHERE filename=?');
  while (true) {
    const batch = pending.all(REPLAY_ROSTER_VERSION) as Array<{ filename: string; metadata_br: Buffer }>;
    if (!batch.length) return;
    db.transaction(() => {
      for (const row of batch) {
        try {
          writeReplayDriverRoster(db, row.filename, decompressJson<ReplayMetadata>(row.metadata_br));
        } catch (error) {
          console.warn(`[Replay] Unreadable metadata for ${row.filename}; its laps show no telemetry:`, error);
          db.prepare('DELETE FROM replay_driver_roster WHERE filename=?').run(row.filename);
          skip.run(REPLAY_ROSTER_VERSION, row.filename);
        }
      }
    })();
  }
}

/**
 * Whether the driver's lap is stored in its linked replay, for SQL expressions of the replay name, the driver's
 * name and the lap number. Both lookups use primary keys: no metadata/trajectory decompression, filesystem checks
 * or decoding. `lmu_driver_key` is the connection function `initDbSchema` registers (every SessionDatabase has it).
 */
export function availableReplayLapSql(recordingName: string, driverName: string, lapNumber: string): string {
  return `EXISTS (
  SELECT 1 FROM replay_driver_roster rr
  JOIN replay_trajectories rt ON rt.filename=rr.filename AND rt.driver_slot=rr.driver_slot AND rt.lap_key=${lapNumber}
  WHERE rr.filename=${recordingName} AND rr.driver_name=lmu_driver_key(${driverName}) AND rt.points_count>0
)`;
}
