import { SessionDatabase } from '../core/db.js';
import { TelemetryScanStatus } from '../core/types.js';
import { DuckDbFileInfo, enrichDuckDbDirectory } from './telemetryMatcher.js';

type EnrichDuckDbDirectory = typeof enrichDuckDbDirectory;

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
  private refreshDirectory: string | null = null;
  private refreshGeneration = 0;

  private scanStatus: TelemetryScanStatus = {
    running: false,
    processed: 0,
    total: 0,
    currentFile: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };

  public constructor(
    private readonly sessionDb: SessionDatabase,
    private readonly enrichDirectory: EnrichDuckDbDirectory = enrichDuckDbDirectory
  ) {
    try {
      if (typeof this.sessionDb.getTelemetryFiles === 'function') {
        this.files = this.sessionDb.getTelemetryFiles();
        if (this.files.length > 0) {
          this.updatedAt = new Date().toISOString();
        }
      }
    } catch {
      // In-memory or initial db setup
    }
  }

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

  public getScanStatus(): TelemetryScanStatus {
    return this.scanStatus;
  }

  public clear(): void {
    this.refreshGeneration++;
    this.refreshPromise = null;
    this.refreshDirectory = null;
    this.files = [];
    this.directory = '';
    this.updatedAt = null;
    this.scanStatus = {
      running: false,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    };
  }

  public refresh(directory: string): Promise<number> {
    if (this.refreshPromise && this.refreshDirectory === directory) return this.refreshPromise;

    const generation = ++this.refreshGeneration;
    this.refreshDirectory = directory;

    this.scanStatus = {
      running: true,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    const cachedMap = new Map<string, DuckDbFileInfo>();
    for (const f of this.files) {
      cachedMap.set(f.filePath, f);
    }

    let cachedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;

    const refreshPromise = this.enrichDirectory(directory, {
      cachedFiles: cachedMap,
      onProgress: (p) => {
        if (generation !== this.refreshGeneration) return;
        this.scanStatus.processed = p.processed;
        this.scanStatus.total = p.total;
        this.scanStatus.currentFile = p.currentFile || null;
      },
    })
      .then((files) => {
        if (generation !== this.refreshGeneration) return files.length;
        this.files = files;
        this.directory = directory;
        this.updatedAt = new Date().toISOString();
        for (const file of files) {
          const prev = cachedMap.get(file.filePath);
          if (!prev) {
            addedCount++;
            if (typeof this.sessionDb?.upsertTelemetryMetadata === 'function') {
              this.sessionDb.upsertTelemetryMetadata(file);
            }
          } else if (prev.fileMtimeMs !== file.fileMtimeMs || prev.fileSizeBytes !== file.fileSizeBytes) {
            updatedCount++;
            if (typeof this.sessionDb?.upsertTelemetryMetadata === 'function') {
              this.sessionDb.upsertTelemetryMetadata(file);
            }
          } else {
            cachedCount++;
          }
          if (file.enrichmentError) {
            if (typeof this.sessionDb?.recordIngestError === 'function') {
              this.sessionDb.recordIngestError('duckdb', file.filePath, file.enrichmentError);
            }
          } else {
            if (typeof this.sessionDb?.clearIngestError === 'function') {
              this.sessionDb.clearIngestError('duckdb', file.filePath);
            }
          }
        }
        if (typeof this.sessionDb?.pruneTelemetryLapCache === 'function') {
          this.sessionDb.pruneTelemetryLapCache();
        }
        if (typeof this.sessionDb?.clearIngestError === 'function') {
          this.sessionDb.clearIngestError('duckdb-directory', directory);
        }
        this.scanStatus.result = {
          added: addedCount,
          updated: updatedCount,
          cached: cachedCount,
          total: files.length,
        };
        return files.length;
      })
      .catch((error: unknown) => {
        if (generation !== this.refreshGeneration) throw error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.scanStatus.error = errorMsg;
        if (typeof this.sessionDb?.recordIngestError === 'function') {
          this.sessionDb.recordIngestError('duckdb-directory', directory, error);
        }
        throw error;
      })
      .finally(() => {
        if (generation !== this.refreshGeneration) return;
        this.scanStatus.running = false;
        this.scanStatus.finishedAt = new Date().toISOString();
        this.refreshPromise = null;
        this.refreshDirectory = null;
      });

    this.refreshPromise = refreshPromise;
    return refreshPromise;
  }
}
