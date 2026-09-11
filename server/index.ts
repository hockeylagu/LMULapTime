import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { LmuParser, computeProgression, computeTrackSummaries, extractComparableLaps } from './parser.js';
import { AiAnalyzeRequest, AiAnalyzeResponse, DetailedSession, ReplaySummary, DriverData, LapData, ReplayMetadata, ReplayDriverEntry, ReplayTrajectoryData, ReplayScanStatus } from './types.js';
import { parseReplayMetadata, extractReplayTrajectory, downsampleReplayTrajectory } from './replayParser.js';
import { loadReferenceLaptimesFromCache, fetchAndCacheReferenceLaptimes, normalizeTrackName } from './referenceLaptimes.js';
import { findMatchingTrackBenchmarkEntries, matchesTrack, matchesSessionCarClass } from '../src/utils/paceCategory.js';
import { matchesSessionType, isSessionEmpty, getDisplayTrackName } from '../src/utils/formatters.js';
import { getSessionDatabase } from './db.js';
import { AI_MODELS, analyzeLap, clearSessionApiKey, createAiReportRecord, getAiCacheKey, getAiSettings, setSessionApiKey, setSessionModel, toAiError } from './aiReport.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigin = process.env.LMU_UI_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === allowedOrigin) }));
app.use(express.json());

// Default LMU Paths
const DEFAULT_RESULTS_DIR = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), 'test', 'fixtures', 'results')
  : 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results';
const DEFAULT_REPLAYS_DIR = process.env.NODE_ENV === 'test'
  ? path.join(process.cwd(), 'test', 'fixtures', 'replays')
  : 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';

let currentResultsDir = DEFAULT_RESULTS_DIR;
let currentReplaysDir = DEFAULT_REPLAYS_DIR;

let parser = new LmuParser(currentReplaysDir);
const sessionDb = getSessionDatabase();

let replayScanStatus: ReplayScanStatus = {
  running: false,
  processed: 0,
  total: 0,
  currentFile: null,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
};

// Runs the (potentially very slow) replay directory sync off the request/startup path,
// tracking per-file progress in `replayScanStatus` so the UI can poll and render it.
// Drives the iterator one step per `setImmediate` tick (rather than calling the blocking
// syncReplaysFromDir) so the event loop gets to service other HTTP requests between every
// file - and every per-driver extraction within a file - instead of the server going
// unresponsive for the whole scan.
// Ignores overlapping calls instead of queueing them, since a rescan mid-scan would just
// re-walk files the running scan hasn't reached yet.
function runReplaySyncInBackground(replaysDir: string, playerName?: string): void {
  if (replayScanStatus.running) return;
  replayScanStatus = {
    running: true,
    processed: 0,
    total: 0,
    currentFile: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  };

  const iterator = sessionDb.syncReplaysIterator(replaysDir, { playerName });

  const step = () => {
    try {
      const { value, done } = iterator.next();
      if (done) {
        replayScanStatus.result = value;
        console.log(`[SQLite Cache] Cached ${value.total} replays (${value.added} new, ${value.updated} updated, ${value.skipped} skipped) from ${replaysDir}`);
        replayScanStatus.running = false;
        replayScanStatus.finishedAt = new Date().toISOString();
        return;
      }
      replayScanStatus.processed = value.processed;
      replayScanStatus.total = value.total;
      replayScanStatus.currentFile = value.currentFile || null;
      setImmediate(step);
    } catch (err) {
      replayScanStatus.error = err instanceof Error ? err.message : String(err);
      console.warn('[SQLite Cache] Replay sync warning:', err);
      replayScanStatus.running = false;
      replayScanStatus.finishedAt = new Date().toISOString();
    }
  };
  setImmediate(step);
}

// Initial sync of LMU XML sessions into SQLite cache on server startup
try {
  const syncRes = sessionDb.syncSessionsFromDir(currentResultsDir, parser);
  console.log(`[SQLite Cache] Loaded ${syncRes.total} sessions (${syncRes.added} new, ${syncRes.updated} updated) from ${currentResultsDir}`);
} catch (err) {
  console.warn('[SQLite Cache] Initial sync warning:', err);
}

