import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { LmuParser, computeProgression, computeTrackSummaries, extractComparableLaps } from './parser.js';
import { DetailedSession, ReplaySummary } from './types.js';
import { parseReplayMetadata, extractReplayTrajectory } from './replayParser.js';
import { loadReferenceLaptimesFromCache, fetchAndCacheReferenceLaptimes, normalizeTrackName } from './referenceLaptimes.js';
import { findMatchingTrackBenchmarkEntries, matchesTrack, matchesCarClass } from '../src/utils/paceCategory.js';
import { matchesSessionType, isSessionEmpty } from '../src/utils/formatters.js';
import { getSessionDatabase } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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

// Initial sync of LMU XML sessions into SQLite cache on server startup
try {
  const syncRes = sessionDb.syncSessionsFromDir(currentResultsDir, parser);
  console.log(`[SQLite Cache] Loaded ${syncRes.total} sessions (${syncRes.added} new, ${syncRes.updated} updated) from ${currentResultsDir}`);
} catch (err) {
  console.warn('[SQLite Cache] Initial sync warning:', err);
}

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

function loadSessions(forceRefresh = false): DetailedSession[] {
  if (forceRefresh) {
    sessionDb.syncSessionsFromDir(currentResultsDir, parser);
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
    sessions = sessions.filter(s =>
      matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', carClass) ||
      s.drivers.some(d => matchesCarClass(d.carClass || '', d.carType || '', carClass))
    );
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
  const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';
  let sessions = loadSessions();

  if (hideEmpty) {
    sessions = sessions.filter(s => !isSessionEmpty(s));
  }

  if (track && track !== 'All') {
    sessions = sessions.filter(s => matchesTrack(track, s.trackVenue, s.trackCourse));
  }

  if (carClass && carClass !== 'All') {
    sessions = sessions.filter(s =>
      matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', carClass) ||
      s.drivers.some(d => matchesCarClass(d.carClass || '', d.carType || '', carClass))
    );
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
  const sessions = sessionDb.getAllSessions();

  res.json({
    success: true,
    resultsDir: currentResultsDir,
    replaysDir: currentReplaysDir,
    playerName: parser.configuredPlayerName,
    sessionsCount: sessions.length,
    sync: syncResult,
    sqliteCache: sessionDb.getCacheStats(),
  });
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
    // Force reload sessions so lap pace categories update with latest reference benchmark
    const sessions = loadSessions(true);
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
        let meta: any = null;
        try {
          meta = parseReplayMetadata(filePath);
        } catch {
          // Ignore invalid or active recording files
        }

        const matched = sessions.find(s => s.matchingReplayFile?.name === f);

        summaries.push({
          name: f,
          path: filePath,
          sizeBytes: stat.size,
          mtime: stat.mtime.getTime(),
          trackName: meta?.trackName,
          durationSec: meta?.durationSec,
          eventTitle: meta?.eventInfo?.eventTitle,
          splitNo: meta?.eventInfo?.splitNo,
          eventType: meta?.eventInfo?.eventType,
          driversCount: meta?.drivers?.length,
          matchedSessionId: matched?.id,
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

    const metadata = parseReplayMetadata(filePath, { playerName: parser.configuredPlayerName });
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
    const maxPoints = req.query.maxPoints ? parseInt(req.query.maxPoints as string, 10) : 1200;
    const lapNumber = req.query.lap ? parseInt(req.query.lap as string, 10) : undefined;

    const trajectory = extractReplayTrajectory(filePath, {
      driverSlot,
      driverName,
      maxPoints,
      playerName: parser.configuredPlayerName,
      lapNumber,
    });

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

