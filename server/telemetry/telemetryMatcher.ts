import fs from 'fs';
import path from 'path';
import { matchesTrack } from '../../src/utils/paceCategory.js';
import { DuckDbReader } from './duckdbReader.js';
import { DetailedSession, ReplayMetadata } from '../core/types.js';

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
  enrichmentError?: string;
}

const duckDbMetadataCache = new Map<string, {
  trackName?: string;
  sessionType?: string;
  driverName?: string;
  recordingTimeEpochMs?: number;
}>();

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
    const sessionIndex = parts.findIndex((part, index) =>
      index > 0 && /^[PQRW]\d*$/i.test(part)
    );
    if (sessionIndex > 0) {
      return {
        trackName: parts.slice(0, sessionIndex).join('_').trim(),
        sessionType: parts[sessionIndex].trim().toUpperCase(),
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
          const cachedMetadata = duckDbMetadataCache.get(filePath);
          entries.push({
            filename: f,
            filePath,
            fileMtimeMs: Math.floor(stats.mtimeMs),
            fileSizeBytes: stats.size,
            trackName: cachedMetadata?.trackName || parsed.trackName,
            sessionType: cachedMetadata?.sessionType || parsed.sessionType,
            timestampStr: parsed.timestampStr,
            timestampEpochMs: cachedMetadata?.recordingTimeEpochMs || parsed.timestampEpochMs || Math.floor(stats.mtimeMs),
            driverName: cachedMetadata?.driverName,
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

function shouldReplaceMatch(
  candidate: DuckDbFileInfo,
  candidateDeltaSec: number,
  current: DuckDbFileInfo | null,
  currentDeltaSec: number
): boolean {
  if (!current) return true;

  // LMU can emit a short partial DuckDB and then a larger complete recording
  // for the same session within seconds of each other.
  const sameRecordingBurst = Math.abs(candidateDeltaSec - currentDeltaSec) <= 60;
  if (sameRecordingBurst && candidate.fileSizeBytes !== current.fileSizeBytes) {
    return candidate.fileSizeBytes > current.fileSizeBytes;
  }

  return candidateDeltaSec < currentDeltaSec;
}

export function matchDuckDbToSession(
  duckdbFiles: DuckDbFileInfo[],
  session: DetailedSession,
  maxTimeDeltaSec = 3600
): DuckDbFileInfo | null {
  if (duckdbFiles.length === 0) return null;

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
  const timedCandidateDeltas: number[] = [];
  const untimedCandidates: DuckDbFileInfo[] = [];

  for (const duck of duckdbFiles) {
    // 1. Check track match
    if (!matchesTrack(duck.trackName, session.trackVenue, session.trackCourse)) continue;

    if (duck.driverName && session.drivers.length > 0) {
      const duckDriver = duck.driverName.toLowerCase();
      if (!session.drivers.some((driver) => (driver.name || '').toLowerCase().includes(duckDriver) || duckDriver.includes((driver.name || '').toLowerCase()))) {
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
      if (deltaSec <= maxTimeDeltaSec) {
        timedCandidateDeltas.push(deltaSec);
        if (shouldReplaceMatch(duck, deltaSec, bestMatch, smallestTimeDelta)) {
          smallestTimeDelta = deltaSec;
          bestMatch = duck;
        }
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

  const sortedDeltas = timedCandidateDeltas.sort((a, b) => a - b);
  if (bestMatch && sortedDeltas.length > 1 && sortedDeltas[1] - sortedDeltas[0] < 5) {
    return null;
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

  const replayTypeNorm = normalizeSessionType(replay.sessionType || replay.eventInfo?.session || '');

  let bestMatch: DuckDbFileInfo | null = null;
  let smallestTimeDelta = Infinity;
  const timedCandidateDeltas: number[] = [];
  const untimedCandidates: DuckDbFileInfo[] = [];

  for (const duck of duckdbFiles) {
    // 1. Check track match
    if (!matchesTrack(duck.trackName, replay.trackName || replay.eventInfo?.sceneDesc || '', '')) continue;

    if (duck.driverName && replay.drivers.length > 0) {
      const duckDriver = duck.driverName.toLowerCase();
      if (!replay.drivers.some((driver) => driver.name.toLowerCase().includes(duckDriver) || duckDriver.includes(driver.name.toLowerCase()))) {
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
      if (deltaSec <= maxTimeDeltaSec) {
        timedCandidateDeltas.push(deltaSec);
        if (shouldReplaceMatch(duck, deltaSec, bestMatch, smallestTimeDelta)) {
          smallestTimeDelta = deltaSec;
          bestMatch = duck;
        }
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

  const sortedDeltas = timedCandidateDeltas.sort((a, b) => a - b);
  if (bestMatch && sortedDeltas.length > 1 && sortedDeltas[1] - sortedDeltas[0] < 5) {
    return null;
  }

  return bestMatch;
}

export async function enrichDuckDbFileInfo(duck: DuckDbFileInfo): Promise<DuckDbFileInfo> {
  const reader = new DuckDbReader(duck.filePath);
  try {
    await reader.open();
    const meta = await reader.getMetadata();
    const laps = await reader.getLapList();

    const recordingTimeEpochMs = meta.RecordingTime
      ? new Date(meta.RecordingTime.replace(/_/g, ':')).getTime()
      : undefined;
    duckDbMetadataCache.set(duck.filePath, {
      trackName: meta.trackName,
      sessionType: meta.sessionType,
      driverName: meta.driverName,
      recordingTimeEpochMs: recordingTimeEpochMs && !isNaN(recordingTimeEpochMs) ? recordingTimeEpochMs : undefined,
    });

    const validLaps = laps.filter((l) => l.lapTimeSec > 30);
    const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map((l) => l.lapTimeSec)) : undefined;

    return {
      ...duck,
      trackName: meta.trackName || duck.trackName,
      sessionType: meta.sessionType || duck.sessionType,
      timestampEpochMs: recordingTimeEpochMs && !isNaN(recordingTimeEpochMs) ? recordingTimeEpochMs : duck.timestampEpochMs,
      driverName: meta.driverName || duck.driverName,
      carName: meta.carName || duck.carName,
      lapsCount: laps.length,
      bestLapTime,
    };
  } catch (err) {
    console.warn(`[TelemetryMatcher] Could not enrich DuckDB file ${duck.filePath}:`, err);
    return {
      ...duck,
      enrichmentError: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await reader.close();
    } catch (closeError) {
      console.warn(`[TelemetryMatcher] Could not close DuckDB file ${duck.filePath}:`, closeError);
    }
  }
}

export async function enrichDuckDbDirectory(telemetryDir: string): Promise<DuckDbFileInfo[]> {
  const files = scanDuckDbDirectory(telemetryDir);
  return Promise.all(files.map((file) => enrichDuckDbFileInfo(file)));
}
