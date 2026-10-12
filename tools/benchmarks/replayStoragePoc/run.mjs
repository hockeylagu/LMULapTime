import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import Database from 'better-sqlite3';
import { register } from 'tsx/esm/api';
register();
import { baselineRead, proposedRead, retainedSource, geometry, readyView, attachEdges, recut, shiftedGeometry, VIEWS } from './pipeline.mjs';
import { verifyCodec } from './codec.mjs';
const { getStoredReplayMetadata } = await import('../../../server/core/replay/dbReplayMetadataStore.ts');
const { getStoredReplayTrajectory, getAdjacentLapTrajectories } = await import('../../../server/core/replay/dbReplayTrajectoryStore.ts');
const { readReplaySessionContext } = await import('../../../server/core/sessionRows/replayContext.ts');
const { getCircuitSpecification } = await import('../../../shared/domain/circuitSpecs.ts');
const { getTrackDefinition } = await import('../../../server/tracks/serverTrackSync.ts');

const args = process.argv.slice(2);
const value = (flag, fallback) => { const index = args.indexOf(flag); return index < 0 ? fallback : args[index + 1]; };
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.resolve(root, value('--out', `.tmp/replay-storage-poc-${Date.now()}`));
const sourcePath = path.resolve(root, value('--source', '.tmp/vcr-deep/rolling-control.db'));
const appPath = path.resolve(root, value('--app-db', 'server/lmu_cache.db'));
const driverCount = Number(value('--drivers', '3')), repeats = Number(value('--repeats', '3'));
const samples = Number(value('--read-samples', '12'));
fs.mkdirSync(output, { recursive: true });
verifyCodec();
const source = new Database(sourcePath, { readonly: true });
const filename = source.prepare('SELECT filename FROM replay_metadata LIMIT 1').get().filename;
const metadata = getStoredReplayMetadata(source, filename);
const slots = source.prepare('SELECT DISTINCT driver_slot FROM replay_trajectories WHERE driver_slot>=0 ORDER BY driver_slot=45 DESC,driver_slot').all().map(row => row.driver_slot).slice(0, driverCount);
source.close();
const app = new Database(appPath, { readonly: true });
const owner = app.prepare('SELECT session_id FROM session_recordings WHERE recording_name=? LIMIT 1').get(filename);
const session = owner ? readReplaySessionContext(app, owner.session_id, 'all') : null;
app.close();
const config = { filename, filePath: metadata.filePath, metadata, slots, session,
  venue: session?.trackVenue ?? metadata.trackVenue, course: session?.trackCourse ?? metadata.trackCourse,
  sceneDesc: metadata.sceneDesc, trackLength: session?.trackLengthMeters };
const specification = getCircuitSpecification(config.venue, config.course, config.sceneDesc, filename, null, config.trackLength);
assert(getTrackDefinition(specification.layoutKey), 'Real detailed geometry must be loaded');
fs.writeFileSync(path.join(output, 'cohort.json'), JSON.stringify({ filename, slots, sessionId: session?.id, layout: specification.layoutKey, driverCount, repeats, samples }, null, 2));
console.log(JSON.stringify({ output, filename, slots, sessionId: session?.id, layout: specification.layoutKey }));

async function ingest(mode, run) {
  const databasePath = path.join(output, `${mode}-${run}.db`);
  const delays = []; let last = performance.now();
  const timer = setInterval(() => { const now = performance.now(); delays.push(Math.max(0, now - last - 10)); last = now; }, 10);
  let worker;
  try {
    const result = await new Promise((resolve, reject) => {
      worker = new Worker(new URL('./ingest.mjs', import.meta.url), { workerData: { mode, databasePath, config } });
      worker.on('message', message => {
        if (message.progress) console.log(JSON.stringify({ run, ...message.progress }));
        if (message.result) resolve(message.result);
      });
      worker.on('error', reject);
      worker.on('exit', code => { if (code !== 0) reject(Error(`Worker exited ${code}`)); });
    });
    return { ...result, run, databasePath, mainMaxDelayMs: Math.max(0, ...delays) };
  } finally { clearInterval(timer); if (worker) await worker.terminate(); }
}

