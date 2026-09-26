import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { downsampleReplayTrajectory } from '../replay/replayParser.js';
import { DuckDbReader } from '../telemetry/duckdbReader.js';
import { matchDuckDbToReplay, matchDuckDbToSession } from '../telemetry/telemetryMatcher.js';
import { fuseDuckDbWithVcrTrajectory } from '../telemetry/telemetryFusion.js';
import { enrichTrajectoryWithTrackGeometry } from '../tracks/serverTrackSync.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
import { DetailedSession, DriverData, LapData, ReplayDriverEntry, ReplayMetadata, ReplaySummary } from '../core/types.js';
import { ServerContext } from '../core/serverContext.js';

function isSafeFileName(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && path.basename(value) === value && !value.includes('\0');
}

function parseBoundedInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error(`Invalid ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${name}`);
  return parsed;
}

export function createReplayRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/replays/cache', (_req, res) => {
    try {
      res.json(context.sessionDb.getReplayCacheList());
    } catch (error: unknown) {
      console.error('Failed to list cached replays:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list cached replays' });
    }
  });

  router.get('/replays', (_req, res) => {
    try {
      const diskFiles = (fs.existsSync(context.replaysDir) ? fs.readdirSync(context.replaysDir) : [])
        .filter(file => file.toLowerCase().endsWith('.vcr'));
      const storedReplays = context.sessionDb.getAllStoredReplayFiles();
      const storedMap = new Map(storedReplays.map(r => [r.filename, r]));

      const allFilenames = Array.from(new Set([...diskFiles, ...storedMap.keys()]));
      const sessions = context.loadSessions();
      const duckFiles = context.telemetryCatalog.getFiles();
      const telemetryMeta = context.sessionDb.getTelemetryMetadata();
      const summaries: ReplaySummary[] = [];

      for (const filename of allFilenames) {
        const stored = storedMap.get(filename);
        const filePath = (stored?.file_path && fs.existsSync(stored.file_path))
          ? stored.file_path
          : path.join(context.replaysDir, filename);

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
            } catch { /* Ignore stat error. */ }
          }

          let metadata: ReplayMetadata | null = stored?.metadata || null;
          if (!metadata && fileOnDisk) {
            try { metadata = context.replayCache.getMetadata(filePath, filename); } catch { /* Ignore active or invalid recordings. */ }
          }
          if (!metadata && stored?.metadata) {
            metadata = stored.metadata;
          }
          if (!metadata) continue;

          const matched = sessions.find(session => session.matchingReplayFile?.name === filename);
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
          const displayTrack = matched ? getDisplayTrackName(matched.trackVenue, matched.trackCourse) : (metadata.displayTrack || filenameTrack || metadata.trackName);
          const matchedDuckFilename = telemetryMeta.find(item => item.matchedReplayFilename === filename)?.filename ||
            (matched ? telemetryMeta.find(item => item.matchedSessionId === matched.id)?.filename : undefined) ||
            matchDuckDbToReplay(duckFiles, metadata, mtime)?.filename ||
            (matched ? matchDuckDbToSession(duckFiles, matched)?.filename : undefined);

          summaries.push({
            name: filename, path: filePath, sizeBytes, mtime, trackName: displayTrack,
            trackVenue: matched?.trackVenue || metadata.trackVenue,
            trackCourse: matched?.trackCourse || metadata.trackCourse || filenameTrack || undefined,
            displayTrack, durationSec: metadata.durationSec, eventTitle: metadata.eventInfo?.eventTitle,
            splitNo: metadata.eventInfo?.splitNo, eventType: metadata.eventInfo?.eventType, driversCount: metadata.drivers?.length,
            matchedSessionId: matched?.id, carClass: carClass || undefined, carModel: carModel || undefined,
            carClasses: carClasses.length > 0 ? carClasses : undefined, hasDuckDbTelemetry: Boolean(matchedDuckFilename), duckdbFilename: matchedDuckFilename,
          });
        } catch { /* Skip unreadable files. */ }
      }
      summaries.sort((left, right) => right.mtime - left.mtime);
      res.json(summaries);
    } catch (error: unknown) {
      console.error('Failed to list replays:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list replays' });
    }
  });

  router.get('/telemetry', (_req, res) => res.json(context.telemetryCatalog.getFiles()));

  router.get('/replays/:name/metadata', (req, res) => {
    try {
      const replayName = req.params.name;
      if (!isSafeFileName(replayName) || !replayName.toLowerCase().endsWith('.vcr')) return res.status(400).json({ error: 'Invalid replay filename' });
      const filePath = path.join(context.replaysDir, replayName);
      if (!fs.existsSync(filePath) && !context.sessionDb.getStoredReplayMetadata(replayName)) return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      const metadata = context.replayCache.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName);
      const sessions = context.loadSessions();
      const matchedSession = sessions.find(session => session.matchingReplayFile?.name === replayName);

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
          metadata.laps = driver.laps.filter(lap => typeof lap.lapTime === 'number' && lap.lapTime > 0).map(lap => ({
            lapNumber: lap.lapNum, lapTimeSec: lap.lapTime as number, s1Sec: lap.s1 || 0, s2Sec: lap.s2 || 0, s3Sec: lap.s3 || 0,
            isBest: Boolean(driver.bestLapTime && lap.lapTime === driver.bestLapTime),
          }));
        }
      } else {
        const filenameMatch = replayName.match(/^(.+?)\s+([PQR]\d+)\b/i);
        const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';
        if (filenameTrack) metadata.trackCourse = metadata.displayTrack = metadata.trackName = filenameTrack;
      }

      if (!metadata.laps?.length) {
        try {
          const trajectory = context.replayCache.getFullTrajectory(filePath, replayName, { playerName: context.currentParser.configuredPlayerName });
          if (trajectory.laps?.length) metadata.laps = trajectory.laps;
        } catch { /* Ignore fallback errors. */ }
      }

      try {
        let fileMtime: number | undefined;
        if (fs.existsSync(filePath)) {
          try { fileMtime = fs.statSync(filePath).mtime.getTime(); } catch { /* Ignore */ }
        }
        if (fileMtime === undefined) {
          fileMtime = context.sessionDb.getStoredReplayFileInfo(replayName)?.file_mtime;
        }
        const telemetryMeta = context.sessionDb.getTelemetryMetadata();
        const matchedDuckFilename = matchDuckDbToReplay(context.telemetryCatalog.getFiles(), metadata, fileMtime)?.filename ||
          (matchedSession ? matchDuckDbToSession(context.telemetryCatalog.getFiles(), matchedSession)?.filename : undefined) ||
          telemetryMeta.find(item => item.matchedReplayFilename === replayName)?.filename ||
          (matchedSession ? telemetryMeta.find(item => item.matchedSessionId === matchedSession.id)?.filename : undefined);
        if (matchedDuckFilename) {
          metadata.hasDuckDbTelemetry = true;
          metadata.duckdbFilename = matchedDuckFilename;
        }
      } catch { /* Ignore optional telemetry matching errors. */ }
      res.json(metadata);
    } catch (error: unknown) {
      console.error(`Failed to parse replay metadata for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to parse replay metadata' });
    }
  });

  router.get('/replays/:name/trajectory', async (req, res) => {
    try {
      const replayName = req.params.name;
      if (!isSafeFileName(replayName) || !replayName.toLowerCase().endsWith('.vcr')) return res.status(400).json({ error: 'Invalid replay filename' });
      const filePath = path.join(context.replaysDir, replayName);
      let requestedDriverSlot: number;
      let requestedLapKey: number;
      try {
        requestedDriverSlot = parseBoundedInteger(req.query.driverSlot, 'driverSlot', 0, 128) ?? -1;
        requestedLapKey = parseBoundedInteger(req.query.lap, 'lap', 0, 100000) ?? -1;
      } catch (error: unknown) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid trajectory parameters' });
      }
      const maxPointsParam = req.query.maxPoints as string | undefined;
      let maxPoints = 1200;
      try {
        if (maxPointsParam !== undefined) {
          maxPoints = maxPointsParam === '0' || maxPointsParam.toLowerCase() === 'raw'
            ? 0
            : parseBoundedInteger(maxPointsParam, 'maxPoints', 1, 100000) ?? 1200;
        }
      } catch (error: unknown) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid maxPoints' });
      }
      if (!fs.existsSync(filePath) &&
          !context.sessionDb.getStoredReplayTrajectory(replayName, requestedDriverSlot, requestedLapKey) &&
          !context.sessionDb.getStoredReplayMetadata(replayName)) {
        return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      }

      let driverSlot = requestedDriverSlot >= 0 ? requestedDriverSlot : undefined;
      const driverName = (req.query.driverName as string | undefined) || (!req.query.driverSlot ? context.currentParser.configuredPlayerName : undefined);
      const lapNumber = requestedLapKey >= 0 ? requestedLapKey : undefined;
      const allowDuckDb = (req.query.source as string | undefined)?.toLowerCase() !== 'vcr';
      if (driverSlot === undefined && driverName) driverSlot = context.replayCache.resolveDriverSlot(filePath, replayName, driverName, context.currentParser.configuredPlayerName);

      let matchedSession: DetailedSession | undefined;
      let matchedDriver: DriverData | undefined;
      let duckdbUnavailableReason: string | undefined;
      try {
        matchedSession = context.loadSessions().find(session => session.matchingReplayFile?.name === replayName);
        if (matchedSession) {
          matchedDriver = driverName ? matchedSession.drivers.find(driver => (driver.driverName || driver.name || '').toLowerCase().includes(driverName.toLowerCase())) : undefined;
          if (!matchedDriver && typeof driverSlot === 'number') {
            const replayDriver = context.replayCache.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName).drivers.find(driver => driver.slot === driverSlot);
            if (replayDriver) matchedDriver = matchedSession.drivers.find(driver => (driver.driverName || driver.name || '').toLowerCase() === replayDriver.name.toLowerCase() || (replayDriver.carNumber !== undefined && driver.carNumber === replayDriver.carNumber));
          }
          if (!matchedDriver) matchedDriver = matchedSession.playerDriver || matchedSession.drivers[0];
        }
      } catch { /* Ignore session lookup errors. */ }

      const fullTrajectory = context.replayCache.getFullTrajectory(filePath, replayName, { driverSlot, driverName, lapNumber, playerName: context.currentParser.configuredPlayerName });
      let trajectory = downsampleReplayTrajectory(fullTrajectory, maxPoints);
      trajectory.source = 'vcr';
      trajectory.vcrRawPointsCount = fullTrajectory.rawPointsCount ?? fullTrajectory.points.length;
      trajectory.vcrRawSampleRateHz = fullTrajectory.rawSampleRateHz;

      let metadata: ReplayMetadata | undefined;
      try {
        metadata = context.replayCache.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName);
        const isPlayer = (driverSlot === undefined && !driverName) ||
          (driverName && driverName.toLowerCase().includes(context.currentParser.configuredPlayerName.toLowerCase())) ||
          (typeof driverSlot === 'number' && metadata.drivers?.find(driver => driver.slot === driverSlot)?.isPlayer);
        if (isPlayer && allowDuckDb) {
          let fileMtime: number | undefined;
          if (fs.existsSync(filePath)) {
            try { fileMtime = fs.statSync(filePath).mtime.getTime(); } catch { /* Ignore */ }
          }
          if (fileMtime === undefined) {
            fileMtime = context.sessionDb.getStoredReplayFileInfo(replayName)?.file_mtime;
          }
          const matchedDuck = matchDuckDbToReplay(context.telemetryCatalog.getFiles(), metadata, fileMtime) || (matchedSession ? matchDuckDbToSession(context.telemetryCatalog.getFiles(), matchedSession) : null);
          if (matchedDuck) {
            context.sessionDb.upsertTelemetryMetadata(matchedDuck, matchedSession?.id, replayName);
            trajectory.duckdbFilename = matchedDuck.filename;
            const chosenLapNum = trajectory.currentLap || lapNumber || 1;
            const targetLapTimeSec = trajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;
            let duckLap = context.sessionDb.getTelemetryLapCache(matchedDuck.filename, chosenLapNum);
            if (!duckLap) {
              const duckReader = new DuckDbReader(matchedDuck.filePath);
              try {
                await duckReader.open();
                duckLap = await duckReader.getLapTelemetry(chosenLapNum, targetLapTimeSec);
                if (duckLap) context.sessionDb.upsertTelemetryLapCache(matchedDuck.filename, chosenLapNum, duckLap);
              } catch (error) {
                console.warn(`[DuckDB] Failed to extract lap ${chosenLapNum} from ${matchedDuck.filename}:`, error);
                context.sessionDb.recordIngestError('duckdb', matchedDuck.filePath, error);
              } finally {
                try { await duckReader.close(); } catch (error) { console.warn(`[DuckDB] Failed to close ${matchedDuck.filename}:`, error); }
              }
            }
            if (duckLap) {
              trajectory.duckdbRawPointsCount = duckLap.pointsCount;
              trajectory.duckdbRawSampleRateHz = duckLap.sampleRateHz;
              const expectedLapTimeSec = targetLapTimeSec || fullTrajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;
              if (!expectedLapTimeSec || expectedLapTimeSec <= 0 || duckLap.lapTimeSec >= expectedLapTimeSec - 0.5) {
                const fused = fuseDuckDbWithVcrTrajectory(duckLap, fullTrajectory, matchedDuck.filename);
                trajectory = downsampleReplayTrajectory(fused, maxPoints);
                trajectory.vcrRawPointsCount = fullTrajectory.rawPointsCount ?? fullTrajectory.points.length;
                trajectory.vcrRawSampleRateHz = fullTrajectory.rawSampleRateHz;
                trajectory.duckdbRawPointsCount = duckLap.pointsCount;
                trajectory.duckdbRawSampleRateHz = duckLap.sampleRateHz;
              } else duckdbUnavailableReason = 'DuckDB telemetry is incomplete for this lap; using Native VCR data.';
            }
          }
        }
      } catch (error) { console.warn(`[DuckDB] Error fusing DuckDB telemetry for ${replayName}:`, error); }

      if (duckdbUnavailableReason) {
        trajectory.duckdbAvailable = false;
        trajectory.duckdbUnavailableReason = duckdbUnavailableReason;
      }
      if (matchedSession && matchedDriver?.laps?.length) {
        const officialLaps = matchedDriver.laps.map((lap: LapData) => ({ lapNumber: lap.lapNum, lapTimeSec: lap.lapTime, s1Sec: lap.s1, s2Sec: lap.s2, s3Sec: lap.s3, isValid: lap.isValid }));
        if (trajectory.laps) for (const lap of trajectory.laps) {
          const match = officialLaps.find(official => official.lapNumber === lap.lapNumber);
          if (match && typeof match.lapTimeSec === 'number' && match.lapTimeSec > 0) {
            lap.validatedTimeSec = Number(match.lapTimeSec.toFixed(3));
            lap.validatedS1Sec = typeof match.s1Sec === 'number' ? Number(match.s1Sec.toFixed(3)) : null;
            lap.validatedS2Sec = typeof match.s2Sec === 'number' ? Number(match.s2Sec.toFixed(3)) : null;
            lap.validatedS3Sec = typeof match.s3Sec === 'number' ? Number(match.s3Sec.toFixed(3)) : null;
            lap.timeDiffSec = Number((lap.lapTimeSec - match.lapTimeSec).toFixed(3));
          }
        }
        trajectory.validation = { matchedSessionId: matchedSession.id, sessionType: matchedSession.sessionType, trackName: getDisplayTrackName(matchedSession.trackVenue, matchedSession.trackCourse), driverName: matchedDriver.driverName || matchedDriver.name, totalSessionLaps: matchedSession.totalLapsCount || officialLaps.length, officialBestLapTime: matchedDriver.bestLapTime, officialLaps };
      }
      try {
        enrichTrajectoryWithTrackGeometry(
          trajectory,
          matchedSession?.trackVenue || metadata?.trackVenue,
          matchedSession?.trackCourse || metadata?.trackCourse,
          replayName,
          metadata?.sceneDesc,
          matchedSession?.trackLengthMeters
        );
      } catch (error) {
        console.warn(`[serverTrackSync] Failed to enrich trajectory for ${replayName}:`, error);
      }
      res.json(trajectory);
    } catch (error: unknown) {
      console.error(`Failed to extract replay trajectory for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract replay trajectory' });
    }
  });

  return router;
}
