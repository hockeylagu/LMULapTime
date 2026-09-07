/**
 * Verifies the corner-detection heuristic in src/utils/replayComparison.ts against a REAL
 * lap with a known ground-truth corner count (e.g. Portimao/Algarve International Circuit =
 * 15, Daytona International Speedway Road Course = 12).
 *
 * Accepts two input formats:
 *  - .jsonl: raw shared-memory "tel" records (see tools/telemetry-recorder), carrying real
 *    speed/steer/throttle/brake/x/z at ~100 Hz.
 *  - .Vcr: a real game replay file, parsed via server/replayParser.ts's extractReplayTrajectory
 *    (full resolution, best lap by default).
 *
 * Usage
 *   npx tsx tools/analysis/verifyCornerDetection.ts <file.jsonl|file.Vcr> [--expected 15] [--prominence 7]
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { computeCumulativeDistances, interpolatePointAtDistance } from '../../src/utils/replayComparison.js';
import { computeLapSegmentComparisons } from '../../src/utils/cornerAnalysis.js';
import { extractReplayTrajectory } from '../../server/replayParser.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';

interface TelRecord {
  t: string;
  et: number;
  lap?: number;
  speedKmh?: number;
  thr?: number;
  brk?: number;
  str?: number;
  x?: number;
  y?: number;
  z?: number;
}

async function loadTelemetry(filePath: string): Promise<TelRecord[]> {
  const records: TelRecord[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.t === 'tel') records.push(rec);
    } catch {
      // ignore malformed lines
    }
  }
  return records;
}

function pickLongestCompleteLap(records: TelRecord[]): TelRecord[] {
  const byLap = new Map<number, TelRecord[]>();
  for (const r of records) {
    if (r.lap === undefined) continue;
    if (!byLap.has(r.lap)) byLap.set(r.lap, []);
    byLap.get(r.lap)!.push(r);
  }
  // Drop lap 0 (usually an out-lap from the recorder starting mid-session) and pick the
  // longest remaining lap by sample count as the most likely complete flying lap.
  let best: TelRecord[] = [];
  for (const [lapNum, recs] of byLap) {
    if (lapNum === 0) continue;
    if (recs.length > best.length) best = recs;
  }
  return best.length > 0 ? best : [...byLap.values()][0] || [];
}

function toTrajectoryPoints(records: TelRecord[]): ReplayTrajectoryPoint[] {
  return records.map(r => ({
    x: r.x ?? 0,
    y: r.y ?? 0,
    z: r.z ?? 0,
    rotY: 0,
    speedKmh: r.speedKmh ?? 0,
    throttle: (r.thr ?? 0) * 100,
    brake: (r.brk ?? 0) * 100,
    steerYaw: r.str ?? 0,
    timeSec: r.et,
  }));
}

async function loadPointsFromJsonl(filePath: string): Promise<ReplayTrajectoryPoint[]> {
  const records = await loadTelemetry(filePath);
  const lapRecords = pickLongestCompleteLap(records);
  console.log(`Loaded ${records.length} telemetry samples, using lap with ${lapRecords.length} samples.`);
  return toTrajectoryPoints(lapRecords);
}

function loadPointsFromVcr(filePath: string): ReplayTrajectoryPoint[] {
  const data = extractReplayTrajectory(filePath, { maxPoints: 0 });
  console.log(`Loaded replay "${data.replayName}", using lap ${data.currentLap} with ${data.points.length} samples.`);
  return data.points;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const expectedIdx = args.indexOf('--expected');
  const prominenceIdx = args.indexOf('--prominence');
  const expected = expectedIdx >= 0 ? parseInt(args[expectedIdx + 1], 10) : null;
  const prominence = prominenceIdx >= 0 ? parseFloat(args[prominenceIdx + 1]) : undefined;

  if (!filePath) {
    console.error('Usage: npx tsx tools/analysis/verifyCornerDetection.ts <file.jsonl|file.Vcr> [--expected 15] [--prominence 7]');
    process.exit(1);
  }

  const points = path.extname(filePath).toLowerCase() === '.vcr'
    ? loadPointsFromVcr(filePath)
    : await loadPointsFromJsonl(filePath);

  if (args.includes('--dump')) {
    const dists = computeCumulativeDistances(points);
    const stepIdx = args.indexOf('--dumpStep');
    const rangeIdx = args.indexOf('--dumpRange');
    const stepM = stepIdx >= 0 ? parseFloat(args[stepIdx + 1]) : 50;
    const total = dists[dists.length - 1] || 0;
    const [fromM, toM] = rangeIdx >= 0 ? args[rangeIdx + 1].split('-').map(Number) : [0, total];
    console.log('\ndistM, speedKmh, steerYaw, rotY');
    for (let d = fromM; d <= toM; d += stepM) {
      const p = interpolatePointAtDistance(points, dists, d);
      const rotY = points[Math.min(points.length - 1, Math.round((d / total) * (points.length - 1)))].rotY;
      console.log(`${Math.round(d)}, ${Math.round(p.speedKmh)}, ${p.steerYaw.toFixed(1)}, ${(rotY ?? 0).toFixed(3)}`);
    }
    return;
  }

  const segments = prominence !== undefined
    ? computeLapSegmentComparisons(points, points, prominence)
    : computeLapSegmentComparisons(points, points);
  const corners = segments.filter(s => s.type === 'corner');

  console.log(`\nDetected ${corners.length} corner(s):`);
  for (const c of corners) {
    if (c.type !== 'corner') continue;
    console.log(
      `  T${c.cornerNumber}: entry@${c.entryDistM}m -> min@${c.minDistM}m (${c.primaryMinSpeedKmh} km/h) -> exit@${c.exitDistM}m (${c.primaryExitSpeedKmh} km/h)`
    );
  }

  if (args.includes('--straights')) {
    const straights = segments.filter(s => s.type === 'straight');
    console.log(`\n${straights.length} straight(s):`);
    for (const s of straights) {
      if (s.type !== 'straight') continue;
      console.log(`  ${s.entryDistM}m -> ${s.exitDistM}m: top ${s.primaryTopSpeedKmh} km/h, exit ${s.primaryExitSpeedKmh} km/h`);
    }
  }

  if (expected !== null) {
    const diff = corners.length - expected;
    const verdict = diff === 0 ? 'MATCH' : Math.abs(diff) <= 2 ? 'CLOSE' : 'MISMATCH';
    console.log(`\nExpected ${expected} corners, detected ${corners.length} (${diff >= 0 ? '+' : ''}${diff}) -> ${verdict}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
