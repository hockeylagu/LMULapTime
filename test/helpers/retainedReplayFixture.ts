import type { Database } from 'better-sqlite3';
import type { DetailedSession } from '../../shared/types/index.js';
import { upsertReplayMetadataCache } from '../../server/core/replay/dbReplayMetadataStore.js';

/** A deleted VCR with retained per-lap rows; blobs are never decoded by availability reads. */
export function retainSessionReplay(db: Database, session: DetailedSession): void {
  const filename = session.matchingReplayFile?.name;
  if (!filename) return;
  upsertReplayMetadataCache(db, filename, '/missing/retained.Vcr', 1, 1, {
    filename, filePath: '/missing/retained.Vcr', mtimeMs: 1, fileSizeBytes: 1,
    timeSliceCount: 1, totalEvents: 1, durationSec: 100,
    drivers: session.drivers.map((driver, slot) => ({ name: driver.name, slot })),
  });
  const insert = db.prepare(`INSERT INTO replay_trajectories
    (filename,driver_slot,lap_key,file_mtime_ms,file_size_bytes,parser_version,points_count,trajectory_br,updated_at)
    VALUES (?,?,?,1,1,'v7',10,?,1)`);
  session.drivers.forEach((driver, slot) => driver.laps.forEach(lap => insert.run(filename, slot, lap.lapNumber, Buffer.alloc(0))));
}
