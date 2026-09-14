import fs from 'fs';
import path from 'path';
import { normalizeTrackName } from '../src/utils/paceCategory.js';
import { DuckDbReader } from './duckdbReader.js';
import { DetailedSession, ReplayMetadata } from './types.js';

export interface DuckDbFileInfo {
  filename: string;
  filePath: string;
  fileMtimeMs: number;
  fileSizeBytes: number;
  trackName: string;
  sessionType: string;
  timestampStr: string;
  timestampEpochMs: number;
  driverName?: string;
  carName?: string;
  lapsCount?: number;
  bestLapTime?: number;
}

export function parseDuckDbFilename(filename: string): {
  trackName: string;
  sessionType: string;
  timestampStr: string;
  timestampEpochMs: number;
} | null {
  // Typical formats:
  // "Track Name_P_2026-09-13T20_33_32Z.duckdb"
  // "Track_Name_R_2026-09-13T20:33:32Z.duckdb"
  const cleanName = path.basename(filename);
  const match = cleanName.match(/^(.*)_([A-Za-z0-9]+)_(\d{4}-\d{2}-\d{2}T\d{2}[_:]\d{2}[_:]\d{2}(?:\.\d+)?Z?)\.duckdb$/i);
  if (!match) {
    // Fallback: match without strict timestamp format if ends with .duckdb
    if (!cleanName.toLowerCase().endsWith('.duckdb')) return null;
    const nameWithoutExt = cleanName.replace(/\.duckdb$/i, '');
    const parts = nameWithoutExt.split('_');
    if (parts.length >= 2) {
      return {
        trackName: parts[0].trim(),
        sessionType: parts[1].trim(),
        timestampStr: '',
        timestampEpochMs: 0,
      };
    }
    return null;
  }

  const trackName = match[1].trim();
  const sessionType = match[2].trim().toUpperCase();
  const rawTime = match[3];
  // Convert underscores in time part to colons: e.g. "2026-09-13T20_33_32Z" -> "2026-09-13T20:33:32Z"
  const parts = rawTime.split('T');
  let normalizedIso = rawTime;
  if (parts.length === 2) {
    const timePart = parts[1].replace(/_/g, ':');
    normalizedIso = `${parts[0]}T${timePart}`;
    if (!normalizedIso.endsWith('Z') && !normalizedIso.includes('+')) {
      normalizedIso += 'Z';
    }
  }

  const dateObj = new Date(normalizedIso);
  const timestampEpochMs = isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();

  return {
    trackName,
    sessionType,
    timestampStr: normalizedIso,
    timestampEpochMs,
  };
}

export function scanDuckDbDirectory(telemetryDir: string): DuckDbFileInfo[] {
  if (!fs.existsSync(telemetryDir)) {
    return [];
  }

  const entries: DuckDbFileInfo[] = [];
  try {
    const files = fs.readdirSync(telemetryDir).filter((f) => f.toLowerCase().endsWith('.duckdb'));
    for (const f of files) {
      const filePath = path.join(telemetryDir, f);
      try {
        const stats = fs.statSync(filePath);
        const parsed = parseDuckDbFilename(f);
        if (parsed) {
          entries.push({
            filename: f,
            filePath,
            fileMtimeMs: Math.floor(stats.mtimeMs),
            fileSizeBytes: stats.size,
            trackName: parsed.trackName,
            sessionType: parsed.sessionType,
            timestampStr: parsed.timestampStr,
            timestampEpochMs: parsed.timestampEpochMs || Math.floor(stats.mtimeMs),
          });
        }
      } catch (err) {
        console.warn(`[TelemetryMatcher] Error reading duckdb file stat ${filePath}:`, err);
      }
    }
  } catch (err) {
    console.error(`[TelemetryMatcher] Error scanning telemetry directory ${telemetryDir}:`, err);
  }

  return entries;
}

export function normalizeSessionType(typeStr: string = ''): 'P' | 'Q' | 'R' | 'W' | 'OTHER' {
  const s = typeStr.trim().toUpperCase();
  if (s.startsWith('P') || s.includes('PRACTICE') || s.includes('TEST')) return 'P';
  if (s.startsWith('Q') || s.includes('QUALI')) return 'Q';
  if (s.startsWith('R') || s.includes('RACE')) return 'R';
  if (s.startsWith('W') || s.includes('WARMUP')) return 'W';
  return 'OTHER';
}

