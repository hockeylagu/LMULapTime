import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LIVE_CAPTURE_CHANNELS,
} from '../../../../server/live/capture/channels.js';
import type { LiveCaptureWriteMessage, LiveCaptureWriteResult } from '../../../../shared/types/liveCapture.js';
import {
  LIVE_CAPTURE_NORMALIZATION_VERSION,
  LIVE_CAPTURE_SAMPLE_WIDTH,
  LIVE_CAPTURE_SCHEMA_VERSION,
  LIVE_CAPTURE_SOURCE,
} from '../../../../shared/types/liveCapture.js';
import type { LiveCaptureBatch, LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';

const directories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lmu-live-capture-'));
  directories.push(directory);
  return directory;
}

interface TestWriter {
  post(message: LiveCaptureWriteMessage): void;
  next(): Promise<LiveCaptureWriteResult>;
  send(message: LiveCaptureWriteMessage): Promise<LiveCaptureWriteResult>;
  close(): Promise<void>;
}

async function createWriter(directory: string): Promise<TestWriter> {
  const worker = new Worker(new URL('../../../../server/live/capture/recordingWorkerBootstrap.mjs', import.meta.url), {
    workerData: { directory },
  });
  const pending: Array<(result: LiveCaptureWriteResult) => void> = [];
  const answers: LiveCaptureWriteResult[] = [];
  worker.on('message', (answer: LiveCaptureWriteResult) => {
    const resolve = pending.shift();
    if (resolve) resolve(answer);
    else answers.push(answer);
  });
  const next = (): Promise<LiveCaptureWriteResult> => new Promise(resolve => {
    const ready = answers.shift();
    if (ready) { resolve(ready); return; }
    pending.push(resolve);
  });
  const post = (message: LiveCaptureWriteMessage): void => worker.postMessage(message);
  const send = async (message: LiveCaptureWriteMessage): Promise<LiveCaptureWriteResult> => {
    const answer = next();
    post(message);
    return await answer;
  };
  return {
    post,
    next,
    send,
    async close() {
      const response = await send({ type: 'close' });
      expect(response.type).toBe('closed');
      await new Promise<void>((resolve, reject) => {
        worker.once('error', reject);
        worker.once('exit', code => code === 0 ? resolve() : reject(new Error(`Worker exited with code ${code}`)));
      });
    },
  };
}

function makeManifest(overrides: Partial<LiveCaptureManifest> = {}): LiveCaptureManifest {
  const recordingId = 'a3e6b4b3-54a7-4fc2-9b22-8e5818b8b318';
  return {
    recordingId,
    source: LIVE_CAPTURE_SOURCE,
    schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
    normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION,
    signConvention: 'iso8855',
    filename: `bahrain_Race_2026-10-17T18-00-00Z_${recordingId}.live.duckdb`,
    layoutKey: 'bahrain:gp',
    trackName: 'Bahrain International Circuit',
    driverName: 'Driver One',
    vehicleName: 'LMGT3 Car',
    vehicleModel: 'Test Model',
    carClass: 'LMGT3',
    sessionCode: 3,
    sessionKind: 'Race',
    startedAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    firstElapsedSeconds: 1,
    lastElapsedSeconds: 1,
    endedAt: null,
    status: 'recording',
    samples: 1,
    droppedSamples: 0,
    anchors: [],
    sessionId: null,
    gameVersion: '1.2.3',
    ...overrides,
  };
}

function sampleRows(...times: number[]): Float64Array {
  const result = new Float64Array(times.length * LIVE_CAPTURE_SAMPLE_WIDTH);
  for (const [row, time] of times.entries()) {
    const offset = row * LIVE_CAPTURE_SAMPLE_WIDTH;
    result[offset] = time;
    result[offset + 1] = 1;
    result[offset + 2] = 0;
    for (let channel = 0; channel < LIVE_CAPTURE_CHANNELS.length; channel++) result[offset + 3 + channel] = channel === 6 ? Number.NaN : row + channel / 10;
  }
  return result;
}

function makeBatch(sequence = 0, overrides: Partial<LiveCaptureBatch> = {}): LiveCaptureBatch {
  const samples = sampleRows(1, 1.02);
  const manifest = makeManifest({ firstElapsedSeconds: 1, lastElapsedSeconds: 1.02, samples: 2, updatedAt: 1_800_000_000_100 });
  return {
    type: 'batch',
    sequence,
    manifest,
    samples,
    observations: [{
      elapsedSeconds: 1.01,
      receivedAt: 1_800_000_000_050,
      source: 'rest',
      kind: 'standings',
      requestStartedAt: 1_800_000_000_040,
      requestFinishedAt: 1_800_000_000_050,
      data: { position: 3, nested: { status: 'ok' } },
    }],
    ...overrides,
  };
}

