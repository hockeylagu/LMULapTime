import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { REPLAY_CACHE_VERSION } from '../core/dbSchema.js';
import { ServerContext } from '../core/serverContext.js';
import { buildReplayListSummaries, composeReplayMetadata } from '../replay/replayMetadataService.js';
import { ReplayTelemetryService } from '../replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../replay/replayTrajectoryService.js';
import { ReplayDriverNotFoundError } from '../replay/replayServiceTypes.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { RaceTrafficService } from '../traffic/raceTrafficService.js';
import { parseBoundedInteger, queryString } from './queryParams.js';

function isSafeFileName(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && path.basename(value) === value && !value.includes('\0');
}

export function createReplayRouter(context: ServerContext): Router {
  const router = Router();
  const telemetryService = new ReplayTelemetryService(context.sessionDb);
  const trajectoryService = new ReplayTrajectoryService(
    context.replaysDir,
    context.replayCache,
    context.currentParser,
    () => context.loadSessions(),
    telemetryService
  );
  const trafficService = new RaceTrafficService(context.sessionDb);

  router.get('/replays/cache', (_req, res) => {
    try {
      res.json(context.sessionDb.getReplayCacheList(context.replaysDir));
    } catch (error: unknown) {
      console.error('Failed to list cached replays:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list cached replays' });
    }
  });

  // The on-disk replays still to be decoded again at the current parser version, and the job doing it.
  router.get('/replays/upgrade', (_req, res) => {
    const upgrade = context.replayUpgrade;
    if (!upgrade) return res.status(503).json({ error: 'Replay upgrade unavailable' });
    const backlog = upgrade.getBacklog(context.replaysDir);
    res.json({
      status: upgrade.getStatus(),
      // The version an on-disk replay must be at; below it the replay is outdated and waits for the upgrade.
      currentVersion: REPLAY_CACHE_VERSION,
      pendingReplays: backlog.length,
      pendingDrivers: backlog.reduce((sum, replay) => sum + replay.driverSlots.length, 0),
      backlog: backlog.map(({ filename, metadataOutdated, driverSlots }) => ({ filename, metadataOutdated, driverSlots })),
    });
  });

  router.post('/replays/upgrade', (req, res) => {
    const upgrade = context.replayUpgrade;
    if (!upgrade) return res.status(503).json({ error: 'Replay upgrade unavailable' });
    const enabled: unknown = req.body?.enabled;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Expected { enabled: boolean }' });
    upgrade.setEnabled(enabled);
    if (enabled) context.startReplayUpgradeWhenIdle();
    res.json({ status: upgrade.getStatus() });
  });

  router.get('/replays', (_req, res) => {
    try {
      const diskFiles = (fs.existsSync(context.replaysDir) ? fs.readdirSync(context.replaysDir) : [])
        .filter(file => file.toLowerCase().endsWith('.vcr'));
      const storedReplays = context.sessionDb.getAllStoredReplayFiles();
      const sessions = context.loadSessions();

      const summaries = buildReplayListSummaries({
        diskFiles,
        storedReplays,
        replaysDir: context.replaysDir,
        sessions,
        telemetryLinks: TelemetryLinks.load(context.sessionDb),
        getMetadata: (filePath, filename) => context.replayCache.getMetadata(filePath, filename),
      });

      res.json(summaries);
    } catch (error: unknown) {
      console.error('Failed to list replays:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list replays' });
    }
  });

  router.get('/telemetry', (_req, res) => res.json(context.telemetryCatalog.getFiles()));

  router.get('/replays/:name/metadata', async (req, res) => {
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

      // Metadata without laps borrows them from the player's trajectory (decoded in the worker if needed).
      const fallbackLaps = rawMetadata.laps?.length
        ? undefined
        : await context.replayCache.getFullTrajectory(filePath, replayName, { playerName: context.currentParser.configuredPlayerName })
          .then(trajectory => trajectory.laps)
          .catch(() => undefined);

      const metadata = composeReplayMetadata({
        metadata: rawMetadata,
        replayName,
        matchedSession,
        fallbackTrajectoryLaps: () => fallbackLaps,
        duckdbFilename: TelemetryLinks.load(context.sessionDb).forReplay(replayName, matchedSession),
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

      const maxPointsParam = queryString(req.query.maxPoints);
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
      // One point per this many metres of the lap; takes precedence over maxPoints.
      const pointSpacingParam = req.query.pointSpacingM;
      let pointSpacingM: number | undefined;
      if (pointSpacingParam !== undefined) {
        pointSpacingM = typeof pointSpacingParam === 'string' && /^\d+(\.\d+)?$/.test(pointSpacingParam) ? Number(pointSpacingParam) : NaN;
        if (!(pointSpacingM >= 0.25 && pointSpacingM <= 100)) return res.status(400).json({ error: 'Invalid pointSpacingM' });
      }

      if (
        !fs.existsSync(filePath) &&
        !context.sessionDb.getStoredReplayTrajectory(replayName, requestedDriverSlot, requestedLapKey, { allowFallback: true }) &&
        !context.sessionDb.getStoredReplayMetadata(replayName)
      ) {
        return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      }

      const driverSlot = requestedDriverSlot >= 0 ? requestedDriverSlot : undefined;
      const driverName = queryString(req.query.driverName) || (!req.query.driverSlot ? context.currentParser.configuredPlayerName : undefined);
      const lapNumber = requestedLapKey >= 0 ? requestedLapKey : undefined;
      const allowDuckDb = queryString(req.query.source)?.toLowerCase() !== 'vcr';

      const trajectory = await trajectoryService.getTrajectory({
        replayName,
        driverSlot,
        driverName,
        lapNumber,
        maxPoints,
        pointSpacingM,
        allowDuckDb,
      });

      res.json(trajectory);
    } catch (error: unknown) {
      if (error instanceof ReplayDriverNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error(`Failed to extract replay trajectory for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract replay trajectory' });
    }
  });

  // Who was close to a driver on the road, lap by lap. The first request for a replay builds its
  // positions index on a worker thread (seconds); later ones read the stored index.
  router.get('/replays/:name/traffic', async (req, res) => {
    try {
      const replayName = req.params.name;
      if (!isSafeFileName(replayName) || !replayName.toLowerCase().endsWith('.vcr')) {
        return res.status(400).json({ error: 'Invalid replay filename' });
      }
      const filePath = path.join(context.replaysDir, replayName);
      const playerName = context.currentParser.configuredPlayerName;
      if (!fs.existsSync(filePath) && !context.sessionDb.getStoredReplayMetadata(replayName)) {
        return res.status(404).json({ error: `Replay file "${replayName}" not found` });
      }
      const driverName = queryString(req.query.driverName) || playerName;
      const driverSlot = context.replayCache.resolveDriverSlot(filePath, replayName, driverName, playerName);
      if (driverSlot === undefined) {
        return res.status(404).json({ error: `Driver "${driverName}" is not in replay "${replayName}"` });
      }
      const metadata = context.replayCache.getMetadata(filePath, replayName, playerName);
      const session = context.loadSessions().find(s => s.matchingReplayFile?.name === replayName);

      res.json(await trafficService.getDriverTraffic({
        replayName,
        driverSlot,
        replayDrivers: metadata.drivers.flatMap(d => (typeof d.slot === 'number' ? [{ slot: d.slot, name: d.name, carClass: d.carClass }] : [])),
        session,
        sceneDesc: metadata.sceneDesc,
        trackVenue: metadata.trackName,
        trackCourse: metadata.trackCourse,
      }));
    } catch (error: unknown) {
      console.error(`Failed to find traffic for ${req.params.name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to find traffic' });
    }
  });

  return router;
}
