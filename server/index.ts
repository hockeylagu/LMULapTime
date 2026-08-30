import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { LmuParser, computeProgression, computeTrackSummaries } from './parser.js';
import { DetailedSession } from './types.js';

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

  res.json({
    resultsDir: currentResultsDir,
    resultsExist,
    replaysDir: currentReplaysDir,
    replaysExist,
    sessionsCount: sessions.length,
    tracksCount: Object.keys(computeTrackSummaries(sessions)).length,
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
  const { resultsDir, replaysDir } = req.body;

  if (resultsDir && fs.existsSync(resultsDir)) {
    currentResultsDir = resultsDir;
  }
  if (replaysDir && fs.existsSync(replaysDir)) {
    currentReplaysDir = replaysDir;
    parser = new LmuParser(currentReplaysDir);
  }

  const sessions = loadSessions(true);
  res.json({
    success: true,
    resultsDir: currentResultsDir,
    replaysDir: currentReplaysDir,
    sessionsCount: sessions.length,
  });
});

app.listen(PORT, () => {
  console.log(`LMU Lap Time Analyzer Server running on http://localhost:${PORT}`);
});
