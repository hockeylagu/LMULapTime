import path from 'path';
import { dataPlugin } from '../plugins/dataPlugin.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
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
    const replayName = matchedSession.matchingReplayFile?.name;
    if (!replayName) throw new Error(`Session "${matchedSession.id}" has no linked replay`);
    const matchedDriver = matchedSession.drivers[request.driverOrdinal];
    const recordingLap = matchedDriver?.laps[request.lapOrdinal];
    if (!matchedDriver || !recordingLap) throw new Error('Invalid session driver or lap locator');
    const filePath = path.join(this.replaysDir, replayName);
    const configuredPlayer = this.currentParser.configuredPlayerName;
    const driverName = matchedDriver.driverName || matchedDriver.name;
    const driverSlot = this.replayRecordings.resolveDriverSlot(filePath, replayName, driverName, configuredPlayer);
    if (driverSlot === undefined && driverName.trim().toLowerCase() !== configuredPlayer.trim().toLowerCase()) {
      throw new ReplayDriverNotFoundError(driverName, replayName);
    }

    const fullTrajectory = await this.replayRecordings.getFullTrajectory(filePath, replayName, {
      driverSlot,
      driverName,
      lapNumber: recordingLap.lapNum,
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
      const rawMetadata = this.replayRecordings.getMetadata(filePath, replayName, configuredPlayer);
      metadata = composeReplayMetadata({
        metadata: rawMetadata,
        replayName,
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
      sessionId: matchedSession.id,
      isPlayer: Boolean(isPlayer),
      allowDuckDb: request.allowDuckDb,
      metadata,
      matchedSession,
      fullTrajectory,
      currentTrajectory: trajectory,
      lapNumber: recordingLap.lapNum,
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
        replayName,
        sceneDesc,
        trackLengthMeters
      );
    } catch (error) {
      console.warn(`[serverTrackSync] Failed to enrich trajectory for ${replayName}:`, error);
    }

    stripLapEdgeSamples(trajectory);
    const pointBudget = request.pointSpacingM
      ? pointBudgetForSpacing(trajectory.points, trajectory.trackLengthM, request.pointSpacingM)
      : request.maxPoints;
    trajectory = downsampleTrajectoryResponse(trajectory, pointBudget);

    if (!trajectory.layoutKey) {
      const circuitSpec = getCircuitSpecification(venue, course, sceneDesc, replayName, null, trackLengthMeters);
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
    trajectory.sessionId = matchedSession.id;
    trajectory.driverOrdinal = request.driverOrdinal;
    trajectory.lapOrdinal = request.lapOrdinal;
    return trajectory;
  }
}
