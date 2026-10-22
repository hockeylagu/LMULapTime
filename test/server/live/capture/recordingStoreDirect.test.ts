import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveCaptureRecordingStore } from '../../../../server/live/capture/recordingStore.js';
import { LIVE_CAPTURE_SAMPLE_WIDTH } from '../../../../shared/types/liveCapture.js';
import type { LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';
import { makeBatch, makeManifest, sampleRows } from '../../../helpers/liveCaptureBatch.js';

// These calls deliberately stay in Vitest's process so V8 measures the store itself.
// Worker transport and queue limits remain covered by recordingStore.test.ts.
describe('LiveCaptureRecordingStore in process', () => {
  let directory: string;
  const stores: LiveCaptureRecordingStore[] = [];
  const createStore = () => {
    const store = new LiveCaptureRecordingStore(directory);
    stores.push(store);
    return store;
  };
  const withDatabase = async (filename: string, readOnly: boolean, inspect: (connection: DuckDBConnection) => Promise<void>) => {
    const instance = await DuckDBInstance.create(path.join(directory, filename), readOnly ? { access_mode: 'READ_ONLY' } : {});
    try {
      const connection = await instance.connect();
      try { await inspect(connection); }
      finally { connection.closeSync(); }
    } finally { instance.closeSync(); }
  };

  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lmu-store-direct-')); });
  afterEach(async () => {
    try { await Promise.all(stores.splice(0).map(store => store.close())); }
    finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('persists more than two insert chunks with exact sample indices, NULLs and JSON evidence', async () => {
    const store = createStore();
    const times = Array.from({ length: 1025 }, (_, index) => 1 + index / 100);
    const batch = makeBatch(0, {
      samples: sampleRows(...times),
      manifest: makeManifest({ lastElapsedSeconds: times.at(-1)!, samples: times.length }),
      observations: times.map((time, index) => ({ source: 'rest', kind: 'weather', elapsedSeconds: time,
        receivedAt: 100 + index, data: { index, text: "driver's car" } })),
    });
    batch.samples[2] = Number.NaN;
    const result = await store.write(batch);
    expect(result.manifest).toEqual(batch.manifest);
    expect(result.bytes).toBeGreaterThan(0);
    await store.close();
    await store.close();
    await withDatabase(batch.manifest.filename, true, async connection => {
      expect((await connection.runAndReadAll('SELECT count(*) AS n, min(sample_index) AS first, max(sample_index) AS last FROM capture_samples')).getRowObjects())
        .toEqual([{ n: 1025n, first: 0n, last: 1024n }]);
      expect((await connection.runAndReadAll('SELECT sample_index, velocity_forward_mps, lap_start_seconds, rr_patch_longitudinal_mps FROM capture_samples WHERE sample_index IN (0, 511, 512, 1023, 1024) ORDER BY sample_index')).getRowObjects())
        .toEqual([0, 511, 512, 1023, 1024].map(index => ({ sample_index: BigInt(index), velocity_forward_mps: index,
          lap_start_seconds: index === 0 ? null : 0, rr_patch_longitudinal_mps: null })));
      const observations = (await connection.runAndReadAll('SELECT observation_id, data, request_started_at FROM capture_observations ORDER BY observation_id')).getRowObjects();
      expect(observations).toHaveLength(1025);
      for (const index of [0, 511, 512, 1023, 1024]) {
        expect(observations[index]).toEqual({ observation_id: BigInt(index), data: JSON.stringify({ index, text: "driver's car" }), request_started_at: null });
      }
    });
    // A rename after read/write handles close checks Windows file-handle release too.
    const filename = path.join(directory, batch.manifest.filename);
    await fs.rename(filename, `${filename}.closed`);
    await fs.rename(`${filename}.closed`, filename);
    expect(await createStore().catalog()).toEqual({ recordings: [{ manifest: batch.manifest, bytes: expect.any(Number) }], errors: [] });
  });

  it('resumes interrupted files using committed counters and rejects duplicate sequences and completed files', async () => {
    const first = makeBatch();
    first.manifest.status = 'interrupted';
    first.manifest.droppedSamples = 4;
    const store = createStore();
    await store.write(first);
    await store.close();
    const resumed = createStore();
    const next = makeBatch(1, { samples: sampleRows(1.04), observations: [],
      manifest: { ...first.manifest, status: 'recording', samples: 1, droppedSamples: 0 } });
    expect((await resumed.write(next)).manifest).toMatchObject({ samples: 3, droppedSamples: 4, lastElapsedSeconds: 1.04 });
    await expect(resumed.write(next)).rejects.toThrow('older than the committed sequence');
    await resumed.write({ ...next, sequence: 2, samples: new Float64Array(), manifest: { ...next.manifest, status: 'completed' } });
    await resumed.close();
    await expect(createStore().write({ ...next, sequence: 3 })).rejects.toThrow('finalized');
  });

  it('switches files, catalogs in time order and links XML ownership after reopening', async () => {
    const first = makeBatch();
    const recordingId = 'd1ce0327-7e07-4ea5-a445-c2a4a7bc9ef0';
    const second = makeBatch(0, { manifest: makeManifest({ recordingId, filename: `${recordingId}.live.duckdb`, startedAt: 1_800_000_000_001, updatedAt: 1_800_000_000_001 }) });
    const store = createStore();
    await store.write(first);
    await store.write(second);
    expect((await store.catalog()).recordings.map(row => row.manifest.recordingId)).toEqual([first.manifest.recordingId, recordingId]);
    await store.link(first.manifest.filename, first.manifest.recordingId, 'xml-session', '2.0');
    await store.link(first.manifest.filename, first.manifest.recordingId, 'xml-session', '2.0');
    const catalog = await store.catalog();
    expect(catalog.errors).toEqual([]);
    expect(catalog.recordings[0].manifest).toMatchObject({ samples: 2, sessionId: 'xml-session', gameVersion: '2.0' });
    await expect(store.write(makeBatch(1, { manifest: { ...first.manifest, sessionId: 'other-session' } }))).rejects.toThrow('collides');
  });

  it('interns terrain definitions across batches and reopen, retaining dictionary IDs', async () => {
    const first = makeBatch(0, { observations: ['ROAD', 'ROAD'].map((rawName, index) => ({ source: 'shared-memory',
      kind: 'terrain-change', elapsedSeconds: 1, receivedAt: 100, data: { corner: ['FL', 'FR'][index], rawName } })) });
    const store = createStore();
    await store.write(first);
    await store.write({ ...first, sequence: 1, samples: new Float64Array() });
    await store.close();
    const resumed = createStore();
    await resumed.write({ ...first, sequence: 2, samples: new Float64Array(), observations: [
      { ...first.observations[0], data: { corner: 'RL', rawName: 'GRAVEL' } },
      { ...first.observations[0], data: { corner: 'RR', rawName: 'ROAD' } },
    ] });
    await resumed.close();
    await withDatabase(first.manifest.filename, true, async connection => {
      const definitions = (await connection.runAndReadAll("SELECT data FROM capture_observations WHERE kind = 'terrain-material' ORDER BY observation_id")).getRowObjects();
      expect(definitions.map(row => JSON.parse(String(row.data)) as unknown)).toEqual([
        { materialId: 0, rawName: 'ROAD' }, { materialId: 1, rawName: 'GRAVEL' },
      ]);
    });
  });

  it('rolls back earlier sample chunks when evidence insertion fails and can retry the sequence', async () => {
    const store = createStore();
    const first = makeBatch();
    await store.write(first);
    await store.close();
    await withDatabase(first.manifest.filename, false, async connection => {
      await connection.run('CREATE UNIQUE INDEX test_observation_kind ON capture_observations(kind)');
    });
    const resumed = createStore();
    const next = makeBatch(1, { samples: sampleRows(...Array.from({ length: 513 }, (_, index) => 2 + index / 100)) });
    await expect(resumed.write(next)).rejects.toThrow();
    await resumed.close();
    await withDatabase(first.manifest.filename, false, async connection => {
      expect((await connection.runAndReadAll('SELECT count(*) AS n FROM capture_samples')).getRowObjects()).toEqual([{ n: 2n }]);
      expect((await connection.runAndReadAll('SELECT max(sequence) AS n FROM capture_batches')).getRowObjects()).toEqual([{ n: 0n }]);
      await connection.run('DROP INDEX test_observation_kind');
    });
    expect((await createStore().write(next)).manifest.samples).toBe(515);
  });

  it.each<Partial<LiveCaptureManifest>>([
    { recordingId: 'invalid' }, { filename: '../escape.live.duckdb' }, { schemaVersion: -1 },
    { trackName: '' }, { vehicleName: '' }, { sessionKind: '' }, { sessionCode: -1 },
    { updatedAt: 0 }, { firstElapsedSeconds: -1 }, { endedAt: 0 }, { samples: -1 },
    { anchors: [{ lapNumber: -1, startSeconds: 0, lapSeconds: null }] },
  ])('rejects invalid manifests before creating files: %j', async invalid => {
    await expect(createStore().write(makeBatch(0, { manifest: makeManifest(invalid) }))).rejects.toThrow();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('rejects malformed rows and non-JSON evidence before writing', async () => {
    const store = createStore();
    const batch = makeBatch();
    const malformed = [new Float64Array(1), ...[0, 1, 2, 3].map(index => {
      const rows = sampleRows(1, 1.02);
      rows[index] = Infinity;
      return rows;
    }), sampleRows(2, 1)];
    for (const samples of malformed) await expect(store.write({ ...batch, samples })).rejects.toThrow();
    await expect(store.write({ ...batch, samples: new Float64Array(10_001 * LIVE_CAPTURE_SAMPLE_WIDTH) })).rejects.toThrow('10,000-sample');
    await expect(store.write({ ...batch, observations: [{ ...batch.observations[0], data: 1n }] })).rejects.toThrow('not JSON');
    await expect(store.write({ ...batch, observations: [{ ...batch.observations[0], requestFinishedAt: 0 }] })).rejects.toThrow('request interval');
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('reports corrupt catalog entries individually and rejects incompatible files without retaining handles', async () => {
    const store = createStore();
    const batch = makeBatch();
    await store.write(batch);
    await store.close();
    await withDatabase(batch.manifest.filename, false, async connection => {
      await connection.run("UPDATE capture_metadata SET value = 'wrong' WHERE key = 'source'");
    });
    await fs.writeFile(path.join(directory, 'corrupt.live.duckdb'), 'invalid');
    await fs.writeFile(path.join(directory, 'native.duckdb'), 'ignored');
    const reader = createStore();
    const catalog = await reader.catalog();
    expect(catalog.recordings).toEqual([]);
    expect(catalog.errors).toHaveLength(2);
    expect(catalog.errors.find(row => row.filename === batch.manifest.filename)?.error).toMatch(/signature mismatch/);
    await expect(reader.write(batch)).rejects.toThrow('signature mismatch');
    await reader.close();
    await fs.rename(path.join(directory, batch.manifest.filename), path.join(directory, 'released.duckdb'));
  });

  it('handles a missing catalog directory, missing link targets and closed stores without creating files', async () => {
    const missing = new LiveCaptureRecordingStore(path.join(directory, 'missing'));
    stores.push(missing);
    expect(await missing.catalog()).toMatchObject({ recordings: [], errors: [{ filename: '<directory>' }] });
    const manifest = makeManifest();
    await expect(missing.link(manifest.filename, manifest.recordingId, 'xml', null)).rejects.toThrow('missing live capture');
    await missing.close();
    await expect(missing.write(makeBatch())).rejects.toThrow('closed');
    await expect(missing.catalog()).rejects.toThrow('closed');
    await expect(missing.link(manifest.filename, manifest.recordingId, 'xml', null)).rejects.toThrow('closed');
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
