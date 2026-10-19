import { afterEach, describe, it, expect, vi } from 'vitest';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { SessionDatabase } from '../../../server/core/db.js';
import type { DuckDbFileInfo, enrichDuckDbDirectory } from '../../../server/telemetry/telemetryMatcher.js';

const databases: SessionDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function database(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return db;
}
function file(directory = 'C:\\fake', filename = 'Spa_P.duckdb'): DuckDbFileInfo {
  return { filename, filePath: `${directory}\\${filename}`, mtimeMs: 1000, fileSizeBytes: 2048,
    trackName: 'Spa', sessionType: 'P', timestampStr: '', timestampEpochMs: 0 };
}

describe('TelemetryCatalog', () => {
  it('does not materialize metadata at construction or for status; reads current SQLite rows on demand', () => {
    const db = database();
    const read = vi.spyOn(db, 'getTelemetryFiles');
    const catalog = new TelemetryCatalog(db);
    expect(read).not.toHaveBeenCalled();
    expect(catalog.getStatus('C:\\fake').filesCount).toBe(0);
    expect(read).not.toHaveBeenCalled();
    db.upsertTelemetryMetadata(file());
    expect(db.getTelemetryFiles()).toEqual([file()]);
    expect(catalog.getStatus('C:\\fake').filesCount).toBe(1);
    db.clearTelemetryCache();
    expect(db.getTelemetryFiles()).toEqual([]);
  });

  it('clears only scan state; SQLite owns retained metadata', () => {
    const db = database();
    db.upsertTelemetryMetadata(file());
    const catalog = new TelemetryCatalog(db);
    catalog.clear();
    expect(db.getTelemetryFiles()).toEqual([file()]);
    expect(catalog.getScanStatus()).toMatchObject({ running: false, result: null, error: null });
  });

  it('runs a missing-directory refresh without deleting retained metadata', async () => {
    const db = database();
    db.upsertTelemetryMetadata(file());
    const catalog = new TelemetryCatalog(db);
    expect(await catalog.refresh('C:\\non_existent_telemetry_directory_xyz')).toBe(0);
    expect(catalog.getScanStatus()).toMatchObject({ running: false, result: { total: 0, added: 0, updated: 0, cached: 0 }, error: null });
    expect(catalog.getScanStatus().finishedAt).not.toBeNull();
    expect(db.getTelemetryFiles()).toEqual([file()]);
  });

  it('uses SQLite file versions for each scan, retries failures and publishes partial progress', async () => {
    const db = database();
    const previous = file();
    db.upsertTelemetryMetadata(previous);
    const changed = { ...previous, fileSizeBytes: 4096 };
    const enrich = vi.fn(async (_directory: string, options?: Parameters<typeof enrichDuckDbDirectory>[1]) => {
      expect(options?.cachedFiles?.get(previous.filePath)).toEqual(previous);
      options?.onFile?.(changed);
      expect(db.getTelemetryFiles()).toEqual([changed]);
      return [changed];
    });
    const catalog = new TelemetryCatalog(db, enrich);
    await catalog.refresh('C:\\fake');
    expect(catalog.getScanStatus().result).toEqual({ total: 1, added: 0, updated: 1, cached: 0 });
    const failed = { ...changed, enrichmentError: 'locked' };
    db.upsertTelemetryMetadata(failed);
    const retry = new TelemetryCatalog(db, async (_directory, options) => {
      expect(options?.cachedFiles?.get(previous.filePath)?.enrichmentError).toBe('locked');
      return [changed];
    });
    await retry.refresh('C:\\fake');
    expect(db.getTelemetryFiles()).toEqual([changed]);
  });

  it('ignores a stale refresh after the directory changes', async () => {
    const db = database();
    const resolvers = new Map<string, (files: DuckDbFileInfo[]) => void>();
    const enrichDirectory = vi.fn((directory: string) => new Promise<DuckDbFileInfo[]>(resolve => { resolvers.set(directory, resolve); }));
    const catalog = new TelemetryCatalog(db, enrichDirectory);
    const oldDirectory = 'C:\\telemetry-old', newDirectory = 'C:\\telemetry-new';
    const oldFile = file(oldDirectory, 'old.duckdb'), newFile = file(newDirectory, 'new.duckdb');
    const oldRefresh = catalog.refresh(oldDirectory);
    catalog.clear();
    const newRefresh = catalog.refresh(newDirectory);
    expect(catalog.refresh(newDirectory)).toBe(newRefresh);
    resolvers.get(newDirectory)?.([newFile]);
    await newRefresh;
    resolvers.get(oldDirectory)?.([oldFile]);
    await oldRefresh;
    expect(db.getTelemetryFiles()).toEqual([newFile]);
    expect(catalog.getStatus(newDirectory).directory).toBe(newDirectory);
  });

  it('yields during bulk publication and stops a stale scan before publishing more files', async () => {
    const db = database();
    const files = Array.from({ length: 25 }, (_, index) => file('C:\\fake', `session-${index}.duckdb`));
    const catalog = new TelemetryCatalog(db, async () => files);
    const upsert = db.upsertTelemetryMetadata.bind(db);
    let published = 0;
    vi.spyOn(db, 'upsertTelemetryMetadata').mockImplementation(entry => {
      upsert(entry);
      if (++published === 1) setImmediate(() => catalog.clear());
    });
    const prune = vi.spyOn(db, 'pruneTelemetryLapCache');
    await catalog.refresh('C:\\fake');
    expect(published).toBeGreaterThan(0);
    expect(published).toBeLessThan(files.length);
    expect(prune).not.toHaveBeenCalled();
    expect(catalog.getScanStatus()).toMatchObject({ running: false, result: null, error: null });
  });
});
