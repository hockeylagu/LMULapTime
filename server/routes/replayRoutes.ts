import path from 'path';
import { Router } from 'express';
import { REPLAY_CACHE_VERSION } from '../core/dbSchema.js';
import { ServerContext } from '../core/serverContext.js';
import { composeReplayMetadata } from '../replay/replayMetadataService.js';
import { ReplayTelemetryService } from '../replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../replay/replayTrajectoryService.js';
import { ReplayDriverNotFoundError } from '../replay/replayServiceTypes.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { RaceTrafficService } from '../traffic/raceTrafficService.js';
import { parseBoundedInteger, queryString } from './queryParams.js';

export function createReplayRouter(context: ServerContext): Router {
  const router = Router();
  const telemetryService = new ReplayTelemetryService(context.sessionDb);
  const trajectoryService = new ReplayTrajectoryService(
    context.replaysDir,
    context.replayRecordings,
    context.currentParser,
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

  router.get('/telemetry', (_req, res) => res.json(context.telemetryCatalog.getFiles()));

  router.get('/session/:sessionId/telemetry/metadata', (req, res) => {
    try {
      const session = context.sessionDb.getSessionById(req.params.sessionId);
      const replayName = session?.matchingReplayFile?.name;
      if (!session || !replayName) return res.status(404).json({ error: 'Session replay is unavailable' });
      const filePath = path.join(context.replaysDir, replayName);
      const metadata = context.replayRecordings.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName);
      const composed = composeReplayMetadata({
        metadata,
        replayName,
        matchedSession: session,
        duckdbFilename: TelemetryLinks.load(context.sessionDb, session.id).forSession(session),
      });
      for (const driver of composed.drivers) {
        const ordinal = session.drivers.findIndex(item =>
          (item.driverName || item.name).trim().toLowerCase() === driver.name.trim().toLowerCase()
        );
        if (ordinal < 0) continue;
        driver.sessionDriverOrdinal = ordinal;
        const sessionLapOrdinals: Record<string, number> = {};
        session.drivers[ordinal].laps.forEach((lap, lapOrdinal) => {
          sessionLapOrdinals[String(lap.lapNum)] = lapOrdinal;
        });
        driver.sessionLapOrdinals = sessionLapOrdinals;
      }
      res.json(composed);
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session telemetry metadata unavailable' });
    }
  });

  router.get('/session/:sessionId/telemetry', async (req, res) => {
    const session = context.sessionDb.getSessionById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    let driverOrdinal: number;
    let lapOrdinal: number;
    try {
      const parsedDriverOrdinal = parseBoundedInteger(req.query.driverOrdinal, 'driverOrdinal', 0, 128);
      const parsedLapOrdinal = parseBoundedInteger(req.query.lapOrdinal, 'lapOrdinal', 0, 100000);
      if (parsedDriverOrdinal === undefined || parsedLapOrdinal === undefined) {
        return res.status(400).json({ error: 'driverOrdinal and lapOrdinal are required' });
      }
      driverOrdinal = parsedDriverOrdinal;
      lapOrdinal = parsedLapOrdinal;
    } catch (error: unknown) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid telemetry locator' });
    }
    let maxPoints = 1200;
    try {
      const value = queryString(req.query.maxPoints);
      if (value !== undefined) maxPoints = value === '0' || value.toLowerCase() === 'raw'
        ? 0 : parseBoundedInteger(value, 'maxPoints', 1, 100000) ?? 1200;
    } catch (error: unknown) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid maxPoints' });
    }
    let pointSpacingM: number | undefined;
    const spacing = queryString(req.query.pointSpacingM);
    if (spacing !== undefined) {
      pointSpacingM = /^\d+(\.\d+)?$/.test(spacing) ? Number(spacing) : NaN;
      if (!(pointSpacingM >= 0.25 && pointSpacingM <= 100)) return res.status(400).json({ error: 'Invalid pointSpacingM' });
    }
    try {
      const trajectory = await trajectoryService.getTrajectory({
        session,
        driverOrdinal,
        lapOrdinal,
        maxPoints,
        pointSpacingM,
        allowDuckDb: queryString(req.query.source)?.toLowerCase() !== 'vcr',
      });
      res.json(trajectory);
    } catch (error: unknown) {
      if (error instanceof ReplayDriverNotFoundError) return res.status(404).json({ error: error.message });
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session telemetry unavailable' });
    }
  });

  router.get('/session/:sessionId/traffic', async (req, res) => {
    try {
      const session = context.sessionDb.getSessionById(req.params.sessionId);
      const replayName = session?.matchingReplayFile?.name;
      if (!session || !replayName) return res.status(404).json({ error: 'Session replay is unavailable' });
      const filePath = path.join(context.replaysDir, replayName);
      const playerName = context.currentParser.configuredPlayerName;
      const driverName = queryString(req.query.driverName) || playerName;
      const driverSlot = context.replayRecordings.resolveDriverSlot(filePath, replayName, driverName, playerName);
      if (driverSlot === undefined) return res.status(404).json({ error: `Driver "${driverName}" is not in this session replay` });
      const metadata = context.replayRecordings.getMetadata(filePath, replayName, playerName);
      res.json(await trafficService.getDriverTraffic({
        replayName,
        driverSlot,
        replayDrivers: metadata.drivers.flatMap(driver => typeof driver.slot === 'number'
          ? [{ slot: driver.slot, name: driver.name, carClass: driver.carClass }] : []),
        session,
        sceneDesc: metadata.sceneDesc,
        trackVenue: metadata.trackName,
        trackCourse: metadata.trackCourse,
      }));
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session traffic unavailable' });
    }
  });

  return router;
}
