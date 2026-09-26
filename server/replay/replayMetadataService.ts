import fs from 'fs';
import path from 'path';
import {
  DetailedSession,
  ReplayDriverEntry,
  ReplayLapSummary,
  ReplayMetadata,
  ReplaySummary,
} from '../core/types.js';
import type { DuckDbFileInfo } from '../telemetry/telemetryMatcher.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
import { matchDuckDbToReplay, matchDuckDbToSession } from '../telemetry/telemetryMatcher.js';
import { ReplaySummarySourceData } from './replayServiceTypes.js';

export function cloneReplayMetadata(metadata: ReplayMetadata): ReplayMetadata {
  return {
    ...metadata,
    eventInfo: metadata.eventInfo ? { ...metadata.eventInfo } : metadata.eventInfo,
    drivers: Array.isArray(metadata.drivers)
      ? metadata.drivers.map((driver: ReplayDriverEntry) => ({ ...driver }))
      : [],
    laps: Array.isArray(metadata.laps)
      ? metadata.laps.map((lap: ReplayLapSummary) => ({ ...lap }))
      : undefined,
  };
}

export interface ComposeReplayMetadataOptions {
  metadata: ReplayMetadata;
  replayName: string;
  matchedSession?: DetailedSession;
  fallbackTrajectoryLaps?: () => ReplayLapSummary[] | undefined;
  duckFiles?: DuckDbFileInfo[];
  telemetryMeta?: Array<{
    filename: string;
    matchedReplayFilename?: string | null;
    matchedSessionId?: string | null;
  }>;
  fileMtime?: number;
}

export function composeReplayMetadata(options: ComposeReplayMetadataOptions): ReplayMetadata {
  const metadata = cloneReplayMetadata(options.metadata);
  const matchedSession = options.matchedSession;

  if (matchedSession) {
    metadata.trackVenue = matchedSession.trackVenue;
    metadata.trackCourse = matchedSession.trackCourse;
    metadata.displayTrack = getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse);
    metadata.trackName = metadata.displayTrack;

    const driver = matchedSession.playerDriver || matchedSession.drivers[0];
    if (driver?.carClass) {
      metadata.carClass = driver.carClass;
      const player = metadata.drivers?.find(item => item.isPlayer) || metadata.drivers?.[0];
      if (player && !player.carClass) player.carClass = driver.carClass;
    }
    if (driver?.carType) {
      metadata.carModel = driver.carType;
      const player = metadata.drivers?.find(item => item.isPlayer) || metadata.drivers?.[0];
      if (player && !player.carModel) player.carModel = driver.carType;
    }
    if (driver?.laps?.length) {
      metadata.laps = driver.laps
        .filter(lap => typeof lap.lapTime === 'number' && lap.lapTime > 0)
        .map(lap => ({
          lapNumber: lap.lapNum,
          lapTimeSec: lap.lapTime as number,
          s1Sec: lap.s1 || 0,
          s2Sec: lap.s2 || 0,
          s3Sec: lap.s3 || 0,
          isBest: Boolean(driver.bestLapTime && lap.lapTime === driver.bestLapTime),
        }));
    }
  } else {
    const filenameMatch = options.replayName.match(/^(.+?)\s+([PQR]\d+)\b/i);
    const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';
    if (filenameTrack) {
      metadata.trackCourse = filenameTrack;
      metadata.displayTrack = filenameTrack;
      metadata.trackName = filenameTrack;
    }
  }

  if (!metadata.laps?.length && options.fallbackTrajectoryLaps) {
    try {
      const fallbackLaps = options.fallbackTrajectoryLaps();
      if (fallbackLaps?.length) {
        metadata.laps = fallbackLaps.map(lap => ({ ...lap }));
      }
    } catch {
      // Ignore trajectory fallback errors
    }
  }

  try {
    const duckFiles = options.duckFiles || [];
    const telemetryMeta = options.telemetryMeta || [];
    const matchedDuckFilename =
      matchDuckDbToReplay(duckFiles, metadata, options.fileMtime)?.filename ||
      (matchedSession ? matchDuckDbToSession(duckFiles, matchedSession)?.filename : undefined) ||
      telemetryMeta.find(item => item.matchedReplayFilename === options.replayName)?.filename ||
      (matchedSession ? telemetryMeta.find(item => item.matchedSessionId === matchedSession.id)?.filename : undefined);

    if (matchedDuckFilename) {
      metadata.hasDuckDbTelemetry = true;
      metadata.duckdbFilename = matchedDuckFilename;
    }
  } catch {
    // Ignore optional telemetry matching errors
  }

  return metadata;
}