// Eagerly parse and cache .Vcr replay files too - LMU periodically deletes old replays,
// so waiting for a UI request to parse them risks losing that data permanently.
// This can take a long time (large replay libraries, many drivers per file), so it's
// deferred until after the server starts listening instead of blocking startup and
// leaving the port closed (which would surface as ECONNREFUSED to the frontend).
runReplaySyncInBackground(currentReplaysDir, parser.configuredPlayerName);

// Ensure reference laptimes are loaded or cached on server startup
(async () => {
  let refData = loadReferenceLaptimesFromCache();
  if (!refData) {
    try {
      console.log('Initializing reference laptimes cache from Google Sheets...');
      await fetchAndCacheReferenceLaptimes();
    } catch (err) {
      console.warn('Initial fetch of reference laptimes failed:', err);
    }
  }
})();

function loadSessions(forceRefresh = false, forceReparse = false): DetailedSession[] {
  if (forceRefresh) {
    sessionDb.syncSessionsFromDir(currentResultsDir, parser, forceReparse);
    runReplaySyncInBackground(currentReplaysDir, parser.configuredPlayerName);
  }
  return sessionDb.getAllSessions();
}

function parseAndCacheFile(filePath: string): DetailedSession | null {
  const parsed = parser.parseSessionXml(filePath);
  if (parsed) {
    try {
      const stats = fs.statSync(filePath);
      sessionDb.upsertSession(parsed, filePath, Math.floor(stats.mtimeMs), stats.size);
    } catch {
      // ignore
    }
  }
  return parsed;
}

// Reads replay metadata (drivers, event info, session type, laps) from the SQLite
// cache when the on-disk file hasn't changed; otherwise parses the .Vcr binary once
// and persists the (brotli-compressed) result so subsequent requests skip the parse.
function getCachedReplayMetadata(filePath: string, replayName: string, playerName?: string): ReplayMetadata {
  const stat = fs.statSync(filePath);
  const mtime = Math.floor(stat.mtimeMs);
  const cached = sessionDb.getReplayMetadataCache(replayName, mtime, stat.size);
  if (cached) return cached;
  const metadata = parseReplayMetadata(filePath, { playerName });
  sessionDb.upsertReplayMetadataCache(replayName, filePath, mtime, stat.size, metadata);
  return metadata;
}

// Reads a full-resolution (maxPoints=0) trajectory - including laps and pit/flag
// events for the resolved driver - from the SQLite cache, falling back to a single
// binary parse when missing/stale. Callers downsample in-memory as needed, which is
// far cheaper than re-parsing the replay frame stream from disk.
function getCachedFullTrajectory(
  filePath: string,
  replayName: string,
  opts: { driverSlot?: number; driverName?: string; lapNumber?: number; playerName?: string }
): ReplayTrajectoryData {
  const stat = fs.statSync(filePath);
  const mtime = Math.floor(stat.mtimeMs);
  const driverSlotKey = typeof opts.driverSlot === 'number' ? opts.driverSlot : -1;
  const lapKey = typeof opts.lapNumber === 'number' ? opts.lapNumber : -1;

  const cached = sessionDb.getReplayTrajectoryCache(replayName, driverSlotKey, lapKey, mtime, stat.size);
  if (cached) return cached;

  const trajectory = extractReplayTrajectory(filePath, {
    driverSlot: opts.driverSlot,
    driverName: opts.driverName,
    maxPoints: 0,
    playerName: opts.playerName,
    lapNumber: opts.lapNumber,
  });
  sessionDb.upsertReplayTrajectoryCache(replayName, driverSlotKey, lapKey, mtime, stat.size, trajectory);
  return trajectory;
}

app.get('/api/ai/settings', (_req, res) => {
  res.json(getAiSettings());
});

app.post('/api/ai/settings', (req, res) => {
  const { apiKey, model } = req.body as { apiKey?: unknown; model?: unknown };
  if (model !== undefined && (typeof model !== 'string' || !AI_MODELS.includes(model as typeof AI_MODELS[number]))) {
    return res.status(400).json({ error: 'Only the configured Gemini POC model is supported.', errorCode: 'invalid_model' });
  }
  if (apiKey !== undefined && typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'The Gemini API key must be a string.', errorCode: 'invalid_request' });
  }
  if (apiKey === '') clearSessionApiKey();
  else if (typeof apiKey === 'string') setSessionApiKey(apiKey);
  if (typeof model === 'string') setSessionModel(model);
  return res.json(getAiSettings());
});

