import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { register } from 'tsx/esm/api';
register();
import { encodeColumns, encodeView, verifyCodec } from './codec.mjs';
import { canonicalDriverLaps, attachEdges, geometry, readyView, VIEWS } from './pipeline.mjs';
const { SessionDatabase } = await import('../../../server/core/db.ts');
const { extractReplayTrajectory } = await import('../../../server/replay/decode/replayTrajectory.ts');
const { storeDecodedReplayFacts } = await import('../../../server/core/replay/dbReplayLapStore.ts');
const { REPLAY_CACHE_VERSION, compressJson } = await import('../../../server/core/dbSchema.ts');
const { dataPlugin } = await import('../../../server/plugins/dataPlugin.ts');

const { mode, databasePath, config } = workerData;
verifyCodec();
if (fs.existsSync(databasePath)) throw Error('Refusing to overwrite a POC database');
if (dataPlugin.status.state !== 'ready') throw Error('Track package is required: run with .env.local');
const host = new SessionDatabase(databasePath);
const db = host.getDb();
const stat = fs.statSync(config.filePath), mtime = Math.floor(stat.mtimeMs);
host.upsertReplayMetadataCache(config.filename, config.filePath, mtime, stat.size, config.metadata);
if (mode !== 'baseline') db.exec(`
  CREATE TABLE poc_drivers(slot INTEGER PRIMARY KEY, shared BLOB NOT NULL);
  CREATE TABLE poc_samples(slot INTEGER,lap INTEGER,samples BLOB NOT NULL, PRIMARY KEY(slot,lap));
  CREATE TABLE poc_views(slot INTEGER,lap INTEGER,view TEXT,delta BLOB NOT NULL, PRIMARY KEY(slot,lap,view));
`);
const stages = { decodeMs: 0, canonicalMs: 0, prepareMs: 0, encodeMs: 0, writeMs: 0 };
let lapsCount = 0, pointsCount = 0, pendingWalPeak = 0;
const start = performance.now();
try {
  for (const slot of config.slots) {
    let mark = performance.now();
    const driver = extractReplayTrajectory(config.filePath, { driverSlot: slot, maxPoints: 0, allLaps: true, silent: true });
    stages.decodeMs += performance.now() - mark;
    const rawLaps = driver.allLapsData ?? [driver];
    lapsCount += rawLaps.length;
    pointsCount += rawLaps.reduce((sum, lap) => sum + lap.points.length, 0);
    if (mode === 'baseline') {
      mark = performance.now();
      host.replaceReplayDriverLaps(config.filename, config.filePath, mtime, stat.size, slot, driver, slot === config.slots[0]);
      stages.writeMs += performance.now() - mark; // Includes existing columnar conversion and compression.
    } else {
      mark = performance.now();
      const laps = canonicalDriverLaps(driver);
      stages.canonicalMs += performance.now() - mark;
      const insertSource = db.prepare('INSERT INTO poc_samples VALUES(?,?,?)');
      const insertView = db.prepare('INSERT INTO poc_views VALUES(?,?,?,?)');
      let sharedWritten = false;
      for (const lap of laps) {
        const previous = laps.find(candidate => candidate.currentLap === lap.currentLap - 1);
        const next = laps.find(candidate => candidate.currentLap === lap.currentLap + 1);
        mark = performance.now();
        const projected = mode === 'ready' ? geometry(attachEdges(lap, previous, next), config) : lap;
        const shared = { laps: projected.laps, pitEvents: projected.pitEvents, validation: projected.validation };
        stages.prepareMs += performance.now() - mark;
        const { laps: _laps, pitEvents: _pits, validation: _validation, ...sourceMetadata } = lap;
        const { points: _points, ...metadata } = sourceMetadata;
        mark = performance.now();
        const source = encodeColumns(lap.points, metadata);
        const sharedBlob = sharedWritten ? null : compressJson(shared);
        stages.encodeMs += performance.now() - mark;
        const views = [];
        if (mode === 'ready') for (const view of VIEWS) {
          mark = performance.now();
          const prepared = readyView(projected, view);
          const { laps: _summaries, pitEvents: _events, validation: _official, ...single } = prepared;
          stages.prepareMs += performance.now() - mark;
          mark = performance.now();
          views.push([slot, lap.currentLap, view, encodeView(lap.points, single)]);
          stages.encodeMs += performance.now() - mark;
        }
        mark = performance.now();
        db.transaction(() => {
          if (!sharedWritten) db.prepare('INSERT INTO poc_drivers VALUES(?,?)').run(slot, sharedBlob);
          insertSource.run(slot, lap.currentLap, source);
          for (const row of views) insertView.run(...row);
        })();
        sharedWritten = true;
        stages.writeMs += performance.now() - mark;
      }
      mark = performance.now();
      db.transaction(() => storeDecodedReplayFacts(db, config.filename, slot, driver, REPLAY_CACHE_VERSION))();
      stages.writeMs += performance.now() - mark;
    }
    const wal = `${databasePath}-wal`;
    pendingWalPeak = Math.max(pendingWalPeak, fs.existsSync(wal) ? fs.statSync(wal).size : 0);
    parentPort.postMessage({ progress: { mode, slot, lapsCount, elapsedMs: performance.now() - start } });
  }
  const usableMs = performance.now() - start;
  db.pragma('wal_checkpoint(TRUNCATE)');
  const tableSizes = db.prepare('SELECT name,SUM(pgsize) bytes FROM dbstat GROUP BY name ORDER BY bytes DESC').all();
  const payloadBytes = mode === 'baseline'
    ? db.prepare('SELECT SUM(length(trajectory_br)) bytes FROM replay_trajectories').get().bytes
    : db.prepare('SELECT SUM(length(samples)) bytes FROM poc_samples').get().bytes;
  const viewBytes = mode === 'ready' ? db.prepare('SELECT SUM(length(delta)) bytes FROM poc_views').get().bytes : 0;
  const result = { mode, usableMs, stages, lapsCount, pointsCount, payloadBytes, viewBytes, tableSizes,
    databaseBytes: fs.statSync(databasePath).size, walAtDriverBoundariesPeakBytes: pendingWalPeak,
    peakRssMiB: process.resourceUsage().maxRSS / 1024, integrity: db.pragma('integrity_check', { simple: true }) };
  host.close();
  parentPort.postMessage({ result });
} catch (error) {
  host.close(); throw error;
}
