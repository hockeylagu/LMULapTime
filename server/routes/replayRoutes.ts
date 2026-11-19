import { dataPlugin } from '../plugins/dataPlugin.js';
import { resolveVehicleHandling } from '../../shared/domain/vehicles/handling.js';
import path from 'path';
import { Router } from 'express';
import { ServerContext } from '../core/serverContext.js';
import { composeReplayMetadata } from '../replay/replayMetadataService.js';
import { ReplayTelemetryService } from '../replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../replay/replayTrajectoryService.js';
import { ReplayDriverNotFoundError } from '../replay/replayServiceTypes.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { RaceReplayService } from '../traffic/raceReplayService.js';
import { getReplayLapBlobs, getReplayLapSignature } from '../core/replay/dbReplayLapRows.js';
import { cornerPassLaps, readSessionCornerPasses } from '../corners/sessionCornerPasses.js';
import { raceDistancesFromPasses } from '../traffic/raceDistances.js';
import { getReplayStoredSignature } from '../core/replay/dbReplayIngestStore.js';
import { getDriverEvents, getReplayLaps, getReplayRunningOrder } from '../core/replay/dbReplayLapStore.js';
import { parseBoundedInteger, queryString } from './queryParams.js';
import { readReplaySessionContext } from '../core/sessionRows/replayContext.js';
import { hasVerifiedLiveCapture } from '../core/live/dbLiveCaptureStore.js';
import { replayDaylightClock } from '../../shared/domain/scenery/replayDaylightClock.js';
import type { ReplayDaylightClock, ReplayMetadata, ReplayTrajectoryData } from '../../shared/types/index.js';
import type { ReplaySessionContext } from '../replay/replayServiceTypes.js';
import { SAFETY_CAR_CLASS } from '../../shared/domain/vehicleMapping.js';
import { nonFinishStatus } from '../../shared/domain/raceReplay/nonFinishStatus.js';