app.post('/api/ai/analyze-lap', async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 10);
  const body = req.body as AiAnalyzeRequest;
  if (!body || typeof body !== 'object' || !body.evidence) {
    return res.status(400).json({ error: 'Lap evidence is required.', errorCode: 'invalid_request' });
  }
  const serializedSize = Buffer.byteLength(JSON.stringify(body.evidence), 'utf8');
  if (serializedSize > 64 * 1024) {
    return res.status(413).json({ error: 'Lap evidence is too large.', errorCode: 'payload_too_large' });
  }
  const settings = getAiSettings();
  if (!settings.configured) {
    return res.status(400).json({ error: 'Configure a Gemini API key before generating a report.', errorCode: 'not_configured' });
  }
  const cacheKey = getAiCacheKey(body.evidence);
  if (!body.forceRegenerate) {
    const cached = sessionDb.getAiReport(cacheKey);
    if (cached) {
      const response: AiAnalyzeResponse = {
        report: cached.report,
        cached: true,
        modelUsed: cached.model,
        generatedAt: new Date(cached.generatedAt).toISOString(),
        tokensUsed: cached.totalTokens == null ? undefined : {
          prompt: cached.promptTokens ?? 0,
          completion: cached.completionTokens ?? 0,
          total: cached.totalTokens,
        },
      };
      return res.json(response);
    }
  }
  try {
    const result = await analyzeLap(body);
    sessionDb.saveAiReport(createAiReportRecord(body.evidence, result));
    return res.json(result);
  } catch (cause) {
    const mapped = toAiError(cause);
    const status = mapped.code === 'invalid_key' ? 401 : mapped.code === 'rate_limited' ? 429 : mapped.code === 'payload_too_large' ? 413 : mapped.code === 'invalid_request' || mapped.code === 'not_configured' || mapped.code === 'invalid_model' ? 400 : mapped.code === 'upstream_unavailable' ? 503 : 502;
    console.warn(`[AI ${requestId}] ${mapped.code}: ${mapped.message}`);
    return res.status(status).json({ error: mapped.message, errorCode: mapped.code, requestId });
  }
});

app.get('/api/ai/reports', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    res.json(sessionDb.getAiReportsList(limit));
  } catch (err: unknown) {
    console.error('Failed to list AI report history:', err);
    const message = err instanceof Error ? err.message : 'Failed to list AI report history';
    res.status(500).json({ error: message });
  }
});

// API Routes

app.get('/api/status', (_req, res) => {
  const resultsExist = fs.existsSync(currentResultsDir);
  const replaysExist = fs.existsSync(currentReplaysDir);
  const sessions = loadSessions();
  const refCache = loadReferenceLaptimesFromCache();
  const cacheStats = sessionDb.getCacheStats();

  res.json({
    resultsDir: currentResultsDir,
    resultsExist,
    replaysDir: currentReplaysDir,
    replaysExist,
    playerName: parser.configuredPlayerName,
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
    },
  });
});

app.get('/api/sessions', (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const track = req.query.track as string | undefined;
  const car = req.query.car as string | undefined;
  const carClass = req.query.carClass as string | undefined;
  const driver = req.query.driver as string | undefined;
  const sessionType = req.query.sessionType as string | undefined;
  const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';

  let sessions = loadSessions(forceRefresh);

  if (hideEmpty) {
    sessions = sessions.filter(s => !isSessionEmpty(s));
  }

  if (track && track !== 'All') {
    sessions = sessions.filter(s => matchesTrack(track, s.trackVenue, s.trackCourse));
  }

  if (sessionType && sessionType !== 'All') {
    sessions = sessions.filter(s => matchesSessionType(s.sessionType, s.sessionName, sessionType));
  }

  if (carClass && carClass !== 'All') {
    sessions = sessions.filter(s => matchesSessionCarClass(s, carClass));
  }

  if (driver && driver !== 'All') {
    const dLower = driver.toLowerCase();
    sessions = sessions.filter(s =>
      (s.playerDriver?.name && s.playerDriver.name.toLowerCase().includes(dLower)) ||
      s.drivers.some(d => d.name.toLowerCase().includes(dLower))
    );
  }

  if (car && car !== 'All') {
    sessions = sessions.filter(s => 
      s.drivers.some(d => d.carType.toLowerCase().includes(car.toLowerCase()))
    );
  }

  // Return session metadata summaries (without deep lap lists to save bandwidth)
  const summaries = sessions.map(s => {
    const { drivers, ...meta } = s;
    return meta;
  });

  res.json(summaries);
});

