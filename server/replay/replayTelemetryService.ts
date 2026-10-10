import { DetailedSession, DuckDbLapTelemetry, ReplayMetadata, ReplayTrajectoryData } from '../core/types.js';
import { SessionDatabase, TelemetryMetadataRecord } from '../core/db.js';
import { DuckDbReader } from '../telemetry/duckdbReader.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { fuseDuckDbWithVcrTrajectory } from '../telemetry/telemetryFusion.js';

export interface TelemetryEnrichmentInput {
  sessionId?: string;
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

interface FoundLap {
  file: TelemetryMetadataRecord;
  lap: DuckDbLapTelemetry;
}

export class ReplayTelemetryService {
  public constructor(private readonly sessionDb: SessionDatabase) {}

  /** A lap cached from any of the session's files (by an older reader too, with `anyVersion`). */
  private cachedLap(files: TelemetryMetadataRecord[], lapNumber: number, anyVersion = false): FoundLap | null {
    for (const file of files) {
      const lap = this.sessionDb.getTelemetryLapCache(file.filename, lapNumber, { anyVersion });
      if (lap) return { file, lap };
    }
    return null;
  }

  /**
   * Reads the lap from the session's files. LMU numbers laps across all of a session's files, so the
   * file holding a lap with this number and lap time wins; failing that, the first file with a lap of
   * this time (the single-file rule of DuckDbReader.getLapTelemetry). DuckDB counts the out-lap as
   * lap 0, one below the replay's numbering, so either number is accepted.
   */
  private async readLap(files: TelemetryMetadataRecord[], lapNumber: number, lapTimeSec?: number): Promise<FoundLap | null> {
    // A file that fails to open is reported once, not once per pass.
    const failed = new Set<string>();
    const exact = await this.firstLap(files, failed, async reader => {
      const laps = await reader.getLapList();
      const gap = (lap: { lapTimeSec: number }) => (lapTimeSec ? Math.abs(lap.lapTimeSec - lapTimeSec) : 0);
      // The closer lap time wins when both numbers qualify (two laps within 0.5 s of each other).
      const numbered = laps
        .filter(lap => (lap.lapNumber === lapNumber || lap.lapNumber === lapNumber - 1) && gap(lap) <= 0.5)
        .sort((left, right) => gap(left) - gap(right) || right.lapNumber - left.lapNumber)[0];
      return numbered ? reader.getLapTelemetry(numbered.lapNumber) : null;
    });
    return exact ?? this.firstLap(files, failed, reader => reader.getLapTelemetry(lapNumber, lapTimeSec));
  }

  private async firstLap(
    files: TelemetryMetadataRecord[],
    failed: Set<string>,
    read: (reader: DuckDbReader) => Promise<DuckDbLapTelemetry | null>
  ): Promise<FoundLap | null> {
    for (const file of files) {
      if (failed.has(file.filename)) continue;
      const reader = new DuckDbReader(file.filePath);
      try {
        await reader.open();
        const lap = await read(reader);
        if (lap) return { file, lap };
      } catch (error) {
        failed.add(file.filename);
        console.warn(`[DuckDB] Failed to read ${file.filename}:`, error);
        this.sessionDb.recordIngestError('duckdb', file.filePath, error);
      } finally {
        try {
          await reader.close();
        } catch (error) {
          console.warn(`[DuckDB] Failed to close ${file.filename}:`, error);
        }
      }
    }
    return null;
  }

  public async enrichWithTelemetry(input: TelemetryEnrichmentInput): Promise<TelemetryEnrichmentResult> {
    let trajectory = input.currentTrajectory;
    let duckdbUnavailableReason: string | undefined;
    let fused = false;

    if (!input.isPlayer || !input.allowDuckDb || !input.metadata || !input.matchedSession ||
      (input.sessionId !== undefined && input.matchedSession?.id !== input.sessionId)) {
      return { trajectory, fused };
    }

    try {
      // DuckDB ownership is session scoped; replay-owned/unmatched files never serve a session request.
      const links = TelemetryLinks.load(this.sessionDb, input.matchedSession?.id);
      const session = input.matchedSession;
      const files = session
        ? links.filesForSession(session).map(filename => links.row(filename))
          .filter((row): row is TelemetryMetadataRecord => Boolean(row))
        : [];

      if (files.length > 0) {
        trajectory.duckdbFilename = links.forSession(session!);

        const chosenLapNum = trajectory.currentLap || input.lapNumber || 1;
        const targetLapTimeSec = trajectory.laps?.find(lap => lap.lapNumber === chosenLapNum)?.lapTimeSec;

        let found = this.cachedLap(files, chosenLapNum);
        if (!found) {
          const onDisk = files.filter(file => links.isOnDisk(file.filename));
          if (onDisk.length > 0) {
            found = await this.readLap(onDisk, chosenLapNum, targetLapTimeSec);
            if (found) this.sessionDb.upsertTelemetryLapCache(found.file.filename, chosenLapNum, found.lap);
          }
          // A lap cached by an older reader is the only copy left once its file is deleted.
          found ??= this.cachedLap(files.filter(file => !links.isOnDisk(file.filename)), chosenLapNum, true);
          if (!found && onDisk.length === 0) {
            duckdbUnavailableReason = 'The DuckDB file of this session was deleted before this lap was read; using Native VCR data.';
          }
        }
        const duckLap = found?.lap ?? null;
        const matchedDuck = found?.file;
        if (matchedDuck) trajectory.duckdbFilename = matchedDuck.filename;

        if (duckLap && matchedDuck) {
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
      console.warn(`[DuckDB] Error fusing DuckDB telemetry for session ${input.matchedSession?.id}:`, error);
    }

    if (duckdbUnavailableReason) {
      trajectory.duckdbAvailable = false;
      trajectory.duckdbUnavailableReason = duckdbUnavailableReason;
    }

    return { trajectory, duckdbUnavailableReason, fused };
  }
}
