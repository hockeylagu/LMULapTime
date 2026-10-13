import { dataPlugin } from '../plugins/dataPlugin.js';
import {
  ReplayDriverEntry,
  ReplayLapSummary,
  ReplayMetadata,
} from '../../shared/types/index.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
import { resolveRosterVehicles } from '../../shared/domain/vehicleMapping.js';
import type { ReplaySessionContext } from './replayServiceTypes.js';

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
  matchedSession?: ReplaySessionContext;
  fallbackTrajectoryLaps?: () => ReplayLapSummary[] | undefined;
  /** The stored DuckDB match of the replay (TelemetryLinks.forReplay). */
  duckdbFilename?: string;
}

export function composeReplayMetadata(options: ComposeReplayMetadataOptions): ReplayMetadata {
  const metadata = cloneReplayMetadata(options.metadata);
  const matchedSession = options.matchedSession;

  if (matchedSession) {
    metadata.trackVenue = matchedSession.trackVenue;
    metadata.trackCourse = matchedSession.trackCourse;
    metadata.displayTrack = getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse);
    metadata.trackName = metadata.displayTrack;

    resolveRosterVehicles(metadata, matchedSession.drivers);
    const driver = matchedSession.playerDriver;
    const exactName = driver?.name.trim().toLowerCase();
    const matchingSessionDrivers = exactName
      ? matchedSession.drivers.filter(item => item.name.trim().toLowerCase() === exactName) : [];
    const matchingReplayDrivers = exactName
      ? metadata.drivers.filter(item => item.name.trim().toLowerCase() === exactName) : [];
    const linkedPlayer = matchingSessionDrivers.length === 1 && matchingReplayDrivers.length === 1
      ? matchingReplayDrivers[0] : undefined;
    if (driver?.carClass) {
      metadata.carClass = driver.carClass;
      if (linkedPlayer && !linkedPlayer.carClass) linkedPlayer.carClass = driver.carClass;
    }
    if (driver?.carType) {
      metadata.carType = driver.carType;
      if (linkedPlayer && !linkedPlayer.carType) linkedPlayer.carType = driver.carType;
    }
    if (driver?.laps?.length && linkedPlayer) {
      metadata.laps = driver.laps
        .filter(lap => typeof lap.lapTime === 'number' && lap.lapTime > 0)
        .map(lap => ({
          lapNumber: lap.lapNumber,
          lapTimeSec: lap.lapTime as number,
          s1Sec: lap.s1 || 0,
          s2Sec: lap.s2 || 0,
          s3Sec: lap.s3 || 0,
          isBest: Boolean(driver.bestLapTime && lap.lapTime === driver.bestLapTime),
          isValid: lap.isValid,
          isPitStop: lap.isPitStop,
          isOutLap: lap.isOutLap,
          nonRepresentativeReason: lap.nonRepresentativeReason,
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

  if (options.duckdbFilename) metadata.duckdbFilename = options.duckdbFilename;

  // The car name stays the one sessions store (resolveRosterVehicles took it from the session log);
  // only the class comes from the data package, resolved by vehicle id.
  for (const entry of metadata.drivers) {
    const vehicle = dataPlugin.vehicle(entry);
    if (vehicle) entry.carClass = vehicle.carClass;
  }
  return metadata;
}
