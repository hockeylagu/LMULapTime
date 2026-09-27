import { DetailedSession, ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
import { SessionDatabase } from '../core/db.js';
import { DuckDbReader } from '../telemetry/duckdbReader.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { fuseDuckDbWithVcrTrajectory } from '../telemetry/telemetryFusion.js';

export interface TelemetryEnrichmentInput {
  replayName: string;
  filePath: string;
  isPlayer: boolean;
  allowDuckDb: boolean;
  metadata?: ReplayMetadata;
  matchedSession?: DetailedSession;
  fullTrajectory: ReplayTrajectoryData;
  currentTrajectory: ReplayTrajectoryData;
  lapNumber?: number;
}

export interface TelemetryEnrichmentResult {
  trajectory: ReplayTrajectoryData;
  duckdbUnavailableReason?: string;
  fused: boolean;
}

export class ReplayTelemetryService {
  public constructor(private readonly sessionDb: SessionDatabase) {}

  public async enrichWithTelemetry(input: TelemetryEnrichmentInput): Promise<TelemetryEnrichmentResult> {
    let trajectory = input.currentTrajectory;
    let duckdbUnavailableReason: string | undefined;
    let fused = false;

    if (!input.isPlayer || !input.allowDuckDb || !input.metadata) {
      return { trajectory, fused };
    }

    try {
      // The stored match only (see telemetry/telemetryLinks): the session's file, else the replay's.
      const links = TelemetryLinks.load(this.sessionDb);
      const matchedFilename = links.forReplay(input.replayName, input.matchedSession);
      const matchedDuck = matchedFilename ? links.row(matchedFilename) : undefined;

      if (matchedDuck) {
        trajectory.duckdbFilename = matchedDuck.filename;

        const chosenLapNum = trajectory.currentLap || input.lapNumber || 1;
        const targetLapTimeSec = trajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;

        let duckLap = this.sessionDb.getTelemetryLapCache(matchedDuck.filename, chosenLapNum);
        if (!duckLap && !links.isOnDisk(matchedDuck.filename)) {
          duckdbUnavailableReason = 'The DuckDB file of this session was deleted before this lap was read; using Native VCR data.';
        } else if (!duckLap) {
          const duckReader = new DuckDbReader(matchedDuck.filePath);
          try {
            await duckReader.open();
            duckLap = await duckReader.getLapTelemetry(chosenLapNum, targetLapTimeSec);
            if (duckLap) {
              this.sessionDb.upsertTelemetryLapCache(matchedDuck.filename, chosenLapNum, duckLap);
            }
          } catch (error) {
            console.warn(`[DuckDB] Failed to extract lap ${chosenLapNum} from ${matchedDuck.filename}:`, error);
            this.sessionDb.recordIngestError('duckdb', matchedDuck.filePath, error);
          } finally {
            try {
              await duckReader.close();
            } catch (error) {
              console.warn(`[DuckDB] Failed to close ${matchedDuck.filename}:`, error);
            }
          }
        }

        if (duckLap) {
          trajectory.duckdbRawPointsCount = duckLap.pointsCount;
          trajectory.duckdbRawSampleRateHz = duckLap.sampleRateHz;

          const expectedLapTimeSec =
            targetLapTimeSec ||
            input.fullTrajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;

          if (!expectedLapTimeSec || expectedLapTimeSec <= 0 || duckLap.lapTimeSec >= expectedLapTimeSec - 0.5) {
            const fusedTrajectory = fuseDuckDbWithVcrTrajectory(duckLap, input.fullTrajectory, matchedDuck.filename);
            // Full resolution: the caller projects and cuts the lap before downsampling it.
            trajectory = fusedTrajectory;
            trajectory.vcrRawPointsCount = input.fullTrajectory.rawPointsCount ?? input.fullTrajectory.points.length;
            trajectory.vcrRawSampleRateHz = input.fullTrajectory.rawSampleRateHz;
            trajectory.duckdbRawPointsCount = duckLap.pointsCount;
            trajectory.duckdbRawSampleRateHz = duckLap.sampleRateHz;
            fused = true;
          } else {
            duckdbUnavailableReason = 'DuckDB telemetry is incomplete for this lap; using Native VCR data.';
          }
        }
      }
    } catch (error) {
      console.warn(`[DuckDB] Error fusing DuckDB telemetry for ${input.replayName}:`, error);
    }

    if (duckdbUnavailableReason) {
      trajectory.duckdbAvailable = false;
      trajectory.duckdbUnavailableReason = duckdbUnavailableReason;
    }

    return { trajectory, duckdbUnavailableReason, fused };
  }
}
