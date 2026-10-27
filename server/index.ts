import { CacheSyncLog } from './core/cacheSyncLog.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs';
import { LmuParser } from './sessions/parser.js';
import { fetchAndCacheReferenceLaptimes, isReferenceLaptimesCacheFresh, loadReferenceLaptimesFromCache } from './benchmarks/referenceLaptimes.js';
import { getSessionDatabase } from './core/db.js';
import { TelemetryCatalog } from './telemetry/telemetryCatalog.js';
import { ReplayRecordingService } from './replay/replayRecordingService.js';
import { ServerContext } from './core/serverContext.js';
import { createAiRouter } from './routes/aiRoutes.js';
import { createLeaderboardRouter } from './routes/leaderboardRoutes.js';
import { createLiveRouter } from './routes/liveRoutes.js';
import { createReferenceRouter } from './routes/referenceRoutes.js';
import { createReplayRouter } from './routes/replayRoutes.js';
import { createSessionRouter } from './routes/sessionRoutes.js';
import { createSystemRouter } from './routes/systemRoutes.js';

import { createDataPluginRouter } from './routes/dataPluginRoutes.js';
import { dataPlugin, formatPluginStatusLog } from './plugins/dataPlugin.js';
import { LiveService } from './live/liveService.js';
import { loadLiveSettings } from './live/liveSettings.js';
import { queryLivePersonalBest } from './core/sessionSummaries/contextQueries.js';
import { readPitLaneLoss, recordPitLaneLoss } from './core/live/dbPitLaneStore.js';
import { saveRacePlan } from './core/live/dbRacePlanStore.js';
import { readStrategyHistory } from './sessions/sessionStrategy.js';
import { readTyreWearProfile } from './sessions/sessionTyreWear.js';
import { LiveCaptureController } from './live/capture/controller.js';
import { LiveDiagnostics } from './live/capture/diagnostics.js';
import { getAvailableLiveCaptureCount, getLiveCaptureIndexRows, indexLiveCaptureCatalog, listLiveCaptureManifests, upsertLiveCapture } from './core/live/dbLiveCaptureStore.js';
import { reconcileLiveCaptures } from './live/capture/reconcile.js';
import { createLiveEvidenceRouter } from './routes/liveEvidenceRoutes.js';
import { refreshLiveLearning } from './live/learning/service.js';
import { AutomaticLearningRuntime } from './live/learning/runtime.js';
import { startSystemTray } from './desktop/systemTray.js';
import { PeripheralHost } from './peripherals/peripheralHost.js';
import { createPeripheralRouter } from './routes/peripherals/peripheralRoutes.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const allowedOrigin = process.env.LMU_UI_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === allowedOrigin) }));
app.use(express.json());

// Basic layout illustrations are bundled independently of optional metric data.
const outlineDir = fs.existsSync(path.resolve('dist/track-outlines')) ? path.resolve('dist/track-outlines') : path.resolve('public/track-outlines');
app.use('/track-outlines', express.static(outlineDir));
app.use('/api/data-plugin', createDataPluginRouter());

const defaultResultsDir = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), 'test', 'fixtures', 'results')
  : 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results';
const defaultReplaysDir = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), 'test', 'fixtures', 'replays')
  : 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
const defaultTelemetryDir = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), 'test', 'fixtures', 'telemetry')
  : 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Telemetry';

const sessionDb = getSessionDatabase();
const telemetryCatalog = new TelemetryCatalog(sessionDb);
const replayRecordings = new ReplayRecordingService(sessionDb);
const serverContext = new ServerContext({
  resultsDir: defaultResultsDir,
  replaysDir: defaultReplaysDir,
  telemetryDir: defaultTelemetryDir,
  parser: new LmuParser(defaultReplaysDir, defaultResultsDir, { indexReplays: false, readReplayMetadata: false }),
  sessionDb,
  telemetryCatalog,
  replayRecordings,
});