app.get('/api/session/:id', (req, res) => {
  const { id } = req.params;

  // Set HTTP caching header for fast client-side navigation
  res.setHeader('Cache-Control', 'private, max-age=120');

  // 1. Fast path: Check database / memory cache
  const cached = sessionDb.getSessionById(id);
  if (cached) {
    return res.json(cached);
  }

  // 2. Fallback: Parse requested XML file directly if not yet in cache
  const singleFilePath = path.join(currentResultsDir, id.endsWith('.xml') ? id : `${id}.xml`);

  if (fs.existsSync(singleFilePath)) {
    const parsed = parseAndCacheFile(singleFilePath);
    if (parsed) {
      return res.json(parsed);
    }
  }

  res.status(404).json({ error: 'Session not found' });
});

app.get('/api/progression', (req, res) => {
  const driverName = req.query.driver as string | undefined;
  const track = req.query.track as string | undefined;
  const carClass = req.query.carClass as string | undefined;
  const sessionType = req.query.sessionType as string | undefined;
  const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';
  let sessions = loadSessions();

  if (hideEmpty) {
    sessions = sessions.filter(s => !isSessionEmpty(s));
  }

  if (track && track !== 'All') {
    sessions = sessions.filter(s => matchesTrack(track, s.trackVenue, s.trackCourse));
  }

  if (sessionType && sessionType !== 'All') {
    sessions = sessions.filter(s => matchesSessionType(s.sessionType, s.sessionName, sessionType));
  }

  if (carClass && carClass !== 'All') {
    sessions = sessions.filter(s => matchesSessionCarClass(s, carClass));
  }

  const progression = computeProgression(sessions, driverName);
  res.json(progression);
});

app.get('/api/tracks', (_req, res) => {
  const sessions = loadSessions();
  const summaries = computeTrackSummaries(sessions);
  res.json(summaries);
});

app.post('/api/cache/clear', (_req, res) => {
  try {
    sessionDb.clearCache();
    res.json({
      success: true,
      message: 'SQLite cache cleared successfully',
      sqliteCache: sessionDb.getCacheStats(),
      sessionsCount: 0,
    });
  } catch (err: unknown) {
    console.error('Failed to clear SQLite cache:', err);
    const message = err instanceof Error ? err.message : 'Failed to clear cache';
    res.status(500).json({ error: message });
  }
});

app.post('/api/scan', (req, res) => {
  const { resultsDir, replaysDir, playerName } = req.body;

  if (resultsDir && fs.existsSync(resultsDir)) {
    currentResultsDir = resultsDir;
  }
  if (replaysDir && fs.existsSync(replaysDir)) {
    currentReplaysDir = replaysDir;
  }

  parser = new LmuParser(currentReplaysDir, currentResultsDir);
  if (typeof playerName === 'string' && playerName.trim()) {
    parser.configuredPlayerName = playerName.trim();
  }

  const syncResult = sessionDb.syncSessionsFromDir(currentResultsDir, parser);
  // Replay trajectory extraction can take a long time for large libraries, so it runs
  // in the background - the frontend polls GET /api/scan/status for progress instead
  // of this request blocking until every .Vcr file has been scanned.
  runReplaySyncInBackground(currentReplaysDir, parser.configuredPlayerName);
  const sessions = sessionDb.getAllSessions();

  res.json({
    success: true,
    resultsDir: currentResultsDir,
    replaysDir: currentReplaysDir,
    playerName: parser.configuredPlayerName,
    sessionsCount: sessions.length,
    sync: syncResult,
    replayScanStarted: true,
    sqliteCache: sessionDb.getCacheStats(),
  });
});

app.get('/api/scan/status', (_req, res) => {
  res.json(replayScanStatus);
});

