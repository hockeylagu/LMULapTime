import fs from 'fs';
import { DetailedSession, ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
import { SessionDatabase } from '../core/db.js';
import { TelemetryCatalog } from '../telemetry/telemetryCatalog.js';
import { DuckDbReader } from '../telemetry/duckdbReader.js';
import { matchDuckDbToReplay, matchDuckDbToSession } from '../telemetry/telemetryMatcher.js';
import { fuseDuckDbWithVcrTrajectory } from '../telemetry/telemetryFusion.js';
import { matchesTrack } from '../../shared/domain/paceCategory.js';
import { downsampleTrajectoryResponse } from './replayTransforms.js';

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
  maxPoints?: number;
}

export interface TelemetryEnrichmentResult {
  trajectory: ReplayTrajectoryData;
  duckdbUnavailableReason?: string;
  fused: boolean;
}

export class ReplayTelemetryService {
  public constructor(
    private readonly sessionDb: SessionDatabase,
    private readonly telemetryCatalog: TelemetryCatalog
  ) {}

  public getFiles() {
    return this.telemetryCatalog.getFiles();
  }

  public getTelemetryMeta() {
    return this.sessionDb.getTelemetryMetadata();
  }

  public async enrichWithTelemetry(input: TelemetryEnrichmentInput): Promise<TelemetryEnrichmentResult> {
    let trajectory = input.currentTrajectory;
    let duckdbUnavailableReason: string | undefined;
    let fused = false;

    if (!input.isPlayer || !input.allowDuckDb || !input.metadata) {
      return { trajectory, fused };
    }

    try {
      let fileMtime: number | undefined;
      if (fs.existsSync(input.filePath)) {
        try {
          fileMtime = fs.statSync(input.filePath).mtime.getTime();
        } catch {
          // Ignore stat failure
        }
      }
      if (fileMtime === undefined) {
        fileMtime = this.sessionDb.getStoredReplayFileInfo(input.replayName)?.file_mtime;
      }

      const files = this.telemetryCatalog.getFiles();
      const telemetryMeta = this.sessionDb.getTelemetryMetadata();
      const matchedSessionId = input.matchedSession?.id;
      const sessionMatchedFilename = matchedSessionId
        ? telemetryMeta.find(item => item.matchedSessionId === matchedSessionId)?.filename
        : undefined;
      const sessionMatchedFile = sessionMatchedFilename
        ? files.find(file => file.filename === sessionMatchedFilename)
        : null;
      const isSessionMatchValid = sessionMatchedFile && input.matchedSession ? (
        matchesTrack(sessionMatchedFile.trackName, input.matchedSession.trackVenue, input.matchedSession.trackCourse)
      ) : false;

      const matchedDuck =
        matchDuckDbToReplay(files, input.metadata, fileMtime) ||
        (input.matchedSession ? matchDuckDbToSession(files, input.matchedSession) : null) ||
        (isSessionMatchValid ? sessionMatchedFile : null);

      if (matchedDuck) {
        this.sessionDb.upsertTelemetryMetadata(matchedDuck, input.matchedSession?.id, input.replayName);
        trajectory.duckdbFilename = matchedDuck.filename;

        const chosenLapNum = trajectory.currentLap || input.lapNumber || 1;
        const targetLapTimeSec = trajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;

        let duckLap = this.sessionDb.getTelemetryLapCache(matchedDuck.filename, chosenLapNum);
        if (!duckLap) {
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
            trajectory = downsampleTrajectoryResponse(fusedTrajectory, input.maxPoints);
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
