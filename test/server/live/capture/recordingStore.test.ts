import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Json } from '@duckdb/node-api';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveCaptureManifest, LiveCaptureWriteMessage, LiveCaptureWriteResult } from '../../../../shared/types/liveCapture.js';
import { makeBatch } from '../../../helpers/liveCaptureBatch.js';

// One end-to-end pass through the real worker thread and a clean reader process. Store rules run in
// process in recordingStoreDirect.test.ts and the worker queue in recordingWorkerDirect.test.ts:
// each real worker start costs ~260 ms.
const directories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lmu-live-capture-'));
  directories.push(directory);
  return directory;
}

async function createWriter(directory: string) {
  const worker = new Worker(new URL('../../../../server/live/capture/recordingWorkerBootstrap.mjs', import.meta.url), {
    workerData: { directory },
  });
  const send = (message: LiveCaptureWriteMessage): Promise<LiveCaptureWriteResult> => new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', resolve);
    worker.postMessage(message);
  });
  return {
    send,
    async close() {
      const exited = new Promise<number>(resolve => worker.once('exit', resolve));
      expect((await send({ type: 'close' })).type).toBe('closed');
      expect(await exited).toBe(0);
    },
  };
}

const READBACK_SQL = `SELECT (SELECT count(*) FROM capture_samples) AS samples, (SELECT count(*) FROM capture_observations) AS observations,
  velocity_forward_mps AS velocity, fl_patch_longitudinal_mps IS NULL AND fr_patch_longitudinal_mps IS NULL AS "wheelNull",
  (SELECT CAST(manifest_json AS VARCHAR) FROM capture_manifest WHERE singleton = TRUE) AS manifest
  FROM capture_samples ORDER BY sample_index LIMIT 1`;

function readInChild(filename: string): Record<string, Json> {
  const source = `
    const { DuckDBInstance } = require('@duckdb/node-api');
    (async () => {
      const instance = await DuckDBInstance.create(process.argv[1], { access_mode: 'READ_ONLY' });
      const connection = await instance.connect();
      try {
        process.stdout.write(JSON.stringify((await connection.runAndReadAll(process.argv[2])).getRowObjectsJson()[0]));
      } finally {
        connection.closeSync();
        instance.closeSync();
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', source, filename, READBACK_SQL], { encoding: 'utf8' })) as Record<string, Json>;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

describe('LiveCaptureRecordingStore worker', () => {
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

    const readback = readInChild(path.join(directory, batch.manifest.filename));
    expect(readback.samples).toBe('2');
    expect(readback.observations).toBe('1');
    expect(readback.velocity).toBe(0);
    // FL NaN stays NULL, while FR now carries its finite version-2 wheel measurement.
    expect(readback.wheelNull).toBe(false);
    expect(JSON.parse(readback.manifest as string) as LiveCaptureManifest).toEqual(batch.manifest);
  });
});
