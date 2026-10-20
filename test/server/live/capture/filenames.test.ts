import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveCaptureRecordingStore } from '../../../../server/live/capture/recordingStore.js';
import { makeBatch, makeManifest } from '../../../helpers/liveCaptureBatch.js';
import type { LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';

describe('completed capture filenames', () => {
  let directory: string;
  const stores: LiveCaptureRecordingStore[] = [];
  const store = () => {
    const result = new LiveCaptureRecordingStore(directory);
    stores.push(result);
    return result;
  };
  const unresolved = (overrides: Partial<LiveCaptureManifest> = {}) => {
    const manifest = makeManifest(overrides);
    return { ...manifest, filename: `unresolved_practice_2026-10-19T01-13-37.265Z_${manifest.recordingId}.live.duckdb` };
  };
  const resolvedName = (manifest: LiveCaptureManifest) => manifest.filename.replace('unresolved_', 'bahrain_gp_');
  // Simulate a legacy completed file: layout becomes known in its manifest without renaming it.
  const legacy = async () => {
    const writer = store();
    const result = await writer.write(makeBatch(0, { manifest: unresolved({ status: 'completed', layoutKey: null }) }));
    await writer.close();
    const manifest = { ...result.manifest, layoutKey: 'bahrain:gp' };
    const database = await DuckDBInstance.create(path.join(directory, manifest.filename));
    try {
      const connection = await database.connect();
      try {
        await connection.run('UPDATE capture_manifest SET manifest_json = CAST(? AS JSON)', [JSON.stringify(manifest)]);
        await connection.run('CHECKPOINT');
      } finally { connection.closeSync(); }
    } finally { database.closeSync(); }
    return manifest;
  };

  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lmu-filenames-')); });
  afterEach(async () => {
    try { await Promise.all(stores.map(writer => writer.close())); }
    finally { stores.length = 0; await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('keeps the active filename while layout resolves, then renames on completion with samples and provenance intact', async () => {
    const writer = store();
    const manifest = unresolved({ layoutKey: null });
    await writer.write(makeBatch(0, { manifest }));
    const known = { ...manifest, layoutKey: 'bahrain:gp' };
    await writer.write(makeBatch(1, { manifest: known, samples: new Float64Array(), observations: [] }));
    expect(await fs.readdir(directory)).toContain(manifest.filename);
    const result = await writer.write(makeBatch(2, {
      manifest: { ...known, status: 'completed', endedAt: known.updatedAt }, samples: new Float64Array(), observations: [],
    }));
    expect(result.manifest).toMatchObject({ filename: resolvedName(manifest), recordingId: manifest.recordingId, samples: 2 });
    expect(await fs.readdir(directory)).not.toContain(manifest.filename);
    // Catalog validation checks both embedded filename fields and the stored sample count.
    expect(await store().catalog()).toEqual({ recordings: [result], errors: [] });
    await writer.link(result.manifest.filename, manifest.recordingId, 'official-xml', '2.0');
    await writer.close();
    expect((await store().catalog()).recordings[0].manifest).toMatchObject({ sessionId: 'official-xml', gameVersion: '2.0', samples: 2 });
  });

  it('keeps the unresolved name when the completion rename fails, then discovery repairs it', async () => {
    const writer = store();
    const manifest = unresolved({ layoutKey: 'bahrain:gp' });
    await writer.write(makeBatch(0, { manifest }));
    const destination = path.join(directory, resolvedName(manifest));
    await fs.writeFile(destination, 'existing file');
    const result = await writer.write(makeBatch(1, {
      manifest: { ...manifest, status: 'completed', endedAt: manifest.updatedAt }, samples: new Float64Array(), observations: [],
    }));
    expect(result.manifest).toMatchObject({ filename: manifest.filename, status: 'completed', samples: 2 });
    expect(await fs.readFile(destination, 'utf8')).toBe('existing file');
    await fs.rm(destination);
    const catalog = await store().catalog();
    expect(catalog.errors).toEqual([]);
    expect(catalog.recordings[0].manifest).toMatchObject({ filename: resolvedName(manifest), status: 'completed', samples: 2 });
  });

  it.each([
    { status: 'recording' as const, layoutKey: 'bahrain:gp' },
    { status: 'interrupted' as const, layoutKey: 'bahrain:gp' },
    { status: 'completed' as const, layoutKey: null },
  ])('leaves $status files with layout $layoutKey unchanged', async overrides => {
    const writer = store();
    const result = await writer.write(makeBatch(0, { manifest: unresolved(overrides) }));
    await writer.close();
    expect(result.manifest.filename).toMatch(/^unresolved_/);
    expect((await store().catalog()).recordings[0].manifest.filename).toBe(result.manifest.filename);
  });

  it('repairs legacy completed filenames during discovery and stays unchanged on rediscovery', async () => {
    const manifest = await legacy();
    const first = await store().catalog();
    expect(first.errors).toEqual([]);
    expect(first.recordings[0].manifest).toEqual({ ...manifest, filename: resolvedName(manifest) });
    expect(await store().catalog()).toEqual(first);
    expect(await fs.readdir(directory)).toEqual([resolvedName(manifest)]);
  });

  it('recovers an exit after the physical rename but before metadata commits', async () => {
    const manifest = await legacy();
    await fs.rename(path.join(directory, manifest.filename), path.join(directory, resolvedName(manifest)));
    const catalog = await store().catalog();
    expect(catalog.errors).toEqual([]);
    expect(catalog.recordings[0].manifest.filename).toBe(resolvedName(manifest));
    expect(await store().catalog()).toEqual(catalog);
  });

  it('preserves both files when the resolved destination already exists', async () => {
    const manifest = await legacy();
    const destination = path.join(directory, resolvedName(manifest));
    await fs.writeFile(destination, 'existing file');
    const catalog = await store().catalog();
    expect(catalog.errors).toContainEqual({ filename: manifest.filename, error: 'Resolved live capture filename already exists' });
    expect(await fs.readFile(destination, 'utf8')).toBe('existing file');
    expect(await fs.readdir(directory)).toContain(manifest.filename);
  });
});