const startReferenceLaptimeRefresh = (): void => {
  serverContext.runReferenceLaptimeRefreshInBackground(async () => {
    const currentCache = loadReferenceLaptimesFromCache();
    const hasUsablePreviousEntries = !!currentCache && currentCache.entriesCount > 0;

    if (isReferenceLaptimesCacheFresh(currentCache)) {
      return { refreshed: false, diff: null };
    }

    console.log(currentCache ? 'Refreshing stale reference laptimes from Google Sheets...' : 'Initializing reference laptimes cache from Google Sheets...');
    const refreshedCache = await fetchAndCacheReferenceLaptimes();
    return {
      refreshed: true,
      diff: hasUsablePreviousEntries ? refreshedCache.lastUpdateDiff || null : null,
    };
  });
};

const captureDirectory = path.resolve(process.env.LMU_LIVE_CAPTURE_DIR || path.join('server', 'live-captures'));
const liveCaptureLog = new CacheSyncLog('live telemetry DuckDB files', captureDirectory);
const automaticLearning = new AutomaticLearningRuntime(process.env.LMU_LIVE_LEARNING !== '0');
const liveCapture = new LiveCaptureController({
  directory: captureDirectory,
  diagnostics: new LiveDiagnostics(captureDirectory, loadLiveSettings(sessionDb).diagnostics),
  existing: () => listLiveCaptureManifests(sessionDb.getDb()),
  onPersist: (manifest, bytes) => {
    if (upsertLiveCapture(sessionDb.getDb(), manifest, bytes)) {
      const message = liveCaptureLog.format({
        total: getAvailableLiveCaptureCount(sessionDb.getDb()), added: 1, updated: 0,
      });
      if (message) console.log(message);
    }
    if (manifest.status !== 'recording') void refreshLiveCaptureLinks();
  },
  onCatalog: (recordings, errors) => {
    const result = indexLiveCaptureCatalog(sessionDb.getDb(), recordings);
    const message = liveCaptureLog.format(result);
    if (message) console.log(message);
    for (const { manifest } of recordings) {
      sessionDb.clearIngestError('live-capture', path.join(captureDirectory, manifest.filename));
    }
    for (const entry of errors) sessionDb.recordIngestError('live-capture', path.join(captureDirectory, entry.filename), new Error(entry.error));
  },
});
let captureRefresh: Promise<void> | null = null;
async function refreshLiveCaptureLinks(discover = false): Promise<void> {
  if (liveService.isSessionLoaded()) return;
  if (captureRefresh) return captureRefresh;
  captureRefresh = (async () => {
    if (discover) await liveCapture.discover();
    if (liveService.isSessionLoaded()) return;
    const result = await reconcileLiveCaptures(sessionDb.getDb(), captureDirectory);
    if (result.changed) sessionDb.markSessionDataChanged();
    if (!liveCapture.hasOpenRecordingHandle) {
      await refreshLiveLearning(sessionDb.getDb(), captureDirectory, () => liveService.isSessionLoaded());
      // Learning is optional: its failure must never stop capture links below.
      await automaticLearning.refresh(sessionDb.getDb(), () => liveService.isSessionLoaded() || liveCapture.hasOpenRecordingHandle)
        .catch(error => sessionDb.recordIngestError('live-learning', captureDirectory, error));
    }
    if (liveService.isSessionLoaded()) return;
    liveCapture.synchronizeLinks(getLiveCaptureIndexRows(sessionDb.getDb())
      .filter(entry => entry.available).map(entry => entry.manifest));
  })().catch(error => {
    sessionDb.recordIngestError('live-capture-directory', captureDirectory, error);
  }).finally(() => { captureRefresh = null; });
  return captureRefresh;
}

