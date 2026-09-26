import fs from 'fs';
import path from 'path';
import { DetailedSession, DriverData, ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
import { ReplayCacheService } from './replayCacheService.js';
import { ReplayTelemetryService } from './replayTelemetryService.js';
import { ReplayTrajectoryRequest } from './replayServiceTypes.js';
import { composeReplayMetadata } from './replayMetadataService.js';
import {
  applyPureOfficialLapValidation,
  downsampleTrajectoryResponse,
  enrichTrajectoryGeometryResponse,
} from './replayTransforms.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';

export class ReplayTrajectoryService {
  public constructor(
    private readonly replaysDir: string,
    private readonly replayCache: ReplayCacheService,
    private readonly currentParser: { configuredPlayerName: string },
    private readonly loadSessions: () => DetailedSession[],
    private readonly telemetryService: ReplayTelemetryService
  ) {}

  public async getTrajectory(request: ReplayTrajectoryRequest): Promise<ReplayTrajectoryData> {
    const filePath = path.join(this.replaysDir, request.replayName);
    let driverSlot = request.driverSlot;
    const configuredPlayer = this.currentParser.configuredPlayerName;
    const driverName = request.driverName || (request.driverSlot === undefined ? configuredPlayer : undefined);

    if (driverSlot === undefined && driverName) {
      driverSlot = this.replayCache.resolveDriverSlot(filePath, request.replayName, driverName, configuredPlayer);
    }

    let matchedSession: DetailedSession | undefined;
    let matchedDriver: DriverData | undefined;
    try {
      matchedSession = this.loadSessions().find(session => session.matchingReplayFile?.name === request.replayName);
      if (matchedSession) {
        matchedDriver = driverName
          ? matchedSession.drivers.find(driver =>
              (driver.driverName || driver.name || '').toLowerCase().includes(driverName.toLowerCase())
            )
          : undefined;

        if (!matchedDriver && typeof driverSlot === 'number') {
          const replayDriver = this.replayCache
            .getMetadata(filePath, request.replayName, configuredPlayer)
            .drivers.find(driver => driver.slot === driverSlot);

          if (replayDriver) {
            matchedDriver = matchedSession.drivers.find(
              driver =>
                (driver.driverName || driver.name || '').toLowerCase() === replayDriver.name.toLowerCase() ||
                (replayDriver.carNumber !== undefined && driver.carNumber === replayDriver.carNumber)
            );
          }
        }

        if (!matchedDriver) {
          matchedDriver = matchedSession.playerDriver || matchedSession.drivers[0];
        }
      }
    } catch {
      // Ignore session lookup errors
    }

    const fullTrajectory = this.replayCache.getFullTrajectory(filePath, request.replayName, {
      driverSlot,
      driverName,
      lapNumber: request.lapNumber,
      playerName: configuredPlayer,
    });

    let trajectory = downsampleTrajectoryResponse(fullTrajectory, request.maxPoints);
    trajectory.source = 'vcr';
    trajectory.vcrRawPointsCount = fullTrajectory.rawPointsCount ?? fullTrajectory.points.length;
    trajectory.vcrRawSampleRateHz = fullTrajectory.rawSampleRateHz;

    let metadata: ReplayMetadata | undefined;
    try {
      const rawMetadata = this.replayCache.getMetadata(filePath, request.replayName, configuredPlayer);
      let fileMtime: number | undefined;
      if (fs.existsSync(filePath)) {
        try {
          fileMtime = fs.statSync(filePath).mtime.getTime();
        } catch {
          // Ignore stat failure
        }
      }
      metadata = composeReplayMetadata({
        metadata: rawMetadata,
        replayName: request.replayName,
        matchedSession,
        duckFiles: this.telemetryService.getFiles(),
        telemetryMeta: this.telemetryService.getTelemetryMeta(),
        fileMtime,
      });
    } catch {
      // Ignore metadata read failure
    }

    const isPlayer =
      (driverSlot === undefined && !driverName) ||
      Boolean(driverName && driverName.toLowerCase().includes(configuredPlayer.toLowerCase())) ||
      (typeof driverSlot === 'number' && metadata?.drivers?.find(driver => driver.slot === driverSlot)?.isPlayer);

    const telemetryResult = await this.telemetryService.enrichWithTelemetry({
      replayName: request.replayName,
      filePath,
      isPlayer: Boolean(isPlayer),
      allowDuckDb: request.allowDuckDb,
      metadata,
      matchedSession,
      fullTrajectory,
      currentTrajectory: trajectory,
      lapNumber: request.lapNumber,
      maxPoints: request.maxPoints,
    });
    trajectory = telemetryResult.trajectory;

    trajectory = applyPureOfficialLapValidation(trajectory, matchedSession, matchedDriver);

    const venue = matchedSession?.trackVenue || metadata?.trackVenue;
    const course = matchedSession?.trackCourse || metadata?.trackCourse;
    const sceneDesc = metadata?.sceneDesc;
    const trackLengthMeters = matchedSession?.trackLengthMeters;

    try {
      trajectory = enrichTrajectoryGeometryResponse(
        trajectory,
        venue,
        course,
        request.replayName,
        sceneDesc,
        trackLengthMeters
      );
    } catch (error) {
      console.warn(`[serverTrackSync] Failed to enrich trajectory for ${request.replayName}:`, error);
    }

    if (!trajectory.layoutKey) {
      const circuitSpec = getCircuitSpecification(venue, course, sceneDesc, request.replayName, null, trackLengthMeters);
      if (circuitSpec.layoutKey !== 'unknown') {
        trajectory.layoutKey = circuitSpec.layoutKey;
      }
    }

    return trajectory;
  }
}
