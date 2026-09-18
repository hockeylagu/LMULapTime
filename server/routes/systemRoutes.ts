import fs from 'fs';
import { Router } from 'express';
import { computeTrackSummaries } from '../sessions/parser.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';

export function createSystemRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const resultsExist = fs.existsSync(context.resultsDir);
    const replaysExist = fs.existsSync(context.replaysDir);
    const telemetryExist = fs.existsSync(context.telemetryDir);
    const sessions = context.loadSessions();
    const refCache = loadReferenceLaptimesFromCache();
    const cacheStats = context.sessionDb.getCacheStats();

    res.json({
      resultsDir: context.resultsDir,
      resultsExist,
      replaysDir: context.replaysDir,
      replaysExist,
      telemetryDir: context.telemetryDir,
      telemetryExist,
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: sessions.length,
      tracksCount: Object.keys(computeTrackSummaries(sessions)).length,
      referenceLaptimes: {
        lastUpdated: refCache?.lastUpdated || null,
        entriesCount: refCache?.entriesCount || 0,
        lastUpdateDiff: refCache?.lastUpdateDiff || null,
      },
      sqliteCache: {
        enabled: cacheStats.enabled,
        dbPath: cacheStats.dbPath,
        sessionsCount: cacheStats.sessionsCount,
        lastSyncedAt: cacheStats.lastSyncedAt,
        dbSizeBytes: cacheStats.dbSizeBytes,
        replaysCount: cacheStats.replaysCount,
        replayTrajectoriesCount: cacheStats.replayTrajectoriesCount,
        telemetryFilesCount: cacheStats.telemetryFilesCount,
        telemetryCatalog: context.telemetryCatalog.getStatus(context.telemetryDir),
        ingestErrors: context.sessionDb.getIngestErrors(),
      },
    });
  });

  router.post('/cache/clear', (_req, res) => {
    try {
      context.sessionDb.clearCache();
      res.json({
        success: true,
        message: 'SQLite cache cleared successfully',
        sqliteCache: context.sessionDb.getCacheStats(),
        sessionsCount: 0,
      });
    } catch (error: unknown) {
      console.error('Failed to clear SQLite cache:', error);
      const message = error instanceof Error ? error.message : 'Failed to clear cache';
      res.status(500).json({ error: message });
    }
  });

  router.post('/scan', async (req, res) => {
    const { resultsDir, replaysDir, telemetryDir, playerName } = req.body;
    context.configureDirectories({ resultsDir, replaysDir, telemetryDir, playerName });
    const syncResult = context.sessionDb.syncSessionsFromDir(context.resultsDir, context.currentParser);
    context.telemetryCatalog.clear();
    const telemetryFilesScanned = await context.telemetryCatalog.refresh(context.telemetryDir);
    context.runReplaySyncInBackground();
    const sessions = context.loadSessions();

    res.json({
      success: true,
      resultsDir: context.resultsDir,
      replaysDir: context.replaysDir,
      telemetryDir: context.telemetryDir,
      telemetryExist: fs.existsSync(context.telemetryDir),
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: sessions.length,
      sync: syncResult,
      replayScanStarted: true,
      telemetryFilesScanned,
      sqliteCache: context.sessionDb.getCacheStats(),
    });
  });

  router.get('/scan/status', (_req, res) => {
    res.json(context.getScanStatus());
  });

  return router;
}
