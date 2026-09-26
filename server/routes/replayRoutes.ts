import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { ServerContext } from '../core/serverContext.js';
import { buildReplayListSummaries, composeReplayMetadata } from '../replay/replayMetadataService.js';
import { ReplayTelemetryService } from '../replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../replay/replayTrajectoryService.js';

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
  const telemetryService = new ReplayTelemetryService(context.sessionDb, context.telemetryCatalog);
  const trajectoryService = new ReplayTrajectoryService(
    context.replaysDir,
    context.replayCache,
    context.currentParser,
    context.loadSessions,
    telemetryService
  );

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
      const sessions = context.loadSessions();
      const duckFiles = context.telemetryCatalog.getFiles();
      const telemetryMeta = context.sessionDb.getTelemetryMetadata();

      const summaries = buildReplayListSummaries({
        diskFiles,
        storedReplays,
        replaysDir: context.replaysDir,
        sessions,
        duckFiles,
        telemetryMeta,
        getMetadata: (filePath, filename) => context.replayCache.getMetadata(filePath, filename),
      });

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
      if (!isSafeFileName(replayName) || !replayName.toLowerCase().endsWith('.vcr')) {
        return res.status(400).json({ error: 'Invalid replay filename' });
      }
      const filePath = path.join(context.replaysDir, replayName);
      if (!fs.existsSync(filePath) && !context.sessionDb.getStoredReplayMetadata(replayName)) {
        return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      }

      const rawMetadata = context.replayCache.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName);
      const sessions = context.loadSessions();
      const matchedSession = sessions.find(session => session.matchingReplayFile?.name === replayName);

      let fileMtime: number | undefined;
      if (fs.existsSync(filePath)) {
        try {
          fileMtime = fs.statSync(filePath).mtime.getTime();
        } catch {
          // Ignore stat failure
        }
      }
      if (fileMtime === undefined) {
        fileMtime = context.sessionDb.getStoredReplayFileInfo(replayName)?.file_mtime;
      }

      const duckFiles = context.telemetryCatalog.getFiles();
      const telemetryMeta = context.sessionDb.getTelemetryMetadata();

      const metadata = composeReplayMetadata({
        metadata: rawMetadata,
        replayName,
        matchedSession,
        fallbackTrajectoryLaps: () => {
          const trajectory = context.replayCache.getFullTrajectory(filePath, replayName, {
            playerName: context.currentParser.configuredPlayerName,
          });
          return trajectory.laps;
        },
        duckFiles,
        telemetryMeta,
        fileMtime,
      });

      res.json(metadata);
    } catch (error: unknown) {
      console.error(`Failed to parse replay metadata for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to parse replay metadata' });
    }
  });

  router.get('/replays/:name/trajectory', async (req, res) => {
    try {
      const replayName = req.params.name;
      if (!isSafeFileName(replayName) || !replayName.toLowerCase().endsWith('.vcr')) {
        return res.status(400).json({ error: 'Invalid replay filename' });
      }
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

      if (
        !fs.existsSync(filePath) &&
        !context.sessionDb.getStoredReplayTrajectory(replayName, requestedDriverSlot, requestedLapKey, { allowFallback: true }) &&
        !context.sessionDb.getStoredReplayMetadata(replayName)
      ) {
        return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      }

      const driverSlot = requestedDriverSlot >= 0 ? requestedDriverSlot : undefined;
      const driverName = (req.query.driverName as string | undefined) || (!req.query.driverSlot ? context.currentParser.configuredPlayerName : undefined);
      const lapNumber = requestedLapKey >= 0 ? requestedLapKey : undefined;
      const allowDuckDb = (req.query.source as string | undefined)?.toLowerCase() !== 'vcr';

      const trajectory = await trajectoryService.getTrajectory({
        replayName,
        driverSlot,
        driverName,
        lapNumber,
        maxPoints,
        allowDuckDb,
      });

      res.json(trajectory);
    } catch (error: unknown) {
      console.error(`Failed to extract replay trajectory for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract replay trajectory' });
    }
  });

  return router;
}