app.get('/api/track/:trackName', (req, res) => {
  const { trackName } = req.params;
  const decoded = decodeURIComponent(trackName);
  const allSessions = loadSessions();
  const trackSessions = allSessions.filter(s => matchesTrack(decoded, s.trackVenue, s.trackCourse));

  const sampleCourse = trackSessions.length > 0 ? trackSessions[0].trackCourse : '';
  const normTrack = normalizeTrackName(decoded, sampleCourse);
  const refCache = loadReferenceLaptimesFromCache();
  const benchmarks = refCache ? findMatchingTrackBenchmarkEntries(refCache.entries, decoded, sampleCourse) : [];

  res.json({
    trackName: decoded,
    normalizedTrackName: normTrack,
    sessionsCount: trackSessions.length,
    sessions: trackSessions.map(s => {
      const { drivers, ...meta } = s;
      return meta;
    }),
    benchmarks,
  });
});

app.get('/api/reference-laptimes', (_req, res) => {
  const refData = loadReferenceLaptimesFromCache();
  res.json(refData || { lastUpdated: null, entriesCount: 0, entries: {} });
});

app.post('/api/reference-laptimes/refresh', async (_req, res) => {
  try {
    const updatedCache = await fetchAndCacheReferenceLaptimes();
    // Force reparse of all cached sessions so lap pace categories update with the latest reference benchmark
    const sessions = loadSessions(true, true);
    res.json({
      success: true,
      lastUpdated: updatedCache.lastUpdated,
      entriesCount: updatedCache.entriesCount,
      sessionsCount: sessions.length,
      diff: updatedCache.lastUpdateDiff || null,
    });
  } catch (err: unknown) {
    console.error('Failed to refresh reference laptimes:', err);
    const message = err instanceof Error ? err.message : 'Failed to refresh reference laptimes';
    res.status(500).json({ error: message });
  }
});

app.get('/api/compare/laps', (req, res) => {
  const track = req.query.track as string | undefined;
  const carClass = req.query.carClass as string | undefined;
  const carModel = req.query.carModel as string | undefined;
  const driver = req.query.driver as string | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const playerOnly = req.query.playerOnly !== 'false';

  const sessions = loadSessions();
  const comparisonData = extractComparableLaps(sessions, {
    trackName: track,
    carClass,
    carModel,
    driverName: driver,
    sessionId,
    playerOnly,
  });

  const refCache = loadReferenceLaptimesFromCache();
  const benchmarks = refCache && track
    ? findMatchingTrackBenchmarkEntries(refCache.entries, track, '')
    : [];

  res.json({
    ...comparisonData,
    benchmarks,
  });
});

// Replays API routes
app.get('/api/replays/cache', (_req, res) => {
  try {
    res.json(sessionDb.getReplayCacheList());
  } catch (err: unknown) {
    console.error('Failed to list cached replays:', err);
    const message = err instanceof Error ? err.message : 'Failed to list cached replays';
    res.status(500).json({ error: message });
  }
});

