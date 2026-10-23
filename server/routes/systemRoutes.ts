import fs from 'fs';
import { Router } from 'express';
import { folderPathProblem, normalizeFolderPath } from '../../shared/domain/folderPath.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';
import { dataPlugin } from '../plugins/dataPlugin.js';
import { readBrowserSettings, saveBrowserMonitor } from '../desktop/browserSettings.js';

const FOLDER_FIELDS = [
  { field: 'resultsDir', label: 'results folder' },
  { field: 'replaysDir', label: 'replays folder' },
  { field: 'telemetryDir', label: 'telemetry folder' },
] as const;
const MAX_PLAYER_NAME_LENGTH = 64;
const CONTROL_CHARS = /\p{Cc}/gu;

export function createSystemRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/desktop/browser', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await readBrowserSettings()); }
    catch { res.status(503).json({ error: 'Unable to read monitors. Rebuild the tray helper and try again.' }); }
  });

  router.post('/desktop/browser', async (req, res) => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null || !('monitor' in body) || typeof body.monitor !== 'string') {
      return res.status(400).json({ error: 'Send a monitor identifier or an empty string for browser default.' });
    }
    try {
      const settings = await readBrowserSettings();
      if (!settings.supported) return res.status(400).json({ error: 'Browser monitor settings require Windows.' });
      if (body.monitor !== '' && !settings.monitors.some(monitor => monitor.id === body.monitor)) {
        return res.status(400).json({ error: 'That monitor is no longer connected. Refresh Settings and choose another monitor.' });
      }
      await saveBrowserMonitor(body.monitor);
      return res.json({ ...settings, monitor: body.monitor });
    } catch { return res.status(503).json({ error: 'Unable to save the browser monitor. Rebuild the tray helper and try again.' }); }
  });

  router.get('/status', (_req, res) => {
    const resultsExist = fs.existsSync(context.resultsDir);
    const replaysExist = fs.existsSync(context.replaysDir);
    const telemetryExist = fs.existsSync(context.telemetryDir);
    const catalog = context.sessionDb.getSessionCatalogStats();
    const refCache = loadReferenceLaptimesFromCache();
    const cacheStats = context.sessionDb.getCacheStats();

    res.json({
      serverInstanceId: context.serverInstanceId,
      dataPlugin: { revision: dataPlugin.status.revision },
      resultsDir: context.resultsDir,
      resultsExist,
      replaysDir: context.replaysDir,
      replaysExist,
      telemetryDir: context.telemetryDir,
      telemetryExist,
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: catalog.sessionsCount,
      replaysCount: cacheStats.replaysCount,
      tracksCount: catalog.tracksCount,
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
        liveTelemetryFilesCount: cacheStats.liveTelemetryFilesCount,
        sessionSummariesReadyCount: catalog.summariesReadyCount,
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
    const body = (req.body || {}) as { resultsDir?: unknown; replaysDir?: unknown; telemetryDir?: unknown; playerName?: unknown };
    // Paths arrive as people paste them (quotes, forward slashes, a trailing backslash): normalize, then reject
    // what cannot be a folder, naming the field so the form can show the reason under it.
    for (const { field, label } of FOLDER_FIELDS) {
      const raw = body[field];
      if (raw === undefined || raw === null) continue;
      if (typeof raw !== 'string') return res.status(400).json({ error: `The ${label} must be text.`, field });
      const folder = normalizeFolderPath(raw);
      const problem = folderPathProblem(folder);
      if (problem) return res.status(400).json({ error: problem, field });
      body[field] = folder;
    }
    if (typeof body.playerName === 'string') {
      body.playerName = body.playerName.replace(CONTROL_CHARS, '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    }
    const hasConfig = Boolean(body.resultsDir || body.replaysDir || body.telemetryDir || body.playerName);
    if (hasConfig) {
      if (!context.configureDirectories(body)) {
        return res.status(409).json({ error: 'A file scan is already running. Wait for it to finish before changing directories.' });
      }
    }
    if (hasConfig) context.telemetryCatalog.clear();
    // A manual refresh: replays that failed every attempt are decoded once more.
    const sessionScanStarted = context.runSessionSyncInBackground(false, true);
    if (!sessionScanStarted && !hasConfig) context.requestSessionRefresh();
    const catalog = context.sessionDb.getSessionCatalogStats();

    res.json({
      success: true,
      resultsDir: context.resultsDir,
      replaysDir: context.replaysDir,
      telemetryDir: context.telemetryDir,
      telemetryExist: fs.existsSync(context.telemetryDir),
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: catalog.sessionsCount,
      sessionScanStarted: sessionScanStarted || !hasConfig,
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
