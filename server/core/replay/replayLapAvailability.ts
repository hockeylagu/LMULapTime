import type { Database } from 'better-sqlite3';
import type { ReplayMetadata } from '../../../shared/types/index.js';
import { decompressJson } from '../dbCache.js';

const REPLAY_ROSTER_VERSION = 1;

/** Called inside the metadata write transaction. Ambiguous names cannot identify a replay slot. */
export function writeReplayDriverRoster(db: Database, filename: string, metadata: ReplayMetadata): void {
  const names = new Map<string, number[]>();
  for (const driver of metadata.drivers ?? []) {
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

/** Versioned startup projection from retained metadata, including recordings whose VCR was deleted. */
export function backfillReplayDriverRosters(db: Database): void {
  const pending = db.prepare('SELECT filename,metadata_br FROM replay_metadata WHERE roster_version!=? LIMIT 50');
  while (true) {
    const batch = pending.all(REPLAY_ROSTER_VERSION) as Array<{ filename: string; metadata_br: Buffer }>;
    if (!batch.length) return;
    db.transaction(() => {
      for (const row of batch) writeReplayDriverRoster(db, row.filename, decompressJson<ReplayMetadata>(row.metadata_br));
    })();
  }
}

/** Both lookups use primary keys. No metadata/trajectory decompression, filesystem checks or decoding. */
export const AVAILABLE_REPLAY_LAP_SQL = `EXISTS (
  SELECT 1 FROM replay_driver_roster rr
  JOIN replay_trajectories rt ON rt.filename=rr.filename AND rt.driver_slot=rr.driver_slot AND rt.lap_key=l.lap_number
  WHERE rr.filename=s.recording_name AND rr.driver_name=lmu_driver_key(dn.name) AND rt.points_count>0
)`;