export function buildReplayListSummaries(input: ReplaySummarySourceData): ReplaySummary[] {
  const diskFiles = input.diskFiles;
  const storedMap = new Map(input.storedReplays.map(r => [r.filename, r]));
  const allFilenames = Array.from(new Set([...diskFiles, ...storedMap.keys()]));
  const summaries: ReplaySummary[] = [];

  for (const filename of allFilenames) {
    const stored = storedMap.get(filename);
    const filePath = (stored?.file_path && fs.existsSync(stored.file_path))
      ? stored.file_path
      : path.join(input.replaysDir, filename);

    try {
      let mtime = stored?.file_mtime || 0;
      let sizeBytes = stored?.file_size || 0;
      let fileOnDisk = false;

      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          mtime = stat.mtime.getTime();
          sizeBytes = stat.size;
          fileOnDisk = true;
        } catch {
          // Ignore stat error
        }
      }

      let metadata: ReplayMetadata | null = stored?.metadata || null;
      if (!metadata && fileOnDisk) {
        try {
          metadata = input.getMetadata(filePath, filename);
        } catch {
          // Ignore active or invalid recordings
        }
      }
      if (!metadata && stored?.metadata) {
        metadata = stored.metadata;
      }
      if (!metadata) continue;

      const matched = input.sessions.find(session => session.matchingReplayFile?.name === filename);
      const playerDriver = metadata.drivers?.find((driver: ReplayDriverEntry) => driver.isPlayer) || metadata.drivers?.[0];
      const carClass = matched?.playerDriver?.carClass || playerDriver?.carClass || metadata.carClass;
      const carModel = matched?.playerDriver?.carType || playerDriver?.carModel || metadata.carModel;
      const carClasses = Array.from(new Set([
        ...(metadata.drivers?.map(driver => driver.carClass).filter((value): value is string => Boolean(value)) || []),
        ...(matched?.drivers?.map(driver => driver.carClass).filter((value): value is string => Boolean(value)) || []),
        ...(carClass ? [carClass] : []),
      ]));
      const filenameMatch = filename.match(/^(.+?)\s+([PQR]\d+)\b/i);
      const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';
      const displayTrack = matched
        ? getDisplayTrackName(matched.trackVenue, matched.trackCourse)
        : (metadata.displayTrack || filenameTrack || metadata.trackName);

      const matchedDuckFilename =
        input.telemetryMeta.find(item => item.matchedReplayFilename === filename)?.filename ||
        (matched ? input.telemetryMeta.find(item => item.matchedSessionId === matched.id)?.filename : undefined) ||
        matchDuckDbToReplay(input.duckFiles, metadata, mtime)?.filename ||
        (matched ? matchDuckDbToSession(input.duckFiles, matched)?.filename : undefined);

      summaries.push({
        name: filename,
        path: filePath,
        sizeBytes,
        mtime,
        trackName: displayTrack,
        trackVenue: matched?.trackVenue || metadata.trackVenue,
        trackCourse: matched?.trackCourse || metadata.trackCourse || filenameTrack || undefined,
        displayTrack,
        durationSec: metadata.durationSec,
        eventTitle: metadata.eventInfo?.eventTitle,
        splitNo: metadata.eventInfo?.splitNo,
        eventType: metadata.eventInfo?.eventType,
        driversCount: metadata.drivers?.length,
        matchedSessionId: matched?.id,
        carClass: carClass || undefined,
        carModel: carModel || undefined,
        carClasses: carClasses.length > 0 ? carClasses : undefined,
        hasDuckDbTelemetry: Boolean(matchedDuckFilename),
        duckdbFilename: matchedDuckFilename,
      });
    } catch {
      // Skip unreadable files
    }
  }

  summaries.sort((left, right) => right.mtime - left.mtime);
  return summaries;
}