app.get('/api/replays', (_req, res) => {
  try {
    if (!fs.existsSync(currentReplaysDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(currentReplaysDir);
    const sessions = loadSessions();
    const vcrFiles = files.filter(f => f.toLowerCase().endsWith('.vcr'));

    const summaries: ReplaySummary[] = [];

    for (const f of vcrFiles) {
      const filePath = path.join(currentReplaysDir, f);
      try {
        const stat = fs.statSync(filePath);
        let meta: ReplayMetadata | null = null;
        try {
          meta = getCachedReplayMetadata(filePath, f);
        } catch {
          // Ignore invalid or active recording files
        }

        const matched = sessions.find(s => s.matchingReplayFile?.name === f);
        const playerDriver = meta?.drivers?.find((d: ReplayDriverEntry) => d.isPlayer) || meta?.drivers?.[0];
        const replayCarClass = matched?.playerDriver?.carClass || playerDriver?.carClass || meta?.carClass;
        const replayCarModel = matched?.playerDriver?.carType || playerDriver?.carModel || meta?.carModel;
        const allCarClasses = Array.from(new Set([
          ...(meta?.drivers?.map((d: ReplayDriverEntry) => d.carClass).filter((c): c is string => Boolean(c)) || []),
          ...(matched?.drivers?.map((d: DriverData) => d.carClass).filter((c): c is string => Boolean(c)) || []),
          ...(replayCarClass ? [replayCarClass] : []),
        ]));

        const filenameMatch = f.match(/^(.+?)\s+([PQR]\d+)\b/i);
        const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';
        const displayTrack = matched
          ? getDisplayTrackName(matched.trackVenue, matched.trackCourse)
          : (meta?.displayTrack || filenameTrack || meta?.trackName);

        summaries.push({
          name: f,
          path: filePath,
          sizeBytes: stat.size,
          mtime: stat.mtime.getTime(),
          trackName: displayTrack,
          trackVenue: matched?.trackVenue || meta?.trackVenue,
          trackCourse: matched?.trackCourse || meta?.trackCourse || filenameTrack || undefined,
          displayTrack,
          durationSec: meta?.durationSec,
          eventTitle: meta?.eventInfo?.eventTitle,
          splitNo: meta?.eventInfo?.splitNo,
          eventType: meta?.eventInfo?.eventType,
          driversCount: meta?.drivers?.length,
          matchedSessionId: matched?.id,
          carClass: replayCarClass || undefined,
          carModel: replayCarModel || undefined,
          carClasses: allCarClasses.length > 0 ? allCarClasses : undefined,
        });
      } catch {
        // Skip unreadable files
      }
    }

    summaries.sort((a, b) => b.mtime - a.mtime);
    res.json(summaries);
  } catch (err: unknown) {
    console.error('Failed to list replays:', err);
    const message = err instanceof Error ? err.message : 'Failed to list replays';
    res.status(500).json({ error: message });
  }
});

app.get('/api/replays/:name/metadata', (req, res) => {
  try {
    const replayName = req.params.name;
    const filePath = path.join(currentReplaysDir, replayName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Replay file "${replayName}" not found` });
    }

    const metadata = getCachedReplayMetadata(filePath, replayName, parser.configuredPlayerName);

    try {
      const sessions = loadSessions();
      const matchedSession = sessions.find(s => s.matchingReplayFile?.name === replayName);
      if (matchedSession) {
        metadata.trackVenue = matchedSession.trackVenue;
        metadata.trackCourse = matchedSession.trackCourse;
        metadata.displayTrack = getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse);
        metadata.trackName = metadata.displayTrack;
        const driver = matchedSession.playerDriver || matchedSession.drivers[0];
        if (driver?.carClass) {
          metadata.carClass = driver.carClass;
          const p = metadata.drivers?.find(d => d.isPlayer) || metadata.drivers?.[0];
          if (p && !p.carClass) {
            p.carClass = driver.carClass;
          }
        }
        if (driver?.carType) {
          metadata.carModel = driver.carType;
          const p = metadata.drivers?.find(d => d.isPlayer) || metadata.drivers?.[0];
          if (p && !p.carModel) {
            p.carModel = driver.carType;
          }
        }
        if (driver?.laps && driver.laps.length > 0) {
          metadata.laps = driver.laps
            .filter(sl => typeof sl.lapTime === 'number' && sl.lapTime > 0)
            .map(sl => ({
              lapNumber: sl.lapNum,
              lapTimeSec: sl.lapTime as number,
              s1Sec: sl.s1 || 0,
              s2Sec: sl.s2 || 0,
              s3Sec: sl.s3 || 0,
              isBest: Boolean(driver.bestLapTime && sl.lapTime === driver.bestLapTime),
            }));
        }
      } else {
        const filenameMatch = replayName.match(/^(.+?)\s+([PQR]\d+)\b/i);
        const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';
        if (filenameTrack) {
          metadata.trackCourse = filenameTrack;
          metadata.displayTrack = filenameTrack;
          metadata.trackName = filenameTrack;
        }
      }
    } catch {
      // Ignore session loading errors
    }

    if (!metadata.laps || metadata.laps.length === 0) {
      try {
        const vcrTrajectory = getCachedFullTrajectory(filePath, replayName, { playerName: parser.configuredPlayerName });
        if (vcrTrajectory.laps && vcrTrajectory.laps.length > 0) {
          metadata.laps = vcrTrajectory.laps;
        }
      } catch {
        // Ignore fallback errors
      }
    }

    res.json(metadata);
  } catch (err: unknown) {
    console.error(`Failed to parse replay metadata for ${req.params.name}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to parse replay metadata';
    res.status(500).json({ error: message });
  }
});

app.get('/api/replays/:name/trajectory', (req, res) => {
  try {
    const replayName = req.params.name;
    const filePath = path.join(currentReplaysDir, replayName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Replay file "${replayName}" not found` });
    }

    const driverSlot = req.query.driverSlot ? parseInt(req.query.driverSlot as string, 10) : undefined;
    const driverName = (req.query.driverName as string | undefined) || (!req.query.driverSlot ? parser.configuredPlayerName : undefined);
    const maxPointsParam = req.query.maxPoints as string | undefined;
    const maxPoints = maxPointsParam !== undefined
      ? (maxPointsParam === '0' || maxPointsParam.toLowerCase() === 'raw' ? 0 : parseInt(maxPointsParam, 10))
      : 1200;
    const lapNumber = req.query.lap ? parseInt(req.query.lap as string, 10) : undefined;

    let matchedSession: DetailedSession | undefined = undefined;
    let matchedDriver: DriverData | undefined = undefined;
    try {
      const sessions = loadSessions();
      matchedSession = sessions.find(s => s.matchingReplayFile?.name === replayName);
      if (matchedSession) {
        matchedDriver = driverName
          ? matchedSession.drivers.find((d: DriverData) => (d.driverName || d.name || '').toLowerCase().includes(driverName.toLowerCase()))
          : undefined;

        if (!matchedDriver && typeof driverSlot === 'number') {
          try {
            const meta = getCachedReplayMetadata(filePath, replayName, parser.configuredPlayerName);
            const replayDriver = meta.drivers.find(d => d.slot === driverSlot);
            if (replayDriver) {
              matchedDriver = matchedSession.drivers.find((d: DriverData) =>
                (d.driverName || d.name || '').toLowerCase() === replayDriver.name.toLowerCase() ||
                (replayDriver.carNumber !== undefined && d.carNumber === replayDriver.carNumber)
              );
            }
          } catch {
            // Ignore metadata read errors
          }
        }

        if (!matchedDriver) {
          matchedDriver = matchedSession.playerDriver || matchedSession.drivers[0];
        }
      }
    } catch {
      // Ignore session loading errors
    }

    const fullTrajectory = getCachedFullTrajectory(filePath, replayName, {
      driverSlot,
      driverName,
      lapNumber,
      playerName: parser.configuredPlayerName,
    });
    const trajectory = downsampleReplayTrajectory(fullTrajectory, maxPoints);

    // Validate replay against matched session log (decoupled validation layer)
    try {
      if (matchedSession && matchedDriver?.laps && matchedDriver.laps.length > 0) {
        const officialLaps = matchedDriver.laps.map((sl: LapData) => ({
          lapNumber: sl.lapNum,
          lapTimeSec: sl.lapTime,
          s1Sec: sl.s1,
          s2Sec: sl.s2,
          s3Sec: sl.s3,
          isValid: sl.isValid,
        }));

        // Attach validation metrics to each detected replay lap
        if (trajectory.laps) {
          for (const l of trajectory.laps) {
            const match = officialLaps.find(o => o.lapNumber === l.lapNumber);
            if (match && typeof match.lapTimeSec === 'number' && match.lapTimeSec > 0) {
              l.validatedTimeSec = Number(match.lapTimeSec.toFixed(3));
              l.validatedS1Sec = typeof match.s1Sec === 'number' ? Number(match.s1Sec.toFixed(3)) : null;
              l.validatedS2Sec = typeof match.s2Sec === 'number' ? Number(match.s2Sec.toFixed(3)) : null;
              l.validatedS3Sec = typeof match.s3Sec === 'number' ? Number(match.s3Sec.toFixed(3)) : null;
              l.timeDiffSec = Number((l.lapTimeSec - match.lapTimeSec).toFixed(3));
            }
          }
        }

        trajectory.validation = {
          matchedSessionId: matchedSession.id,
          sessionType: matchedSession.sessionType,
          trackName: getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse),
          driverName: matchedDriver.driverName || matchedDriver.name,
          totalSessionLaps: matchedSession.totalLapsCount || officialLaps.length,
          officialBestLapTime: matchedDriver.bestLapTime,
          officialLaps,
        };
      }
    } catch {
      // Ignore validation lookup errors
    }

    res.json(trajectory);
  } catch (err: unknown) {
    console.error(`Failed to extract replay trajectory for ${req.params.name}:`, err);
    const message = err instanceof Error ? err.message : 'Failed to extract replay trajectory';
    res.status(500).json({ error: message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
  });
}

export { app, loadSessions, sessionDb };