const ingests = args.includes('--reuse') ? JSON.parse(fs.readFileSync(path.join(output, 'ingests.json'), 'utf8')) : [];
for (let run = 0; run < (args.includes('--reuse') ? 0 : repeats); run++) {
  const order = run % 2 === 0 ? ['baseline', 'binary', 'ready'] : ['ready', 'binary', 'baseline'];
  for (const mode of order) {
    ingests.push(await ingest(mode, run));
    fs.writeFileSync(path.join(output, 'ingests.json'), JSON.stringify(ingests, null, 2));
  }
}
const databases = Object.fromEntries(['baseline', 'binary', 'ready'].map(mode => [mode,
  new Database(ingests.find(result => result.mode === mode).databasePath, { readonly: true })]));
const median = numbers => { const sorted = [...numbers].sort((a, b) => a - b); const index = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2; };
const selectors = databases.baseline.prepare('SELECT driver_slot slot,lap_key lap FROM replay_trajectories WHERE lap_key>1 ORDER BY driver_slot,lap_key').all();
const cases = slots.map(slot => selectors.filter(row => row.slot === slot)[2]).filter(Boolean);
assert.equal(cases.length, slots.length);
function binaryRead(test, view) {
  const lap = retainedSource(databases.binary, test.slot, test.lap);
  const exists = lapNumber => databases.binary.prepare('SELECT 1 FROM poc_samples WHERE slot=? AND lap=?').get(test.slot, lapNumber);
  const previous = exists(test.lap - 1) ? retainedSource(databases.binary, test.slot, test.lap - 1) : null;
  const next = exists(test.lap + 1) ? retainedSource(databases.binary, test.slot, test.lap + 1) : null;
  return readyView(geometry(attachEdges(lap, previous, next), config), view);
}
const reads = [];
let parityCases = 0;
for (const test of cases) for (const view of VIEWS) {
  const methods = {
    baseline: () => baselineRead(databases.baseline, config, test.slot, test.lap, view),
    binary: () => binaryRead(test, view),
    ready: () => proposedRead(databases.ready, test.slot, test.lap, view),
  };
  // JSON normalization matches the transport contract (omitted undefined / signed zero).
  const expected = JSON.parse(JSON.stringify(methods.baseline()));
  for (const mode of ['binary', 'ready']) assert(isDeepStrictEqual(JSON.parse(JSON.stringify(methods[mode]())), expected), `${mode} parity ${test.slot}/${test.lap}/${view}`);
  parityCases += 2;
  const measurements = Object.fromEntries(Object.keys(methods).map(mode => [mode, []]));
  for (let run = 0; run < samples; run++) for (const mode of run % 2 === 0 ? Object.keys(methods) : Object.keys(methods).reverse()) {
    const started = performance.now();
    const response = methods[mode]();
    const preparedMs = performance.now() - started;
    const wire = JSON.stringify(response);
    measurements[mode].push({ preparedMs, serializedMs: performance.now() - started, wireBytes: Buffer.byteLength(wire), points: response.points.length });
  }
  for (const [mode, measurementsOfMode] of Object.entries(measurements)) reads.push({ ...test, view, mode,
    medianPreparedMs: median(measurementsOfMode.map(row => row.preparedMs)), medianSerializedMs: median(measurementsOfMode.map(row => row.serializedMs)),
    wireBytes: measurementsOfMode[0].wireBytes, points: measurementsOfMode[0].points });
  console.log(JSON.stringify({ read: test, view, ms: Object.fromEntries(reads.slice(-3).map(row => [row.mode, row.medianPreparedMs])) }));
}