export function createReplayRouter(context: ServerContext): Router {
  const router = Router();
  const telemetryService = new ReplayTelemetryService(context.sessionDb);
  const trajectoryService = new ReplayTrajectoryService(
    context.replaysDir,
    context.replayRecordings,
    context.currentParser,
    telemetryService
  );
  const db = () => context.sessionDb.getDb();
  const raceService = new RaceReplayService({
    getReplaySignature: filename => getReplayStoredSignature(db(), filename),
    getReplayLaps: filename => getReplayLaps(db(), filename),
    getReplayLapBlobs: (filename, laps) => getReplayLapBlobs(db(), filename, laps),
    getReplayRunningOrder: filename => getReplayRunningOrder(db(), filename),
    getReplayDriverEvents: filename => getDriverEvents(db(), filename),
  });

  router.get('/replays/cache', (_req, res) => {
    try {
      res.json(context.sessionDb.getReplayCacheList(context.replaysDir));
    } catch (error: unknown) {
      console.error('Failed to list cached replays:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list cached replays' });
    }
  });

  /** The session replay's metadata, its drivers matched to the session's drivers by name; null without a replay. */
  const sessionReplayMetadata = (sessionId: string) => {
    const session = readReplaySessionContext(context.sessionDb.getDb(), sessionId, 'all');
    const replayName = session?.matchingReplayFile?.name;
    if (!session || !replayName) return null;
    const filePath = path.join(context.replaysDir, replayName);
    const metadata = context.replayRecordings.getMetadata(filePath, replayName, context.currentParser.configuredPlayerName);
    const composed = composeReplayMetadata({
      metadata,
      replayName,
      matchedSession: session,
      duckdbFilename: TelemetryLinks.load(context.sessionDb, session.id).forSession(session),
    });
    const replayNameCounts = new Map<string, number>();
    for (const driver of composed.drivers) {
      const key = driver.name.trim().toLowerCase();
      if (key) replayNameCounts.set(key, (replayNameCounts.get(key) ?? 0) + 1);
    }
    for (const driver of composed.drivers) {
      const key = driver.name.trim().toLowerCase();
      const matches = key && replayNameCounts.get(key) === 1
        ? session.drivers.flatMap((item, ordinal) => item.name.trim().toLowerCase() === key ? [ordinal] : [])
        : [];
      if (matches.length !== 1) continue;
      const ordinal = matches[0];
      driver.sessionDriverOrdinal = session.drivers[ordinal].driverOrdinal ?? ordinal;
      const sessionLapOrdinals: Record<string, number> = {};
      session.drivers[ordinal].laps.forEach((lap, lapOrdinal) => {
        sessionLapOrdinals[String(lap.lapNumber)] = lap.lapOrdinal ?? lapOrdinal;
      });
      driver.sessionLapOrdinals = sessionLapOrdinals;
    }
    return { replayName, metadata, composed, session };
  };

  router.get('/session/:sessionId/telemetry/metadata', (req, res) => {
    try {
      const replay = sessionReplayMetadata(req.params.sessionId);
      if (!replay) return res.status(404).json({ error: 'Session replay is unavailable' });
      res.json(replay.composed);
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session telemetry metadata unavailable' });
    }
  });

  /** The lap start's in-game clock, from the session replay's race start and the lap's session start; none without a session replay. */
  const lapDaylightClock = (session: ReplaySessionContext, driverOrdinal: number, lapOrdinal: number, trajectory: ReplayTrajectoryData): ReplayDaylightClock | undefined => {
    const replayName = session.matchingReplayFile?.name;
    if (!replayName) return undefined;
    let metadata: ReplayMetadata;
    try {
      metadata = context.replayRecordings.getMetadata(path.join(context.replaysDir, replayName), replayName, context.currentParser.configuredPlayerName);
    } catch { return undefined; }
    const lap = session.drivers.find(driver => driver.driverOrdinal === driverOrdinal)?.laps.find(entry => entry.lapOrdinal === lapOrdinal);
    const sessionTimeSec = lap?.elapsedSeconds ?? (trajectory.timeReference === 'session' ? trajectory.lapStartTimeSec : undefined) ?? 0;
    return replayDaylightClock(session.sessionType, metadata.raceStartMinute, sessionTimeSec, metadata.cloudCover, metadata.cloudField, metadata.cloudVariants);
  };

  router.get('/session/:sessionId/telemetry', async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!context.sessionDb.getDb().prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
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
      const trajectorySession = readReplaySessionContext(context.sessionDb.getDb(), sessionId, driverOrdinal);
      if (!trajectorySession) return res.status(404).json({ error: 'Session not found' });
      const trajectory = await trajectoryService.getTrajectory({
        session: trajectorySession,
        driverOrdinal,
        lapOrdinal,
        maxPoints,
        pointSpacingM,
        allowDuckDb: queryString(req.query.source)?.toLowerCase() !== 'vcr',
      });
      const daylightClock = lapDaylightClock(trajectorySession, driverOrdinal, lapOrdinal, trajectory);
      res.json({ ...trajectory, ...(daylightClock ? { daylightClock } : {}),
        ...(hasVerifiedLiveCapture(context.sessionDb.getDb(), sessionId, driverOrdinal) ? { hasLiveCapture: true } : {}) });
    } catch (error: unknown) {
      if (error instanceof ReplayDriverNotFoundError) return res.status(404).json({ error: error.message });
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session telemetry unavailable' });
    }
  });

  router.get('/session/:sessionId/race', (req, res) => {
    try {
      const replay = sessionReplayMetadata(req.params.sessionId);
      if (!replay) return res.status(404).json({ error: 'Session replay is unavailable' });
      const { composed, metadata, replayName, session } = replay;
      const finishStatus = (ordinal?: number) => session.drivers.find(driver => driver.driverOrdinal === ordinal)?.finishStatus;
      res.json(raceService.getOverview({
        replayName,
        sessionType: composed.sessionType ?? metadata.sessionType,
        trackVenue: metadata.trackName,
        trackCourse: metadata.trackCourse,
        sceneDesc: metadata.sceneDesc,
        daylight: {
          raceStartMinute: metadata.raceStartMinute ?? null, cloudCover: metadata.cloudCover ?? null,
          cloudField: metadata.cloudField ?? null, cloudVariants: metadata.cloudVariants ?? null,
        },
        // The pace car runs in the replay but is no competitor.
        cars: composed.drivers.flatMap(driver => typeof driver.slot === 'number' && driver.carClass !== SAFETY_CAR_CLASS ? [{
          slot: driver.slot, name: driver.name, carClass: driver.carClass, carNumber: driver.carNumber, team: driver.team,
          vehicleId: driver.vehicleId, isPlayer: driver.isPlayer,
          handling: resolveVehicleHandling(dataPlugin.vehicle({vehicleId: driver.vehicleId, carType: driver.carType, carClass: driver.carClass}) ?? undefined),
          sessionDriverOrdinal: driver.sessionDriverOrdinal, sessionLapOrdinals: driver.sessionLapOrdinals,
          retired: nonFinishStatus(finishStatus(driver.sessionDriverOrdinal)),
        }] : []),
      }));
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Session race replay unavailable' });
    }
  });

  /** The replay's cars as the corner passes name them. */
  const replayPassCars = (replay: NonNullable<ReturnType<typeof sessionReplayMetadata>>) => replay.composed.drivers.flatMap(driver =>
    typeof driver.slot === 'number' ? [{
      slot: driver.slot, name: driver.name, carClass: driver.carClass, carNumber: driver.carNumber, sessionDriverOrdinal: driver.sessionDriverOrdinal,
    }] : []);
  /** The session replay's corner passes (every car's, or one driver's), as the corner-passes route serves them. */
  const sessionCornerPasses = (replay: NonNullable<ReturnType<typeof sessionReplayMetadata>>, slot?: number) => {
    const cars = replayPassCars(replay);
    const sessionLaps = new Map(replay.session.drivers.map(driver => [driver.driverOrdinal, driver.laps]));
    return readSessionCornerPasses({
      getReplayLapSignature: filename => getReplayLapSignature(db(), filename),
      getCornerPassBuild: filename => context.sessionDb.getCornerPassBuild(filename),
      listCornerPasses: filename => context.sessionDb.listCornerPasses(filename),
      listCornerPassLaps: filename => cornerPassLaps(getReplayLaps(db(), filename), cars, ordinal => sessionLaps.get(ordinal)),
      listContacts: filename => getDriverEvents(db(), filename).flatMap(event => event.kind === 'contact' ? [{ slot: event.driverSlot, timeSec: event.timeSec }] : []),
    }, replay.replayName, cars, slot);
  };

  // Every car's distance along the track once a second (the race view's live gaps), from the corner passes.
  router.get('/session/:sessionId/race/distances', (req, res) => {
    try {
      const replay = sessionReplayMetadata(req.params.sessionId);
      if (!replay) return res.status(404).json({ error: 'Session replay is unavailable' });
      const passes = sessionCornerPasses(replay);
      if (!passes.available) return res.status(404).json({ error: passes.reason });
      res.json(raceDistancesFromPasses(passes));
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Race progress unavailable' });
    }
  });

  router.get('/session/:sessionId/race/poses', async (req, res) => {
    let index: number;
    try {
      const parsed = parseBoundedInteger(req.query.window, 'window', 0, 100000);
      if (parsed === undefined) return res.status(400).json({ error: 'window is required' });
      index = parsed;
    } catch (error: unknown) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid window' });
    }
    try {
      const session = readReplaySessionContext(context.sessionDb.getDb(), req.params.sessionId, 'none');
      const replayName = session?.matchingReplayFile?.name;
      if (!replayName) return res.status(404).json({ error: 'Session replay is unavailable' });
      const body = await raceService.getPoseWindow(replayName, index);
      res.type('application/octet-stream').send(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Race poses unavailable' });
    }
  });

  router.get('/session/:sessionId/corner-passes', (req, res) => {
    let driverOrdinal: number | undefined;
    try {
      driverOrdinal = parseBoundedInteger(req.query.driverOrdinal, 'driverOrdinal', 0, 128);
    } catch (error: unknown) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid driverOrdinal' });
    }
    try {
      const replay = sessionReplayMetadata(req.params.sessionId);
      if (!replay) return res.status(404).json({ error: 'Session replay is unavailable' });
      const slot = driverOrdinal === undefined ? undefined : replayPassCars(replay).find(car => car.sessionDriverOrdinal === driverOrdinal)?.slot;
      if (driverOrdinal !== undefined && slot === undefined) return res.status(404).json({ error: 'The driver is not in this session replay' });
      res.json(sessionCornerPasses(replay, slot));
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Corner passes unavailable' });
    }
  });

  return router;
}
