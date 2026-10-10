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
  ) {}

  public getFiles(): DuckDbFileInfo[] {
    return this.sessionDb.getTelemetryFiles();
  }

  public getStatus(currentDirectory: string): TelemetryCatalogStatus {
    return {
      directory: this.directory || currentDirectory,
      updatedAt: this.updatedAt,
      filesCount: this.sessionDb.getTelemetryFilesCount(),
    };
  }

  public getScanStatus(): TelemetryScanStatus {
    return this.scanStatus;
  }

  public clear(): void {
    this.refreshGeneration++;
    this.refreshPromise = null;
    this.refreshDirectory = null;
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
    // The file-version lookup belongs only to this scan; SQLite owns completed metadata.
    for (const f of this.sessionDb.getTelemetryFiles()) {
      cachedMap.set(f.filePath, f);
    }

    const published = new Set<string>();
    const publish = (file: DuckDbFileInfo): void => {
      if (generation !== this.refreshGeneration || published.has(file.filePath)) return;
      published.add(file.filePath);
      const previous = cachedMap.get(file.filePath);
      if (!previous || previous.fileMtimeMs !== file.fileMtimeMs || previous.fileSizeBytes !== file.fileSizeBytes || previous.enrichmentError) {
        this.sessionDb.upsertTelemetryMetadata?.(file);
      }
    };
    let cachedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;

    const refreshPromise = this.enrichDirectory(directory, {
      cachedFiles: cachedMap,
      onFile: publish,
      onProgress: (p) => {
        if (generation !== this.refreshGeneration) return;
        this.scanStatus.processed = p.processed;
        this.scanStatus.total = p.total;
        this.scanStatus.currentFile = p.currentFile || null;
      },
    })
      .then((files) => {
        if (generation !== this.refreshGeneration) return files.length;
        this.directory = directory;
        this.updatedAt = new Date().toISOString();
        for (const file of files) {
          const prev = cachedMap.get(file.filePath);
          if (!prev) {
            addedCount++;
            publish(file);
          } else if (prev.fileMtimeMs !== file.fileMtimeMs || prev.fileSizeBytes !== file.fileSizeBytes) {
            updatedCount++;
            publish(file);
          } else {
            cachedCount++;
          }
          publish(file);
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
          this.sessionDb.pruneTelemetryLapCache(new Set(files.map(file => file.filename)));
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
        this.scanStatus.currentFile = null;
        this.refreshPromise = null;
        this.refreshDirectory = null;
      });

    this.refreshPromise = refreshPromise;
    return refreshPromise;
  }
}
