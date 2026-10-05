import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs';
import { LmuParser } from './sessions/parser.js';
import { fetchAndCacheReferenceLaptimes, isReferenceLaptimesCacheFresh, loadReferenceLaptimesFromCache } from './benchmarks/referenceLaptimes.js';
import { getSessionDatabase } from './core/db.js';
import { TelemetryCatalog } from './telemetry/telemetryCatalog.js';
import { ReplayCacheService } from './replay/replayCacheService.js';
import { ServerContext } from './core/serverContext.js';
import { createAiRouter } from './routes/aiRoutes.js';
import { createLeaderboardRouter } from './routes/leaderboardRoutes.js';
import { createReferenceRouter } from './routes/referenceRoutes.js';
import { createReplayRouter } from './routes/replayRoutes.js';
import { createSessionRouter } from './routes/sessionRoutes.js';
import { createSystemRouter } from './routes/systemRoutes.js';

import { createDataPluginRouter } from './routes/dataPluginRoutes.js';
import { dataPlugin, formatPluginStatusLog } from './plugins/dataPlugin.js';

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
const replayCache = new ReplayCacheService(sessionDb);
const serverContext = new ServerContext({
  resultsDir: defaultResultsDir,
  replaysDir: defaultReplaysDir,
  telemetryDir: defaultTelemetryDir,
  parser: new LmuParser(defaultReplaysDir, defaultResultsDir, { indexReplays: false, readReplayMetadata: false }),
  sessionDb,
  telemetryCatalog,
  replayCache,
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

serverContext.runInitialSessionSyncInBackground();

app.use('/api/ai', createAiRouter(sessionDb));
app.use('/api', createSystemRouter(serverContext));
app.use('/api', createReferenceRouter(serverContext));
app.use('/api', createSessionRouter(serverContext));
app.use('/api', createLeaderboardRouter(serverContext));
app.use('/api', createReplayRouter(serverContext));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
    console.log(formatPluginStatusLog(dataPlugin.status));
    startReferenceLaptimeRefresh();
  });
}

const loadSessions = (forceRefresh = false, forceReparse = false) =>
  serverContext.loadSessions(forceRefresh, forceReparse);

export { app, loadSessions, sessionDb };
