import fs from 'fs';
import { Router } from 'express';
import { folderPathProblem, normalizeFolderPath } from '../../shared/domain/folderPath.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';

const FOLDER_FIELDS = [
  { field: 'resultsDir', label: 'results folder' },
  { field: 'replaysDir', label: 'replays folder' },
  { field: 'telemetryDir', label: 'telemetry folder' },
] as const;
const MAX_PLAYER_NAME_LENGTH = 64;
const CONTROL_CHARS = /[\u0000-\u001f]/g;

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
      replaysCount: cacheStats.replaysCount,
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
    const sessionScanStarted = context.runSessionSyncInBackground();
    if (!sessionScanStarted && !hasConfig) {
      context.loadSessions(true);
    }
    const sessions = context.loadSessions();

    res.json({
      success: true,
      resultsDir: context.resultsDir,
      replaysDir: context.replaysDir,
      telemetryDir: context.telemetryDir,
      telemetryExist: fs.existsSync(context.telemetryDir),
      playerName: context.currentParser.configuredPlayerName,
      sessionsCount: sessions.length,
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
