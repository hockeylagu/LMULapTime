import express from 'express';
import cors from 'cors';
import path from 'path';
import { LmuParser } from './sessions/parser.js';
import { fetchAndCacheReferenceLaptimes, isReferenceLaptimesCacheFresh, loadReferenceLaptimesFromCache } from './benchmarks/referenceLaptimes.js';
import { getSessionDatabase } from './core/db.js';
import { TelemetryCatalog } from './telemetry/telemetryCatalog.js';
import { ReplayCacheService } from './replay/replayCacheService.js';
import { ServerContext } from './core/serverContext.js';
import { createAiRouter } from './routes/aiRoutes.js';
import { createReferenceRouter } from './routes/referenceRoutes.js';
import { createReplayRouter } from './routes/replayRoutes.js';
import { createSessionRouter } from './routes/sessionRoutes.js';
import { createSystemRouter } from './routes/systemRoutes.js';

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigin = process.env.LMU_UI_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === allowedOrigin) }));
app.use(express.json());

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
const replayCache = new ReplayCacheService(sessionDb);
const serverContext = new ServerContext({
  resultsDir: defaultResultsDir,
  replaysDir: defaultReplaysDir,
  telemetryDir: defaultTelemetryDir,
  parser: new LmuParser(defaultReplaysDir),
  sessionDb,
  telemetryCatalog,
  replayCache,
});

const startTelemetryCatalogRefresh = (): void => {
  void telemetryCatalog.refresh(serverContext.telemetryDir).then((count) => {
    console.log(`[SQLite Cache] Found ${count} DuckDB telemetry files from ${serverContext.telemetryDir}`);
    try {
      serverContext.enrichSessionsWithTelemetry(sessionDb.getAllSessions());
    } catch (err) {
      console.warn('[SQLite Cache] Error enriching sessions after telemetry refresh:', err);
    }
  }).catch((error: unknown) => {
    sessionDb.recordIngestError('duckdb-directory', serverContext.telemetryDir, error);
    console.warn('[SQLite Cache] Initial telemetry sync warning:', error);
  });
};

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

serverContext.runInitialSessionSyncInBackground();
setImmediate(startTelemetryCatalogRefresh);

app.use('/api/ai', createAiRouter(sessionDb));
app.use('/api', createSystemRouter(serverContext));
app.use('/api', createReferenceRouter(serverContext));
app.use('/api', createSessionRouter(serverContext));
app.use('/api', createReplayRouter(serverContext));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
    startReferenceLaptimeRefresh();
  });
}

const loadSessions = (forceRefresh = false, forceReparse = false) =>
  serverContext.loadSessions(forceRefresh, forceReparse);

export { app, loadSessions, sessionDb };
