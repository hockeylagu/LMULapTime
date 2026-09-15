import { SessionDatabase } from '../core/db.js';
import { DuckDbFileInfo, enrichDuckDbDirectory } from './telemetryMatcher.js';

export interface TelemetryCatalogStatus {
  directory: string;
  updatedAt: string | null;
  filesCount: number;
}

export class TelemetryCatalog {
  private files: DuckDbFileInfo[] = [];
  private directory = '';
  private updatedAt: string | null = null;
  private refreshPromise: Promise<number> | null = null;

  public constructor(private readonly sessionDb: SessionDatabase) {}

  public getFiles(): DuckDbFileInfo[] {
    return this.files;
  }

  public getStatus(currentDirectory: string): TelemetryCatalogStatus {
    return {
      directory: this.directory || currentDirectory,
      updatedAt: this.updatedAt,
      filesCount: this.files.length,
    };
  }

  public clear(): void {
    this.files = [];
    this.directory = '';
    this.updatedAt = null;
  }

  public refresh(directory: string): Promise<number> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = enrichDuckDbDirectory(directory)
      .then((files) => {
        this.files = files;
        this.directory = directory;
        this.updatedAt = new Date().toISOString();
        for (const file of files) {
          this.sessionDb.upsertTelemetryMetadata(file);
          if (file.enrichmentError) {
            this.sessionDb.recordIngestError('duckdb', file.filePath, file.enrichmentError);
          } else {
            this.sessionDb.clearIngestError('duckdb', file.filePath);
          }
        }
        this.sessionDb.pruneTelemetryLapCache();
        this.sessionDb.clearIngestError('duckdb-directory', directory);
        return files.length;
      })
      .catch((error: unknown) => {
        this.sessionDb.recordIngestError('duckdb-directory', directory, error);
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }
}