// Validate every source sample and every prepared output, not just benchmarked laps.
let sourceParity = 0, viewParity = 0;
for (const test of databases.baseline.prepare('SELECT driver_slot slot,lap_key lap FROM replay_trajectories WHERE lap_key>0').all()) {
  const original = getStoredReplayTrajectory(databases.baseline, config.filename, test.slot, test.lap);
  const retained = retainedSource(databases.ready, test.slot, test.lap);
  // Existing JSON storage normalizes -0 to +0; the binary source preserves that extra precision.
  assert(isDeepStrictEqual(JSON.parse(JSON.stringify(retained.points)), JSON.parse(JSON.stringify(original.points))), `Retained sample mismatch ${test.slot}/${test.lap}`);
  sourceParity++;
  const { previous, next } = getAdjacentLapTrajectories(databases.baseline, config.filename, test.slot, test.lap);
  const projected = geometry(attachEdges(original, previous, next), config);
  for (const view of VIEWS) {
    assert(isDeepStrictEqual(JSON.parse(JSON.stringify(proposedRead(databases.ready, test.slot, test.lap, view))),
      JSON.parse(JSON.stringify(readyView(projected, view)))), `All-view mismatch ${test.slot}/${test.lap}/${view}`);
    viewParity++;
  }
}
const definition = shiftedGeometry(config);
const rebuilds = [];
for (const test of cases) {
  const original = getStoredReplayTrajectory(databases.baseline, config.filename, test.slot, test.lap);
  const neighbors = getAdjacentLapTrajectories(databases.baseline, config.filename, test.slot, test.lap);
  const expected = recut(original, neighbors.previous, neighbors.next, definition);
  const started = performance.now();
  const rebuilt = recut(retainedSource(databases.ready, test.slot, test.lap),
    retainedSource(databases.ready, test.slot, test.lap - 1), retainedSource(databases.ready, test.slot, test.lap + 1), definition);
  const ms = performance.now() - started;
  assert(isDeepStrictEqual(JSON.parse(JSON.stringify(rebuilt.points)), JSON.parse(JSON.stringify(expected.points))), 'Rebuilt points must match canonical correction');
  const previousRevision = proposedRead(databases.ready, test.slot, test.lap, 'full');
  const changed = rebuilt.points[0]?.timeSec !== previousRevision.points[0]?.timeSec
    || rebuilt.points.at(-1)?.timeSec !== previousRevision.points.at(-1)?.timeSec;
  assert(changed, 'Synthetic station-origin correction must actually change a cut endpoint');
  rebuilds.push({ ...test, ms, oldStart: previousRevision.points[0]?.timeSec, newStart: rebuilt.points[0]?.timeSec,
    oldEnd: previousRevision.points.at(-1)?.timeSec, newEnd: rebuilt.points.at(-1)?.timeSec, lineCut: rebuilt.lineCut });
}
for (const db of Object.values(databases)) db.close();
const summary = ['baseline', 'binary', 'ready'].map(mode => {
  const rows = ingests.filter(row => row.mode === mode);
  return { mode, medianUsableMs: median(rows.map(row => row.usableMs)), medianDecodeMs: median(rows.map(row => row.stages.decodeMs)),
    medianStorageAndPreparationMs: median(rows.map(row => row.usableMs - row.stages.decodeMs)),
    databaseBytes: rows[0].databaseBytes, payloadBytes: rows[0].payloadBytes, viewBytes: rows[0].viewBytes,
    peakRssMiB: Math.max(...rows.map(row => row.peakRssMiB)), mainMaxDelayMs: Math.max(...rows.map(row => row.mainMaxDelayMs)),
    laps: rows[0].lapsCount, points: rows[0].pointsCount };
});
const result = { cohort: { filename, slots, layout: specification.layoutKey, sessionId: session?.id },
  summary, reads, validation: { parityCases, sourceParity, viewParity, rebuilds }, ingests,
  limitations: ['Three per-driver source scans in every mode; this POC does not test the future one-scan importer.',
    'Native VCR only; no DuckDB fusion, HTTP server, UI rendering or physical disk-cold cache measurements.',
    'Prepared views cover full/2m/4m/400 points, not arbitrary API resolutions.',
    'RSS is a process-wide cumulative high-water mark across workers, not an isolated per-candidate memory comparison.',
    'WAL sampled at driver boundaries, not a precise peak; full production migration/publication is not implemented.'] };
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ summary, validation: result.validation, resultPath: path.join(output, 'result.json') }, null, 2));
