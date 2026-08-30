import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { LmuParser, computeProgression, computeTrackSummaries } from './parser.js';
import { DetailedSession } from './types.js';
import { loadReferenceLaptimesFromCache, fetchAndCacheReferenceLaptimes, normalizeTrackName } from './referenceLaptimes.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Default LMU Paths
const DEFAULT_RESULTS_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results';
const DEFAULT_REPLAYS_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';

let currentResultsDir = DEFAULT_RESULTS_DIR;
let currentReplaysDir = DEFAULT_REPLAYS_DIR;

let parser = new LmuParser(currentReplaysDir);
let cachedSessions: DetailedSession[] = [];

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
  // Return cached sessions instantly unless a force refresh is requested
  if (!forceRefresh && cachedSessions.length > 0) {
    return cachedSessions;
  }

  if (!fs.existsSync(currentResultsDir)) {
    console.warn(`Results directory does not exist: ${currentResultsDir}`);
    return [];
  }

  try {
    const files = fs.readdirSync(currentResultsDir).filter(f => f.endsWith('.xml'));
    const sessions: DetailedSession[] = [];

    for (const f of files) {
      const filePath = path.join(currentResultsDir, f);
      const parsed = parser.parseSessionXml(filePath);
      if (parsed) {
        sessions.push(parsed);
      }
    }

    // Sort chronologically
    sessions.sort((a, b) => a.timestamp - b.timestamp);
    cachedSessions = sessions;
    console.log(`Scanned ${sessions.length} LMU XML sessions from ${currentResultsDir}`);
    return sessions;
  } catch (err) {
    console.error('Error loading sessions:', err);
    return [];
  }
}

// API Routes

app.get('/api/status', (_req, res) => {
  const resultsExist = fs.existsSync(currentResultsDir);
  const replaysExist = fs.existsSync(currentReplaysDir);
  const sessions = loadSessions();
  const refCache = loadReferenceLaptimesFromCache();

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
    },
  });
});

app.get('/api/sessions', (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const track = req.query.track as string | undefined;
  const car = req.query.car as string | undefined;
  const sessionType = req.query.sessionType as string | undefined;
  const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';

  let sessions = loadSessions(forceRefresh);

  if (hideEmpty) {
    sessions = sessions.filter(s => (s.playerDriver?.lapsCount ?? 0) > 0 && s.playerDriver?.bestLapTime !== null);
  }

  if (track) {
    sessions = sessions.filter(s => s.trackVenue.toLowerCase().includes(track.toLowerCase()));
  }

  if (sessionType && sessionType !== 'All') {
    sessions = sessions.filter(s => s.sessionType.toLowerCase() === sessionType.toLowerCase());
  }

  if (car) {
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

  // 1. Check in-memory cached sessions first (instant lookup without rescanning directory)
  const cached = cachedSessions.find(s => s.id === id);
  if (cached) {
    return res.json(cached);
  }

  // 2. Fallback: Parse ONLY the single requested XML file directly
  const singleFilePath = path.join(currentResultsDir, `${id}.xml`);
  if (fs.existsSync(singleFilePath)) {
    const parsed = parser.parseSessionXml(singleFilePath);
    if (parsed) {
      return res.json(parsed);
    }
  }

  res.status(404).json({ error: 'Session not found' });
});

app.get('/api/progression', (req, res) => {
  const driverName = req.query.driver as string | undefined;
  const track = req.query.track as string | undefined;
  const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';
  let sessions = loadSessions();

  if (hideEmpty) {
    sessions = sessions.filter(s => (s.playerDriver?.lapsCount ?? 0) > 0 && s.playerDriver?.bestLapTime !== null);
  }

  if (track) {
    sessions = sessions.filter(s => s.trackVenue.toLowerCase().includes(track.toLowerCase()));
  }

  const progression = computeProgression(sessions, driverName);
  res.json(progression);
});

app.get('/api/tracks', (_req, res) => {
  const sessions = loadSessions();
  const summaries = computeTrackSummaries(sessions);
  res.json(summaries);
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

  const sessions = loadSessions(true);
  res.json({
    success: true,
    resultsDir: currentResultsDir,
    replaysDir: currentReplaysDir,
    playerName: parser.configuredPlayerName,
    sessionsCount: sessions.length,
  });
});

app.get('/api/track/:trackName', (req, res) => {
  const { trackName } = req.params;
  const decoded = decodeURIComponent(trackName);
  const allSessions = loadSessions();
  const trackSessions = allSessions.filter(s =>
    s.trackVenue.toLowerCase().includes(decoded.toLowerCase()) ||
    s.trackCourse.toLowerCase().includes(decoded.toLowerCase()) ||
    decoded.toLowerCase().includes(s.trackVenue.toLowerCase())
  );

  const sampleCourse = trackSessions.length > 0 ? trackSessions[0].trackCourse : '';
  const normTrack = normalizeTrackName(decoded, sampleCourse);
  const refCache = loadReferenceLaptimesFromCache();
  let benchmarks: any[] = [];

  if (refCache) {
    const normClean = normTrack.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matches = Object.values(refCache.entries).filter(entry => {
      const entryNorm = normalizeTrackName(entry.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const entryRaw = entry.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return entryNorm === normClean || entryRaw === normClean;
    });

    if (matches.length === 0) {
      matches = Object.values(refCache.entries).filter(entry => {
        const entryNorm = normalizeTrackName(entry.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
        return entryNorm.includes(normClean) || normClean.includes(entryNorm);
      });
    }

    benchmarks = matches;
  }

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
    });
  } catch (err: any) {
    console.error('Failed to refresh reference laptimes:', err);
    res.status(500).json({ error: err.message || 'Failed to refresh reference laptimes' });
  }
});

app.listen(PORT, () => {
  console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
});
