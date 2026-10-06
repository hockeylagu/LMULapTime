import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { Worker } from 'node:worker_threads';
import { FileIngestWorker, FileIngestWorkerExitError } from '../../../../server/core/ingest/fileIngestWorkerClient.js';

const fixture = path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml');

describe('FileIngestWorker', () => {
  let ingest: FileIngestWorker | null = null;

  afterEach(async () => {
    await ingest?.close();
    ingest = null;
  });

  it('fails only the file it was reading when the worker dies, and reads the next one in a new worker', async () => {
    const worker = new FileIngestWorker();
    ingest = worker;
    const rejected = expect(worker.parseXml(fixture, 'Player Driver', [])).rejects.toBeInstanceOf(FileIngestWorkerExitError);
    await (worker as unknown as { worker: Worker }).worker.terminate();

    await rejected;
    const next = await worker.parseXml(fixture, 'Player Driver', []);
    expect(next?.trackVenue).toBeTruthy();
  });

  // Under `node --watch` (npm run dev), tsx posts { 'watch:import': [...] } on the worker's port.
  it('answers each file with its own result when the port also carries tsx watch-mode messages', async () => {
    const script = `import { parentPort } from 'node:worker_threads';
      parentPort.on('message', input => {
        parentPort.postMessage({ 'watch:import': ['file:///loader.mjs'] });
        parentPort.postMessage({ type: 'result', result: { id: input.filePath } });
      });`;
    const worker = new FileIngestWorker(new URL(`data:text/javascript,${encodeURIComponent(script)}`));
    ingest = worker;

    expect(await worker.parseXml('first.xml', 'Player', [])).toEqual({ id: 'first.xml' });
    expect(await worker.parseXml('second.xml', 'Player', [])).toEqual({ id: 'second.xml' });
  });

  it('rejects a request still waiting when it is closed', async () => {
    const worker = new FileIngestWorker();
    const rejected = expect(worker.parseXml(fixture, 'Player Driver', [])).rejects.toBeInstanceOf(FileIngestWorkerExitError);
    await worker.close();

    await rejected;
  });
});