const liveService = new LiveService({
  learning: automaticLearning,
  capture: liveCapture,
  reserveSeconds: loadLiveSettings(sessionDb).reserveSeconds,
  personalBest: (layoutKey, carClass) =>
    queryLivePersonalBest(sessionDb.getDb(), serverContext.currentParser.configuredPlayerName, layoutKey, carClass),
  pitLane: {
    read: (layoutKey, carClass) => readPitLaneLoss(sessionDb.getDb(), layoutKey, carClass),
    record: row => recordPitLaneLoss(sessionDb.getDb(), row),
  },
  racePlan: (recordingId, plan) => saveRacePlan(sessionDb.getDb(), recordingId, plan, Date.now()),
  raceHistory: (layoutKey, carClass) => readStrategyHistory(sessionDb, layoutKey, carClass),
  tyreWearProfile: (layoutKey, carModel, compound, driverName, signal) => readTyreWearProfile(sessionDb, layoutKey, carModel, compound, driverName, signal),
  deploymentKw: (carModel, carClass) => dataPlugin.deploymentKw({ carType: carModel, carClass }),
  tyreWearRevision: () => `${sessionDb.getSessionRevision()}:${sessionDb.getTelemetryMetadataRevision()}`,
});
liveService.events.on('session-loaded', loaded => serverContext.setLiveSessionLoaded(loaded));
liveService.events.on('session-loaded', loaded => { if (loaded) automaticLearning.cancel(); });
liveService.events.on('game-running', running => automaticLearning.gameRunning(running));
const peripheralHost = new PeripheralHost(sessionDb, liveService);
app.use('/api/peripherals', createPeripheralRouter(peripheralHost));

if (process.env.NODE_ENV === 'test') {
  serverContext.runInitialSessionSyncInBackground();
} else {
  // The first scan waits for the live reader's first answer: a server started mid-session must not read
  // the files LMU is still writing. A reader that never answers delays it 5 s at most.
  liveService.start();
  void peripheralHost.start();
  // Discover live files once the XML/replay/native telemetry discovery pass is complete.
  // The first reader answer only releases that pass; it must not start a second live catalog scan.
  serverContext.events.on('scan-finished', () => { void refreshLiveCaptureLinks(true); });
  process.once('exit', () => { void liveService.stop(); });
  const readerTimeout = new Promise<void>(resolve => { setTimeout(resolve, 5000).unref(); });
  void Promise.race([liveService.firstReading, readerTimeout]).then(() => serverContext.runInitialSessionSyncInBackground());
  const captureRefreshTimer = setInterval(() => { void refreshLiveCaptureLinks(); }, 30_000);
  captureRefreshTimer.unref();
}

app.use('/api/ai', createAiRouter(sessionDb));
app.use('/api', createSystemRouter(serverContext));
app.use('/api', createReferenceRouter(serverContext));
app.use('/api', createSessionRouter(serverContext));
app.use('/api', createLeaderboardRouter(serverContext));
app.use('/api', createReplayRouter(serverContext));
app.use('/api', createLiveRouter(serverContext, liveService, liveCapture));
app.use('/api', createLiveEvidenceRouter(serverContext, captureDirectory, undefined, () => liveCapture.hasOpenRecordingHandle));

if (process.env.NODE_ENV !== 'test') {
  let stopSystemTray: (() => void) | undefined;
  const server = app.listen(PORT, '127.0.0.1', () => {
    stopSystemTray = startSystemTray(() => shutdown(true));
    console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
    console.log(formatPluginStatusLog(dataPlugin.status));
    startReferenceLaptimeRefresh();
  });
  let shuttingDown = false;
  const shutdown = (exitDevelopment = false): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    peripheralHost.stop();
    stopSystemTray?.();
    server.close();
    automaticLearning.cancel();
    const finish = (code: number): void => {
      const exitFile = process.env.LMU_DEV_EXIT_FILE;
      if (exitDevelopment && exitFile) {
        try { fs.writeFileSync(exitFile, 'exit'); }
        catch (error) { console.error('Unable to stop the development watcher:', error); }
      }
      process.exit(code);
    };
    void liveService.stop().then(() => finish(0), error => {
      console.error('Unable to finish live capture during shutdown:', error);
      finish(1);
    });
  };
  server.once('close', () => stopSystemTray?.());
  process.once('SIGINT', () => shutdown());
  process.once('SIGTERM', () => shutdown());
}

export { app, sessionDb };
