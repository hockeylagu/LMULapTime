import path from 'path';
import { dataPlugin } from '../plugins/dataPlugin.js';
import { DetailedSession, DriverData, ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
import { ReplayRecordingService } from './replayRecordingService.js';
import { ReplayTelemetryService } from './replayTelemetryService.js';
import { ReplayDriverNotFoundError, ReplayTrajectoryRequest } from './replayServiceTypes.js';
import { composeReplayMetadata } from './replayMetadataService.js';
import {
  applyPureOfficialLapValidation,
  downsampleTrajectoryResponse,
  enrichTrajectoryGeometryResponse,
} from './decode/replayTransforms.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { stripLapEdgeSamples } from '../tracks/serverTrackSync.js';
import { pointBudgetForSpacing } from './decode/trajectoryDownsampler.js';

export class ReplayTrajectoryService {
  public constructor(
    private readonly replaysDir: string,
    private readonly replayRecordings: ReplayRecordingService,
    private readonly currentParser: { configuredPlayerName: string },
    private readonly telemetryService: ReplayTelemetryService
  ) {}

  public async getTrajectory(request: ReplayTrajectoryRequest): Promise<ReplayTrajectoryData> {
    const matchedSession = request.session;
    let sessionDriverForLocator: DriverData | undefined;
    if (matchedSession && request.driverOrdinal !== undefined && request.lapOrdinal !== undefined) {
      request.sessionId = matchedSession.id;
    }
    if (matchedSession) {
      const replayName = matchedSession.matchingReplayFile?.name;
      if (!replayName) throw new Error(`Session "${request.sessionId}" has no linked replay`);
      const recordingDriver = request.driverOrdinal === undefined ? undefined : matchedSession.drivers[request.driverOrdinal];
      const recordingLap = request.lapOrdinal === undefined ? undefined : recordingDriver?.laps[request.lapOrdinal];
      if (!recordingDriver || !recordingLap) throw new Error('Invalid session driver or lap locator');
      sessionDriverForLocator = recordingDriver;
      request = {
        ...request,
        replayName,
        driverName: recordingDriver.driverName || recordingDriver.name,
        lapNumber: recordingLap.lapNum,
      };
    }
    const filePath = path.join(this.replaysDir, request.replayName);
    let driverSlot = request.driverSlot;
    const configuredPlayer = this.currentParser.configuredPlayerName;
    const driverName = request.driverName || (request.driverSlot === undefined ? configuredPlayer : undefined);

    if (driverSlot === undefined && driverName) {
      driverSlot = this.replayRecordings.resolveDriverSlot(filePath, request.replayName, driverName, configuredPlayer);
      // An explicitly named driver who is not in this replay must not silently fall back to the
      // player's car: the caller would render someone else's lap under that driver's name.
      const isOtherDriver = Boolean(request.driverName) &&
        request.driverName?.toLowerCase() !== configuredPlayer.toLowerCase();
      if (driverSlot === undefined && isOtherDriver && request.driverName) {
        throw new ReplayDriverNotFoundError(request.driverName, request.replayName);
      }
    }

    let resolvedSession: DetailedSession | undefined = matchedSession;
    let matchedDriver: DriverData | undefined;
    try {
      if (resolvedSession) {
        matchedDriver = sessionDriverForLocator ?? (driverName
          ? resolvedSession.drivers.find(driver =>
              (driver.driverName || driver.name || '').trim().toLowerCase() === driverName.trim().toLowerCase()
            )
          : undefined);

        if (!matchedDriver && typeof driverSlot === 'number') {
          const replayDriver = this.replayRecordings
            .getMetadata(filePath, request.replayName, configuredPlayer)
            .drivers.find(driver => driver.slot === driverSlot);

          if (replayDriver) {
            matchedDriver = resolvedSession.drivers.find(
              driver =>
                (driver.driverName || driver.name || '').toLowerCase() === replayDriver.name.toLowerCase() ||
                (replayDriver.carNumber !== undefined && driver.carNumber === replayDriver.carNumber)
            );
          }
        }

        if (!matchedDriver && !request.driverName) {
          matchedDriver = resolvedSession.playerDriver || resolvedSession.drivers[0];
        }
      }
    } catch {
      // Ignore session lookup errors
    }

    const fullTrajectory = await this.replayRecordings.getFullTrajectory(filePath, request.replayName, {
      driverSlot,
      driverName,
      lapNumber: request.lapNumber,
      playerName: configuredPlayer,
    });

    // Kept at full resolution until the lap has been projected on the track and cut at the line.
    let trajectory: ReplayTrajectoryData = {
      ...fullTrajectory,
      source: 'vcr',
      vcrRawPointsCount: fullTrajectory.rawPointsCount ?? fullTrajectory.points.length,
      vcrRawSampleRateHz: fullTrajectory.rawSampleRateHz,
    };

    let metadata: ReplayMetadata | undefined;
    try {
      const rawMetadata = this.replayRecordings.getMetadata(filePath, request.replayName, configuredPlayer);
      metadata = composeReplayMetadata({
        metadata: rawMetadata,
        replayName: request.replayName,
        matchedSession,
      });
    } catch {
      // Ignore metadata read failure
    }

    const isPlayer =
      (driverSlot === undefined && !driverName) ||
      (typeof driverSlot === 'number'
        ? metadata?.drivers?.find(driver => driver.slot === driverSlot)?.isPlayer
        : Boolean(driverName && configuredPlayer && driverName.trim().toLowerCase() === configuredPlayer.trim().toLowerCase()));

    const telemetryResult = await this.telemetryService.enrichWithTelemetry({
      sessionId: request.sessionId,
      replayName: request.replayName,
      filePath,
      isPlayer: Boolean(isPlayer),
      allowDuckDb: request.allowDuckDb,
      metadata,
      matchedSession,
      fullTrajectory,
      currentTrajectory: trajectory,
      lapNumber: request.lapNumber,
    });
    trajectory = telemetryResult.trajectory;

    trajectory = applyPureOfficialLapValidation(trajectory, resolvedSession, matchedDriver);

    const venue = resolvedSession?.trackVenue || metadata?.trackVenue;
    const course = resolvedSession?.trackCourse || metadata?.trackCourse;
    const sceneDesc = metadata?.sceneDesc;
    const trackLengthMeters = resolvedSession?.trackLengthMeters;

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

    stripLapEdgeSamples(trajectory);
    const pointBudget = request.pointSpacingM
      ? pointBudgetForSpacing(trajectory.points, trajectory.trackLengthM, request.pointSpacingM)
      : request.maxPoints;
    trajectory = downsampleTrajectoryResponse(trajectory, pointBudget);

    if (!trajectory.layoutKey) {
      const circuitSpec = getCircuitSpecification(venue, course, sceneDesc, request.replayName, null, trackLengthMeters);
      if (circuitSpec.layoutKey !== 'unknown') {
        trajectory.layoutKey = circuitSpec.layoutKey;
      }
    }

    const selectedSlot=trajectory.driverSlot ?? driverSlot;
    const selectedDriver=selectedSlot !== undefined ? metadata?.drivers.find(d=>d.slot===selectedSlot)
      : metadata?.drivers.find(d=>d.name===trajectory.driverName);
    trajectory.vehicleIdentity=selectedDriver ? {vehicleId:selectedDriver.vehicleId,carModel:selectedDriver.carModel,carClass:selectedDriver.carClass}:undefined;
    trajectory.vehicleData=selectedDriver ? dataPlugin.vehicle(selectedDriver) ?? undefined : undefined;
    trajectory.dataPluginRevision=dataPlugin.status.revision;
    if (matchedSession && request.driverOrdinal !== undefined && request.lapOrdinal !== undefined) {
      trajectory.sessionId = matchedSession.id;
      trajectory.driverOrdinal = request.driverOrdinal;
      trajectory.lapOrdinal = request.lapOrdinal;
    }
    return trajectory;
  }
}
