/**
 * Spot-checks lmu_cache.db to confirm steering data format in replay_trajectories and telemetry_lap_cache.
 *
 * Usage:
 *   npx tsx tools/analysis/spotCheckSteering.ts
 */
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { ReplayTrajectoryData, DuckDbLapTelemetry } from '../../server/core/types.js';

function decompressJson<T>(buf: Buffer): T {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')) as T;
}

function main() {
  const toolsDir = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = path.resolve(toolsDir, '../../server/lmu_cache.db');

  if (!fs.existsSync(dbPath)) {
    console.log(`Database file not found at ${dbPath}`);
    return;
  }

  const db = new Database(dbPath, { readonly: true });

  console.log('=== 1. Checking Version Breakdown ===');
  const vMeta = db.prepare("SELECT parser_version, COUNT(*) as count FROM replay_metadata GROUP BY parser_version").all();
  console.log('replay_metadata versions:', vMeta);

  const vTraj = db.prepare("SELECT parser_version, COUNT(*) as count FROM replay_trajectories GROUP BY parser_version").all();
  console.log('replay_trajectories versions:', vTraj);

  console.log('\n=== 2. Spot-Checking 10 Random Replay Trajectories ===');
  const sampleTrajs = db.prepare(
    "SELECT filename, driver_slot, lap_key, parser_version, trajectory_br FROM replay_trajectories ORDER BY RANDOM() LIMIT 10"
  ).all() as Array<{
    filename: string;
    driver_slot: number;
    lap_key: number;
    parser_version: string;
    trajectory_br: Buffer;
  }>;

  let totalPointsChecked = 0;
  let maxAbsSteerFound = 0;
  let rawRatioCount = 0;
  let unscaledDegCount = 0;

  for (const row of sampleTrajs) {
    const traj = decompressJson<ReplayTrajectoryData>(row.trajectory_br);
    let sampleMax = 0;
    for (const p of traj.points) {
      if (typeof p.steerYaw === 'number') {
        const abs = Math.abs(p.steerYaw);
        sampleMax = Math.max(sampleMax, abs);
        maxAbsSteerFound = Math.max(maxAbsSteerFound, abs);
        totalPointsChecked++;
        if (abs <= 1.01) rawRatioCount++;
        else unscaledDegCount++;
      }
    }
    console.log(`- ${row.filename} (slot ${row.driver_slot}, lap ${row.lap_key}) [${row.parser_version}]: ${traj.points.length} pts, maxAbsSteerYaw = ${sampleMax.toFixed(4)}`);
  }

  console.log('\n=== 3. Spot-Checking Telemetry Lap Cache ===');
  const sampleTel = db.prepare(
    "SELECT filename, lap_number, telemetry_br FROM telemetry_lap_cache LIMIT 5"
  ).all() as Array<{
    filename: string;
    lap_number: number;
    telemetry_br: Buffer;
  }>;

  for (const row of sampleTel) {
    const lapData = decompressJson<DuckDbLapTelemetry>(row.telemetry_br);
    let sampleMax = 0;
    for (const p of lapData.points) {
      if (typeof p.steerYaw === 'number') {
        sampleMax = Math.max(sampleMax, Math.abs(p.steerYaw));
      }
    }
    console.log(`- ${row.filename} (lap ${row.lap_number}): ${lapData.points.length} pts, maxAbsSteerYaw = ${sampleMax.toFixed(4)}`);
  }

  console.log('\n=== Summary ===');
  console.log(`Total sample points checked: ${totalPointsChecked}`);
  console.log(`Points in raw ratio range [-1.0, 1.0]: ${rawRatioCount} (${((rawRatioCount / Math.max(1, totalPointsChecked)) * 100).toFixed(1)}%)`);
  console.log(`Points in old degree range (> 1.01): ${unscaledDegCount}`);
  console.log(`Maximum absolute steerYaw found across samples: ${maxAbsSteerFound.toFixed(4)}`);

  db.close();
}

main();
