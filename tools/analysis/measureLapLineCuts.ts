/**
 * Read-only survey of the replay cache: for every stored lap of a recognised track, whether the
 * server can cut its start and its finish exactly at the start/finish line
 * (server/tracks/lapLineCut.ts), why not when it can't, and how often the projection on the
 * centreline steps backwards or jumps forwards. Nothing is written to the database.
 *
 * Usage (server stopped or running, the database is opened read-only):
 *   npx tsx tools/analysis/measureLapLineCuts.ts [path/to/lmu_cache.db]
 *
 * Every lap row is decompressed, so the work is split over child processes (one per CPU, less two).
 */
import os from 'os';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { LapEndCut, ReplayMetadata, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { decompressTrajectory } from '../../server/core/replay/replayTrajectoryCodec.js';
import { decompressJson } from '../../server/core/dbSchema.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { getTrackDefinition } from '../../server/tracks/serverTrackSync.js';
import { projectTrajectoryToCenterline } from '../../server/tracks/trackProjection.js';
import { cutLapAtLine } from '../../server/tracks/lapLineCut.js';
import { lapEdgesFromNeighbours } from '../../server/replay/replayLapPoints.js';
import { countStationGlitches } from '../../server/tracks/stationGlitches.js';

type EndStatus = 'cut' | `extrapolated (${string})` | `not on the line (${string})`;
type LapKind = 'flying' | 'out-lap' | 'pit' | 'first of recording' | 'last of recording';

interface Row { lap_key: number; file_mtime: number; file_size: number; trajectory_br: Buffer }

interface ShardResult {
  tally: Record<string, number>;
  glitchLaps: string[];
  uncutFlyingLaps: string[];
  lapsSeen: number;
  lapsUnknownLayout: number;
  lapsNoGeometry: number;
}

const dbPath = process.argv[2] ?? path.join(process.cwd(), 'server', 'lmu_cache.db');

function endStatus(neighbour: ReplayTrajectoryData | null, edge: ReplayTrajectoryPoint[], cut: LapEndCut): EndStatus {
  if (cut === 'line') return 'cut';
  const why = !neighbour ? 'no neighbour lap' : edge.length === 0 ? 'recording breaks at the edge' : 'no crossing near the edge';
  return cut === 'extrapolated' ? `extrapolated (${why})` : `not on the line (${why})`;
}

function lapKind(lap: ReplayTrajectoryData, lapKey: number, minKey: number, maxKey: number): LapKind {
  const summary = lap.laps?.find(l => l.lapNumber === lapKey);
  if (summary?.isOutlap) return 'out-lap';
  if (lap.points.some(p => p.inPit)) return 'pit';
  if (lapKey === minKey) return 'first of recording';
  if (lapKey === maxKey) return 'last of recording';
  return 'flying';
}

function measureShard(shard: number, shardCount: number): ShardResult {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const result: ShardResult = { tally: {}, glitchLaps: [], uncutFlyingLaps: [], lapsSeen: 0, lapsUnknownLayout: 0, lapsNoGeometry: 0 };
  const bump = (key: string) => { result.tally[key] = (result.tally[key] ?? 0) + 1; };

  const groups = (db.prepare(
    'SELECT DISTINCT filename, driver_slot FROM replay_trajectories WHERE driver_slot >= 0 AND lap_key >= 0 ORDER BY filename, driver_slot'
  ).all() as Array<{ filename: string; driver_slot: number }>).filter((_, g) => g % shardCount === shard);
  const selectMetadata = db.prepare('SELECT metadata_br FROM replay_metadata WHERE filename = ?');
  const selectGroup = db.prepare(
    'SELECT lap_key, file_mtime, file_size, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key >= 0 ORDER BY lap_key'
  );

  for (const group of groups) {
    const metaRow = selectMetadata.get(group.filename) as { metadata_br: Buffer } | undefined;
    const meta = metaRow ? decompressJson<ReplayMetadata>(metaRow.metadata_br) : undefined;
    const spec = getCircuitSpecification(meta?.trackVenue, meta?.trackCourse, meta?.sceneDesc, group.filename, null, null);
    const rows = selectGroup.all(group.filename, group.driver_slot) as Row[];
    if (spec.layoutKey === 'unknown') { result.lapsUnknownLayout += rows.length; continue; }
    const trackDef = getTrackDefinition(spec.layoutKey);
    if (!trackDef) { result.lapsNoGeometry += rows.length; continue; }

    const laps = rows.map(row => decompressTrajectory(row.trajectory_br));
    const minKey = rows[0].lap_key;
    const maxKey = rows[rows.length - 1].lap_key;
    const neighbourOf = (k: number, key: number): ReplayTrajectoryData | null => {
      const j = rows.findIndex(r => r.lap_key === key);
      return j >= 0 && rows[j].file_mtime === rows[k].file_mtime && rows[j].file_size === rows[k].file_size ? laps[j] : null;
    };

    for (const [k, lap] of laps.entries()) {
      if (lap.points.length < 2) continue;
      result.lapsSeen++;
      const key = rows[k].lap_key;
      const previous = neighbourOf(k, key - 1);
      const next = neighbourOf(k, key + 1);
      const { leadIn, leadOut } = lapEdgesFromNeighbours(lap.points, previous?.points, next?.points);
      const samples = [...leadIn, ...lap.points, ...leadOut];
      const { stations, lateralOffsets } = projectTrajectoryToCenterline(samples, trackDef.spatialIndex, { clampSeam: false });
      const cut = cutLapAtLine(samples, stations, lateralOffsets, trackDef.spatialIndex.totalLengthM, leadIn.length, leadIn.length + lap.points.length - 1);

      const kind = lapKind(lap, key, minKey, maxKey);
      const start = endStatus(previous, leadIn, cut.start);
      const finish = endStatus(next, leadOut, cut.end);
      bump(`start  | ${kind} | ${start}`);
      bump(`finish | ${kind} | ${finish}`);
      const where = `${group.filename} slot ${group.driver_slot} lap ${key}`;
      if (kind === 'flying' && (start !== 'cut' || finish !== 'cut')) {
        result.uncutFlyingLaps.push(`${where}: start ${start}, finish ${finish}, first station ${cut.points[0].stationM} m`);
      }

      const glitches = countStationGlitches(cut.points, trackDef.spatialIndex.totalLengthM);
      const onTrack = glitches.backwardSteps + glitches.forwardJumps;
      if (glitches.offCircuit > 0) bump(`glitch | ${kind} | off the circuit (${onTrack > 0 ? 'and on track' : 'only'})`);
      if (onTrack > 0) {
        const size = glitches.worstM < 5 ? 'worst < 5 m' : glitches.worstM < 20 ? 'worst 5-20 m' : glitches.worstM < 100 ? 'worst 20-100 m' : 'worst >= 100 m';
        bump(`glitch | ${kind} | ${size}`);
        if (kind === 'flying') result.glitchLaps.push(`${where} (${kind}): ${glitches.backwardSteps} back, ${glitches.forwardJumps} jumps, worst ${glitches.worstM.toFixed(0)} m`);
      }
    }
  }
  return result;
}

const shardArg = process.env.LAP_CUT_SHARD;
if (shardArg) {
  const [shard, count] = shardArg.split('/').map(Number);
  process.send?.(measureShard(shard, count));
} else {
  const shardCount = Math.max(1, os.cpus().length - 2);
  const scriptPath = fileURLToPath(import.meta.url);
  const results = await Promise.all(Array.from({ length: shardCount }, (_, shard) => new Promise<ShardResult>((resolve, reject) => {
    const child = fork(scriptPath, process.argv.slice(2), { env: { ...process.env, LAP_CUT_SHARD: `${shard}/${shardCount}` }, execArgv: process.execArgv });
    child.once('message', message => resolve(message as ShardResult));
    child.once('exit', code => (code === 0 ? undefined : reject(new Error(`shard ${shard} exited with ${code}`))));
  })));

  const tally = new Map<string, number>();
  for (const r of results) for (const [key, count] of Object.entries(r.tally)) tally.set(key, (tally.get(key) ?? 0) + count);
  const sum = (pick: (r: ShardResult) => number) => results.reduce((acc, r) => acc + pick(r), 0);
  const glitchLaps = results.flatMap(r => r.glitchLaps).sort();
  const uncutFlyingLaps = results.flatMap(r => r.uncutFlyingLaps).sort();

  console.log(`laps on recognised tracks: ${sum(r => r.lapsSeen)}; unknown layout: ${sum(r => r.lapsUnknownLayout)}; layout without geometry: ${sum(r => r.lapsNoGeometry)}\n`);
  for (const [key, count] of [...tally.entries()].sort()) console.log(`${String(count).padStart(6)}  ${key}`);
  console.log(`\nflying laps with an uncut end (first 40 of ${uncutFlyingLaps.length}):`);
  for (const line of uncutFlyingLaps.slice(0, 40)) console.log(`  ${line}`);
  console.log(`\nflying laps with on-track projection glitches (first 40 of ${glitchLaps.length}):`);
  for (const line of glitchLaps.slice(0, 40)) console.log(`  ${line}`);
}
