import fs from 'fs';
import { Router } from 'express';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
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
      tracksCount: new Set(sessions.map((s) => getDisplayTrackName(s.trackVenue, s.trackCourse)).filter(Boolean)).size,
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
    if (context.hasActiveFileScan()) {
      return res.status(409).json({ error: 'A file scan is already running. Wait for it to finish before clearing the cache.' });
    }
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

  router.post('/scan', (req, res) => {
    const { resultsDir, replaysDir, telemetryDir, playerName } = req.body;
    if (!context.configureDirectories({ resultsDir, replaysDir, telemetryDir, playerName })) {
      return res.status(409).json({ error: 'A file scan is already running. Wait for it to finish before changing directories.' });
    }
    context.telemetryCatalog.clear();
    void context.telemetryCatalog.refresh(context.telemetryDir)
      .catch((error: unknown) => {
        console.warn('[SQLite Cache] Telemetry scan warning:', error);
      });
    const sessionScanStarted = context.runSessionSyncInBackground();
    const sessions = context.loadSessions();

    res.json({
      success: true,
      resultsDir: context.resultsDir,
      replaysDir: context.replaysDir,
      telemetryDir: context.telemetryDir,
      telemetryExist: fs.existsSync(context.telemetryDir),
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: sessions.length,
      sessionScanStarted,
      replayScanStarted: true,
      telemetryScanStarted: true,
      telemetryFilesScanned: null,
      sqliteCache: context.sessionDb.getCacheStats(),
    });
  });

  router.get('/scan/status', (_req, res) => {
    res.json(context.getScanStatus());
  });

  return router;
}