export function matchDuckDbToSession(
  duckdbFiles: DuckDbFileInfo[],
  session: DetailedSession,
  maxTimeDeltaSec = 300
): DuckDbFileInfo | null {
  if (duckdbFiles.length === 0) return null;

  const sessionNormTrack = normalizeTrackName(session.trackVenue, session.trackCourse);
  const sessionTypeNorm = normalizeSessionType(session.sessionType || session.sessionName);

  // Parse session timestamp
  let sessionEpochMs = 0;
  if (session.timestamp) {
    const d = new Date(session.timestamp);
    if (!isNaN(d.getTime())) {
      sessionEpochMs = d.getTime();
    } else {
      const asNum = Number(session.timestamp);
      if (!isNaN(asNum) && asNum > 1000000000) {
        sessionEpochMs = asNum > 1000000000000 ? asNum : asNum * 1000;
      }
    }
  }

  let bestMatch: DuckDbFileInfo | null = null;
  let smallestTimeDelta = Infinity;
  const untimedCandidates: DuckDbFileInfo[] = [];

  for (const duck of duckdbFiles) {
    // 1. Check track match
    const duckNormTrack = normalizeTrackName(duck.trackName);
    if (duckNormTrack && sessionNormTrack && duckNormTrack !== sessionNormTrack) {
      // If neither is a substring of the other, skip
      if (
        !duck.trackName.toLowerCase().includes(session.trackVenue.toLowerCase()) &&
        !session.trackVenue.toLowerCase().includes(duck.trackName.toLowerCase())
      ) {
        continue;
      }
    }

    // 2. Check session type match
    const duckTypeNorm = normalizeSessionType(duck.sessionType);
    if (duckTypeNorm !== 'OTHER' && sessionTypeNorm !== 'OTHER' && duckTypeNorm !== sessionTypeNorm) {
      continue;
    }

    // 3. Check time delta if timestamps are available
    if (sessionEpochMs > 0 && duck.timestampEpochMs > 0) {
      const deltaSec = Math.abs(duck.timestampEpochMs - sessionEpochMs) / 1000;
      if (deltaSec <= maxTimeDeltaSec && deltaSec < smallestTimeDelta) {
        smallestTimeDelta = deltaSec;
        bestMatch = duck;
      }
    } else {
      untimedCandidates.push(duck);
    }
  }

  // Only fall back to an untimed match when it is the single unambiguous candidate;
  // with multiple untimed candidates there's no reliable way to pick the right one.
  if (!bestMatch && untimedCandidates.length === 1) {
    bestMatch = untimedCandidates[0];
  }

  return bestMatch;
}

export function matchDuckDbToReplay(
  duckdbFiles: DuckDbFileInfo[],
  replay: ReplayMetadata,
  replayMtimeMs?: number,
  maxTimeDeltaSec = 300
): DuckDbFileInfo | null {
  if (duckdbFiles.length === 0) return null;

  const replayTrack = normalizeTrackName(replay.trackName || replay.eventInfo?.sceneDesc || '');
  const replayTypeNorm = normalizeSessionType(replay.sessionType || replay.eventInfo?.session || '');

  let bestMatch: DuckDbFileInfo | null = null;
  let smallestTimeDelta = Infinity;
  const untimedCandidates: DuckDbFileInfo[] = [];

  for (const duck of duckdbFiles) {
    // 1. Check track match
    const duckNormTrack = normalizeTrackName(duck.trackName);
    if (duckNormTrack && replayTrack && duckNormTrack !== replayTrack) {
      if (
        !duck.trackName.toLowerCase().includes((replay.trackName || '').toLowerCase()) &&
        !(replay.trackName || '').toLowerCase().includes(duck.trackName.toLowerCase())
      ) {
        continue;
      }
    }

    // 2. Check session type match
    const duckTypeNorm = normalizeSessionType(duck.sessionType);
    if (duckTypeNorm !== 'OTHER' && replayTypeNorm !== 'OTHER' && duckTypeNorm !== replayTypeNorm) {
      continue;
    }

    // 3. Time comparison against replay file mtime
    if (replayMtimeMs && duck.timestampEpochMs > 0) {
      const deltaSec = Math.abs(duck.timestampEpochMs - replayMtimeMs) / 1000;
      if (deltaSec <= maxTimeDeltaSec && deltaSec < smallestTimeDelta) {
        smallestTimeDelta = deltaSec;
        bestMatch = duck;
      }
    } else {
      untimedCandidates.push(duck);
    }
  }

  // Only fall back to an untimed match when it is the single unambiguous candidate;
  // with multiple untimed candidates there's no reliable way to pick the right one.
  if (!bestMatch && untimedCandidates.length === 1) {
    bestMatch = untimedCandidates[0];
  }

  return bestMatch;
}

export async function enrichDuckDbFileInfo(duck: DuckDbFileInfo): Promise<DuckDbFileInfo> {
  try {
    const reader = new DuckDbReader(duck.filePath);
    await reader.open();
    const meta = await reader.getMetadata();
    const laps = await reader.getLapList();
    await reader.close();

    const validLaps = laps.filter((l) => l.lapTimeSec > 30);
    const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map((l) => l.lapTimeSec)) : undefined;

    return {
      ...duck,
      trackName: meta.trackName || duck.trackName,
      driverName: meta.driverName || duck.driverName,
      carName: meta.carName || duck.carName,
      lapsCount: laps.length,
      bestLapTime,
    };
  } catch (err) {
    console.warn(`[TelemetryMatcher] Could not enrich DuckDB file ${duck.filePath}:`, err);
    return duck;
  }
}