function readInChild(filename: string): unknown {
  const source = `
    const duckdb = require('duckdb');
    const filename = process.argv[1];
    const db = new duckdb.Database(filename, duckdb.OPEN_READONLY, error => {
      if (error) { console.error(error.message); process.exitCode = 1; return; }
      db.all('SELECT (SELECT count(*) FROM capture_samples) AS samples, (SELECT count(*) FROM capture_observations) AS observations, velocity_forward_mps, fl_patch_lateral_mps, fr_patch_lateral_mps, (SELECT manifest_json FROM capture_manifest WHERE singleton = TRUE) AS manifest FROM capture_samples ORDER BY sample_index LIMIT 1', (queryError, rows) => {
        if (queryError) { console.error(queryError.message); process.exitCode = 1; db.close(() => {}); return; }
        const row = rows[0];
        const result = { samples: String(row.samples), observations: String(row.observations), velocity: row.velocity_forward_mps, wheelNull: row.fl_patch_lateral_mps === null && row.fr_patch_lateral_mps === null, manifest: JSON.parse(row.manifest) };
        process.stdout.write(JSON.stringify(result));
        db.close(closeError => { if (closeError) process.exitCode = 1; });
      });
    });
  `;
  const output = execFileSync(process.execPath, ['-e', source, filename], { encoding: 'utf8' });
  return JSON.parse(output) as unknown;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

describe('LiveCaptureRecordingStore', () => {
  it('retains the version-1 catalog and masks unverified wheel input instead of relabeling older recordings', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const batch = makeBatch();
    batch.manifest.normalizationVersion = 1;
    expect((await writer.send(batch)).type).toBe('persisted');
    await writer.close();
    expect(readInChild(path.join(directory, batch.manifest.filename))).toMatchObject({
      wheelNull: true, manifest: { normalizationVersion: 1 },
    });
  });
  it('writes typed samples and sparse JSON evidence, then reopens read-only in a clean process', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const batch = makeBatch();
    const answer = await writer.send(batch);
    expect(answer.type).toBe('persisted');
    if (answer.type !== 'persisted') throw new Error('Expected persisted result');
    expect(answer.manifest).toEqual(batch.manifest);
    expect(answer.bytes).toBeGreaterThan(0);
    await writer.close();

    const readback = readInChild(path.join(directory, batch.manifest.filename)) as {
      samples: string; observations: string; velocity: number; wheelNull: boolean; manifest: LiveCaptureManifest;
    };
    expect(readback.samples).toBe('2');
    expect(readback.observations).toBe('1');
    expect(readback.velocity).toBe(0);
    // FL NaN stays NULL, while FR now carries its finite version-2 wheel measurement.
    expect(readback.wheelNull).toBe(false);
    expect(readback.manifest).toEqual(batch.manifest);
  });

  it('rejects a batch whose sequence is already committed', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const batch = makeBatch();
    expect((await writer.send(batch)).type).toBe('persisted');
    const repeat = await writer.send(batch);
    expect(repeat.type).toBe('failed');
    if (repeat.type !== 'failed') throw new Error('Expected failed repeat');
    expect(repeat.error).toMatch(/older than the committed sequence/);
    await writer.close();
  });

  it('reopens a recoverable recording in a new worker and appends after the committed sequence', async () => {
    const directory = await createDirectory();
    const firstWriter = await createWriter(directory);
    const first = makeBatch();
    expect((await firstWriter.send(first)).type).toBe('persisted');
    await firstWriter.close();

    const nextWriter = await createWriter(directory);
    const resumed = makeBatch(1, {
      manifest: { ...first.manifest, lastElapsedSeconds: 1.04, samples: 3, updatedAt: first.manifest.updatedAt + 20 },
      samples: sampleRows(1.04),
      observations: [],
    });
    expect((await nextWriter.send(resumed)).type).toBe('persisted');
    await nextWriter.close();
    const readback = readInChild(path.join(directory, first.manifest.filename)) as { samples: string; manifest: LiveCaptureManifest };
    expect(readback.samples).toBe('3');
    expect(readback.manifest.lastElapsedSeconds).toBe(1.04);
  });

  it('keeps the file counters when a resumed writer carries a lagging index manifest', async () => {
    const directory = await createDirectory();
    const firstWriter = await createWriter(directory);
    const first = makeBatch();
    expect((await firstWriter.send({ ...first, manifest: { ...first.manifest, droppedSamples: 2 } })).type).toBe('persisted');
    await firstWriter.close();

    // After a crash the index still holds an older manifest: fewer samples, earlier end, fewer drops.
    const nextWriter = await createWriter(directory);
    const resumed = await nextWriter.send(makeBatch(1, {
      manifest: { ...first.manifest, samples: 1, lastElapsedSeconds: 1, droppedSamples: 0, updatedAt: first.manifest.updatedAt + 20 },
      samples: sampleRows(1.04),
      observations: [],
    }));
    expect(resumed.type).toBe('persisted');
    if (resumed.type !== 'persisted') throw new Error('Expected persisted resume');
    expect(resumed.manifest).toMatchObject({ samples: 3, lastElapsedSeconds: 1.04, droppedSamples: 2 });
    await nextWriter.close();
    const readback = readInChild(path.join(directory, first.manifest.filename)) as { samples: string; manifest: LiveCaptureManifest };
    expect(readback.samples).toBe('3');
    expect(readback.manifest).toMatchObject({ samples: 3, lastElapsedSeconds: 1.04, droppedSamples: 2 });
  });

  it('resumes interrupted recordings but refuses completed recordings', async () => {
    for (const status of ['interrupted', 'completed'] as const) {
      const directory = await createDirectory();
      const writer = await createWriter(directory);
      const first = makeBatch();
      first.manifest.status = status;
      expect((await writer.send(first)).type).toBe('persisted');
      await writer.close();
      const next = await createWriter(directory);
      const result = await next.send(makeBatch(1, {
        manifest: { ...first.manifest, status: 'recording', samples: 3, lastElapsedSeconds: 1.04 },
        samples: sampleRows(1.04), observations: [],
      }));
      expect(result.type).toBe(status === 'interrupted' ? 'persisted' : 'failed');
      await next.close();
    }
  });

  it('switches to another file after checkpointing the previous recording', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const first = makeBatch();
    expect((await writer.send(first)).type).toBe('persisted');
    const otherId = 'd1ce0327-7e07-4ea5-a445-c2a4a7bc9ef0';
    const secondManifest = makeManifest({
      recordingId: otherId,
      filename: `bahrain_Race_2026-10-17T18-01-40Z_${otherId}.live.duckdb`,
      startedAt: 1_800_000_100_000,
      updatedAt: 1_800_000_100_000,
      firstElapsedSeconds: 3,
      lastElapsedSeconds: 3,
      samples: 1,
    });
    const second = makeBatch(0, { manifest: secondManifest, samples: sampleRows(3), observations: [] });
    expect((await writer.send(second)).type).toBe('persisted');
    await writer.close();
    expect((await fs.stat(path.join(directory, first.manifest.filename))).size).toBeGreaterThan(0);
    const readback = readInChild(path.join(directory, secondManifest.filename)) as { samples: string };
    expect(readback.samples).toBe('1');
  });

  it('rejects unsafe IDs, malformed rows, sequence values and non-JSON evidence before persistence', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const good = makeBatch();
    for (const malformed of [
      { ...good, manifest: { ...good.manifest, filename: '../escape.live.duckdb' } },
      { ...good, sequence: -1 },
      { ...good, samples: new Float64Array(32) },
      { ...good, observations: [{ ...good.observations[0], data: { invalid: 1n } }] },
    ]) {
      const response = await writer.send(malformed as LiveCaptureWriteMessage);
      expect(response.type).toBe('failed');
    }
    await writer.close();
    await expect(fs.stat(path.join(directory, good.manifest.filename))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses a different manifest for an already active recording ID', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    expect((await writer.send(makeBatch())).type).toBe('persisted');
    const conflict = makeBatch(1, {
      manifest: makeManifest({
        firstElapsedSeconds: 1,
        lastElapsedSeconds: 1.04,
        samples: 3,
        updatedAt: 1_800_000_000_200,
        driverName: 'Different Driver',
      }),
      samples: sampleRows(1.04),
      observations: [],
    });
    const response = await writer.send(conflict);
    expect(response.type).toBe('failed');
    if (response.type !== 'failed') throw new Error('Expected manifest identity failure');
    expect(response.error).toMatch(/identity changed/);
    await writer.close();
  });

  it('links verified XML ownership into the manifest without changing captured sample data', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const batch = makeBatch();
    const written = await writer.send(batch);
    expect(written.type).toBe('persisted');
    const linked = await writer.send({
      type: 'link',
      filename: batch.manifest.filename,
      recordingId: batch.manifest.recordingId,
      sessionId: 'session-verified-by-xml',
      gameVersion: '2.0.1',
    });
    expect(linked).toEqual({ type: 'linked', recordingId: batch.manifest.recordingId });
    await writer.close();

    const readback = readInChild(path.join(directory, batch.manifest.filename)) as {
      samples: string; manifest: LiveCaptureManifest;
    };
    expect(readback.samples).toBe('2');
    expect(readback.manifest.sessionId).toBe('session-verified-by-xml');
    expect(readback.manifest.gameVersion).toBe('2.0.1');
  });

  it('does not create a missing file when a link targets it and rejects an ID mismatch', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const recordingId = 'd1ce0327-7e07-4ea5-a445-c2a4a7bc9ef0';
    const filename = `${recordingId}.live.duckdb`;
    const missing = await writer.send({ type: 'link', filename, recordingId, sessionId: 'verified', gameVersion: null });
    expect(missing.type).toBe('failed');
    if (missing.type !== 'failed') throw new Error('Expected missing-file link failure');
    expect(missing.error).toMatch(/missing live capture file/);
    const mismatch = await writer.send({
      type: 'link', filename, recordingId: 'a3e6b4b3-54a7-4fc2-9b22-8e5818b8b318', sessionId: 'verified', gameVersion: null,
    });
    expect(mismatch.type).toBe('failed');
    await writer.close();
    await expect(fs.stat(path.join(directory, filename))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('catalogs only verified live capture files and reports corrupt candidates per file', async () => {
    const directory = await createDirectory();
    const batch = makeBatch();
    const writer = await createWriter(directory);
    expect((await writer.send(batch)).type).toBe('persisted');
    await writer.close();
    await fs.writeFile(path.join(directory, 'unrelated.live.duckdb'), 'not a DuckDB file');
    await fs.writeFile(path.join(directory, 'native-session.duckdb'), 'never catalog native files');

    const catalogWorker = await createWriter(directory);
    const catalog = await catalogWorker.send({ type: 'catalog' });
    expect(catalog.type).toBe('catalogued');
    if (catalog.type !== 'catalogued') throw new Error('Expected catalog result');
    expect(catalog.recordings).toHaveLength(1);
    expect(catalog.recordings[0].manifest.recordingId).toBe(batch.manifest.recordingId);
    expect(catalog.recordings[0].bytes).toBeGreaterThan(0);
    expect(catalog.errors).toHaveLength(1);
    expect(catalog.errors[0].filename).toBe('unrelated.live.duckdb');
    await catalogWorker.close();
  });

  it('returns a directory error without creating a missing capture directory', async () => {
    const root = await createDirectory();
    const missing = path.join(root, 'does-not-exist');
    const writer = await createWriter(missing);
    const result = await writer.send({ type: 'catalog' });
    expect(result.type).toBe('catalogued');
    if (result.type !== 'catalogued') throw new Error('Expected catalog result');
    expect(result.recordings).toEqual([]);
    expect(result.errors[0]?.filename).toBe('<directory>');
    await writer.close();
    await expect(fs.stat(missing)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a readable filename whose stored manifest belongs to another recording ID', async () => {
    const directory = await createDirectory();
    const original = makeBatch();
    const writer = await createWriter(directory);
    expect((await writer.send(original)).type).toBe('persisted');
    await writer.close();
    const otherId = 'd1ce0327-7e07-4ea5-a445-c2a4a7bc9ef0';
    const renamed = `bahrain_Race_2026-10-17T18-01-40Z_${otherId}.live.duckdb`;
    await fs.copyFile(path.join(directory, original.manifest.filename), path.join(directory, renamed));

    const linkWorker = await createWriter(directory);
    const response = await linkWorker.send({
      type: 'link', filename: renamed, recordingId: otherId, sessionId: 'verified', gameVersion: null,
    });
    expect(response.type).toBe('failed');
    if (response.type !== 'failed') throw new Error('Expected stored recording ID mismatch');
    expect(response.error).toMatch(/does not match the stored manifest/);
    await linkWorker.close();
  });

  it('accepts a readable filename, unresolved layout and empty driver name, then resolves layout later', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const manifest = makeManifest({
      layoutKey: null,
      driverName: '',
      firstElapsedSeconds: 1,
      lastElapsedSeconds: 1,
      samples: 0,
    });
    const initialized = await writer.send({ type: 'batch', sequence: 0, manifest, samples: new Float64Array(), observations: [] });
    expect(initialized.type).toBe('persisted');
    const resolved = makeBatch(1, {
      manifest: { ...manifest, layoutKey: 'bahrain:gp', firstElapsedSeconds: 1, lastElapsedSeconds: 1.02, samples: 1, updatedAt: manifest.updatedAt + 20 },
      samples: sampleRows(1.02),
      observations: [],
    });
    expect((await writer.send(resolved)).type).toBe('persisted');
    await writer.close();
    const readback = readInChild(path.join(directory, manifest.filename)) as { manifest: LiveCaptureManifest };
    expect(readback.manifest.layoutKey).toBe('bahrain:gp');
    expect(readback.manifest.driverName).toBe('');
  });

  it('allows sparse-only manifest time to advance before the first dynamics sample', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const initial = makeManifest({ firstElapsedSeconds: 0, lastElapsedSeconds: 0, samples: 0 });
    expect((await writer.send({ type: 'batch', sequence: 0, manifest: initial, samples: new Float64Array(), observations: [] })).type).toBe('persisted');
    const evidence = await writer.send({
      type: 'batch', sequence: 1,
      manifest: { ...initial, lastElapsedSeconds: 1, updatedAt: initial.updatedAt + 1000 },
      samples: new Float64Array(),
      observations: [{ elapsedSeconds: 1, receivedAt: initial.updatedAt + 1000, source: 'rest', kind: 'weather', data: { rain: 0 } }],
    });
    expect(evidence.type).toBe('persisted');
    const sample = await writer.send({
      type: 'batch', sequence: 2,
      manifest: { ...initial, lastElapsedSeconds: 1.02, samples: 1, updatedAt: initial.updatedAt + 1020 },
      samples: sampleRows(1.02), observations: [],
    });
    expect(sample.type).toBe('persisted');
    await writer.close();
  });

  it('preserves two control slots so a final batch can follow four queued normal batches', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const startedAt = 1_800_000_000_000;
    const messages: LiveCaptureBatch[] = [];
    for (let index = 0; index < 5; index++) {
      const elapsed = 1 + index * 0.02;
      messages.push(makeBatch(index, {
        manifest: makeManifest({
          firstElapsedSeconds: 1,
          lastElapsedSeconds: elapsed,
          samples: index + 1,
          startedAt,
          updatedAt: startedAt + index * 20,
          status: index === 4 ? 'completed' : 'recording',
          endedAt: index === 4 ? startedAt + 100 : null,
        }),
        samples: sampleRows(elapsed),
        observations: [],
      }));
    }
    for (const message of messages) writer.post(message);
    const results = await Promise.all(messages.map(() => writer.next()));
    expect(results.map(result => result.type)).toEqual(['persisted', 'persisted', 'persisted', 'persisted', 'persisted']);
    await writer.close();
  });

  it('accepts observation-only batches in the same six-slot transport envelope and bounds overflow', async () => {
    const directory = await createDirectory();
    const writer = await createWriter(directory);
    const messages: LiveCaptureBatch[] = Array.from({ length: 7 }, (_, index) => makeBatch(index, {
      manifest: makeManifest({ samples: 0, lastElapsedSeconds: index + 1, updatedAt: 1_800_000_000_000 + index,
        status: index === 5 ? 'completed' : 'recording', endedAt: index === 5 ? 1_800_000_000_100 : null }),
      samples: new Float64Array(),
      observations: index === 5 ? [] : [{ source: 'rest', kind: 'condition', elapsedSeconds: index + 1,
        receivedAt: 1_800_000_000_000 + index, data: { body: index } }],
    }));
    for (const message of messages) writer.post(message);
    const results = await Promise.all(messages.map(() => writer.next()));
    expect(results.filter(result => result.type === 'persisted')).toHaveLength(6);
    expect(results.filter(result => result.type === 'failed')).toEqual([
      expect.objectContaining({ sequence: 6, error: 'Live capture worker queue is full (limit 6)' }),
    ]);
    await writer.close();
  });
});
