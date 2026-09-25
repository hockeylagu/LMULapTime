import { describe, it, expect, vi } from 'vitest';
import { TelemetryCatalog } from '../../server/telemetry/telemetryCatalog.js';
import type { SessionDatabase } from '../../server/core/db.js';
import type { DuckDbFileInfo } from '../../server/telemetry/telemetryMatcher.js';

describe('TelemetryCatalog', () => {
  it('initializes files immediately from SessionDatabase cache on construction', () => {
    const cachedFiles: DuckDbFileInfo[] = [
      {
        filename: 'Spa_P_2026.duckdb',
        filePath: 'C:\\fake\\Spa_P_2026.duckdb',
        fileMtimeMs: 1000,
        fileSizeBytes: 2048,
        trackName: 'Circuit de Spa-Francorchamps',
        sessionType: 'P',
        timestampStr: '',
        timestampEpochMs: 0,
      },
    ];

    const mockDb = {
      getTelemetryFiles: vi.fn().mockReturnValue(cachedFiles),
      saveTelemetryFiles: vi.fn(),
    } as unknown as SessionDatabase;

    const catalog = new TelemetryCatalog(mockDb);

    expect(mockDb.getTelemetryFiles).toHaveBeenCalled();
    expect(catalog.getFiles()).toEqual(cachedFiles);
    expect(catalog.getStatus('C:\\fake').filesCount).toBe(1);

    const scanStatus = catalog.getScanStatus();
    expect(scanStatus.running).toBe(false);
    expect(scanStatus.processed).toBe(0);
  });

  it('clears files and status on clear()', () => {
    const mockDb = {
      getTelemetryFiles: vi.fn().mockReturnValue([]),
      saveTelemetryFiles: vi.fn(),
    } as unknown as SessionDatabase;

    const catalog = new TelemetryCatalog(mockDb);
    catalog.clear();

    expect(catalog.getFiles()).toEqual([]);
    expect(catalog.getStatus('C:\\dir').filesCount).toBe(0);
    expect(catalog.getScanStatus()).toMatchObject({ running: false, result: null, error: null });
  });

  it('runs refresh on non-existent directory and records finished scan status', async () => {
    const mockDb = {
      getTelemetryFiles: vi.fn().mockReturnValue([]),
      saveTelemetryFiles: vi.fn(),
      upsertTelemetryMetadata: vi.fn(),
      clearIngestError: vi.fn(),
      recordIngestError: vi.fn(),
      pruneTelemetryLapCache: vi.fn(),
    } as unknown as SessionDatabase;

    const catalog = new TelemetryCatalog(mockDb);
    const count = await catalog.refresh('C:\\non_existent_telemetry_directory_xyz');

    expect(count).toBe(0);
    const status = catalog.getScanStatus();
    expect(status.running).toBe(false);
    expect(status.finishedAt).not.toBeNull();
    expect(status.result).toEqual({ total: 0, added: 0, updated: 0, cached: 0 });
    expect(status.error).toBeNull();
  });

  it('ignores a stale refresh after the directory changes', async () => {
    const mockDb = {
      getTelemetryFiles: vi.fn().mockReturnValue([]),
      upsertTelemetryMetadata: vi.fn(),
      clearIngestError: vi.fn(),
      recordIngestError: vi.fn(),
      pruneTelemetryLapCache: vi.fn(),
    } as unknown as SessionDatabase;
    const resolvers = new Map<string, (files: DuckDbFileInfo[]) => void>();
    const enrichDirectory = vi.fn((directory: string) => new Promise<DuckDbFileInfo[]>((resolve) => {
      resolvers.set(directory, resolve);
    }));
    const catalog = new TelemetryCatalog(mockDb, enrichDirectory);
    const oldDirectory = 'C:\\telemetry-old';
    const newDirectory = 'C:\\telemetry-new';
    const oldFile = { filename: 'old.duckdb', filePath: `${oldDirectory}\\old.duckdb` } as DuckDbFileInfo;
    const newFile = { filename: 'new.duckdb', filePath: `${newDirectory}\\new.duckdb` } as DuckDbFileInfo;

    const oldRefresh = catalog.refresh(oldDirectory);
    catalog.clear();
    const newRefresh = catalog.refresh(newDirectory);
    resolvers.get(newDirectory)?.([newFile]);
    await newRefresh;
    resolvers.get(oldDirectory)?.([oldFile]);
    await oldRefresh;

    expect(catalog.getFiles()).toEqual([newFile]);
    expect(catalog.getStatus(newDirectory).directory).toBe(newDirectory);
    expect(mockDb.upsertTelemetryMetadata).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertTelemetryMetadata).toHaveBeenCalledWith(newFile);
  });
});
