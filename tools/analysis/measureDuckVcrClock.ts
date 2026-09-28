/**
 * Read-only survey of the DuckDB laps in the cache: puts the VCR lap of the same replay on the
 * DuckDB lap clock exactly as the fusion does, and prints how the two clocks line up
 * (./duckVcrClockCheck.ts). Nothing is written to the database.
 *
 * Usage:
 *   npx tsx tools/analysis/measureDuckVcrClock.ts [path/to/lmu_cache.db]
 */
import path from 'path';
import Database from 'better-sqlite3';
import { DuckDbLapTelemetry, ReplayMetadata } from '../../server/core/types.js';
import { decompressTrajectory } from '../../server/core/replay/replayTrajectoryCodec.js';
import { DUCKDB_TELEMETRY_CACHE_VERSION, decompressJson } from '../../server/core/dbSchema.js';
import { vcrLapBaseTime } from '../../server/telemetry/telemetryFusion.js';
import { checkDuckVcrClock } from './duckVcrClockCheck.js';

const dbPath = process.argv[2] ?? path.join(process.cwd(), 'server', 'lmu_cache.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const duckLaps = db.prepare(`
  SELECT c.filename, c.lap_number, c.telemetry_br, m.matched_replay_filename AS replay
  FROM telemetry_lap_cache c JOIN telemetry_metadata m ON m.filename = c.filename
  WHERE c.cache_version = ? AND m.matched_replay_filename IS NOT NULL
  ORDER BY m.matched_replay_filename, c.lap_number
`).all(DUCKDB_TELEMETRY_CACHE_VERSION) as Array<{ filename: string; lap_number: number; telemetry_br: Buffer; replay: string }>;

const selectMetadata = db.prepare('SELECT metadata_br FROM replay_metadata WHERE filename = ?');
const selectLap = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?');

const offsets: number[] = [];
console.log('offset s | km/h err at 0 -> at offset | uncovered start/end s | replay lap');
for (const row of duckLaps) {
  const metaRow = selectMetadata.get(row.replay) as { metadata_br: Buffer } | undefined;
  const player = metaRow ? decompressJson<ReplayMetadata>(metaRow.metadata_br).drivers.find(d => d.isPlayer) : undefined;
  if (typeof player?.slot !== 'number') continue;
  const vcrRow = selectLap.get(row.replay, player.slot, row.lap_number) as { trajectory_br: Buffer } | undefined;
  if (!vcrRow) continue;
  const duckLap = decompressJson<DuckDbLapTelemetry>(row.telemetry_br);
  const vcrPoints = decompressTrajectory(vcrRow.trajectory_br).points;
  const base = vcrLapBaseTime(duckLap, vcrPoints);
  const check = checkDuckVcrClock(duckLap.points, vcrPoints.map(p => ({ ...p, timeSec: (p.timeSec ?? 0) - base })));
  if (!check) continue;
  offsets.push(check.offsetSec);
  console.log(
    `${check.offsetSec.toFixed(2).padStart(6)} | ${check.speedErrorKmhAtZero.toFixed(1).padStart(5)} -> ${check.speedErrorKmhAtOffset.toFixed(1).padStart(5)} | ` +
    `${check.uncoveredStartSec.toFixed(2)} / ${check.uncoveredEndSec.toFixed(2)} | ${row.replay} lap ${row.lap_number}`
  );
}

const sorted = [...offsets].sort((a, b) => a - b);
const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
console.log(`\n${offsets.length} laps; offset median ${pct(0.5)?.toFixed(2)} s, p10 ${pct(0.1)?.toFixed(2)}, p90 ${pct(0.9)?.toFixed(2)}, ` +
  `beyond one 100 Hz sample: ${offsets.filter(o => Math.abs(o) > 0.01).length}`);
