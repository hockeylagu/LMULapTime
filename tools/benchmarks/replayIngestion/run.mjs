import { register } from 'tsx/esm/api';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

register();
const { SessionDatabase } = await import('../../../server/core/db.ts');
const { parseReplayMetadata } = await import('../../../server/replay/decode/replayParser.ts');
const { extractReplayTrajectoryInWorker, storeReplayTrajectoryInWorker, storeReplayDriversInWorker } =
  await import('../../../server/replay/worker/replayTrajectoryWorkerClient.ts');

const [mode, source, output, countText, playerName] = process.argv.slice(2);
if (!['raw', 'direct', 'once'].includes(mode) || !source || !output) {
  throw new Error('Usage: node tools/benchmarks/replayIngestion/run.mjs <raw|direct|once> <VCR path> <new output prefix> [driver count] [player name]');
}
const filePath = path.resolve(source);
const prefix = path.resolve(output);
const databasePath = `${prefix}.db`;
for (const suffix of ['.db', '.db-wal', '.db-shm', '.json']) {
  if (fs.existsSync(`${prefix}${suffix}`)) throw new Error(`Output exists: ${prefix}${suffix}`);
}
const metadata = parseReplayMetadata(filePath, { playerName });
const players = metadata.drivers.filter(driver => driver.isPlayer && typeof driver.slot === 'number');
if (players.length !== 1) throw new Error('A unique player is required; supply the player name as the last argument.');
const primarySlot = players[0].slot;
const allSlots = [primarySlot, ...metadata.drivers.filter(driver => driver.slot !== primarySlot)
  .flatMap(driver => typeof driver.slot === 'number' ? [driver.slot] : [])];
const count = countText === undefined ? allSlots.length : Number(countText);
if (!Number.isInteger(count) || count < 1 || count > allSlots.length) throw new Error('Invalid driver count.');
const slots = allSlots.slice(0, count);
const filename = path.basename(filePath);
const stat = fs.statSync(filePath);
const mtime = Math.floor(stat.mtimeMs), size = stat.size;
fs.mkdirSync(path.dirname(prefix), { recursive: true });
const db = new SessionDatabase(databasePath);
let timer;
let result;
try {
  db.upsertReplayMetadataCache(filename, filePath, mtime, size, metadata);
  const delays = [], phases = [], batches = [];
  let temporaryBytes = 0, firstDriverStoredMs;
  let last = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    delays.push(Math.max(0, now - last - 10));
    last = now;
  }, 10);
  const started = performance.now();
  for (const group of mode === 'once' ? [slots] : slots.map(slot => [slot])) {
    const slot = group[0], start = performance.now();
    const options = { driverSlot: slot, playerName, allLaps: true, maxPoints: 0 };
    const save = { filename, mtime, size, driverSlotKey: slot, isPrimary: slot === primarySlot };
    const extraction = mode === 'once'
      ? storeReplayDriversInWorker(db, filePath, { playerName }, { ...save, driverSlots: group, includePrimary: true, primarySlot })
      : mode === 'direct' ? storeReplayTrajectoryInWorker(db, filePath, options, save)
        : extractReplayTrajectoryInWorker(filePath, options);
    let step = await extraction.next();
    while (!step.done) {
      temporaryBytes = Math.max(temporaryBytes, step.value.temporaryBytes ?? 0);
      if (step.value.driverStored) firstDriverStoredMs ??= performance.now() - started;
      if (phases.at(-1)?.stage !== step.value.stage) phases.push({ stage: step.value.stage, ms: performance.now() - started });
      step = await extraction.next();
    }
    if (mode === 'once' && step.value.failures.length) throw new Error(JSON.stringify(step.value.failures));
    if (mode === 'raw') db.replaceReplayDriverLaps(filename, filePath, mtime, size, slot, step.value, save.isPrimary);
    firstDriverStoredMs ??= performance.now() - started;
    batches.push({ slot, ms: performance.now() - start });
    await new Promise(resolve => setImmediate(resolve));
  }
  const pipelineMs = performance.now() - started;
  clearInterval(timer);
  const rows = db.getDb().prepare('SELECT COUNT(*) laps, SUM(points_count) points, SUM(length(trajectory_br)) bytes FROM replay_trajectories').get();
  const integrity = db.getDb().pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`SQLite integrity check: ${integrity}`);
  delays.sort((a, b) => a - b);
  result = { mode, filePath, size, slots, pipelineMs, batches, rows, integrity, temporaryBytes, firstDriverStoredMs, phases,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    eventLoop: { samples: delays.length, p95DelayMs: delays[Math.floor(delays.length * 0.95)], maxDelayMs: delays.at(-1) } };
  db.getDb().pragma('wal_checkpoint(TRUNCATE)');
} finally {
  clearInterval(timer);
  db.close();
}
result.databaseBytes = fs.statSync(databasePath).size;
fs.writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
