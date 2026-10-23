import { parentPort, workerData } from 'node:worker_threads';
import { isWorkerMessage } from '../../core/workerThreads.js';
import type {
  LiveCaptureBatch,
  LiveCaptureWriteMessage,
  LiveCaptureWriteResult,
} from '../../../shared/types/liveCapture.js';
import { LiveCaptureRecordingStore } from './recordingStore.js';
import { LIVE_CAPTURE_PENDING_BATCHES, LIVE_CAPTURE_FINALIZATION_SLOTS } from '../../../shared/types/liveCapture.js';

const MAX_PENDING_BATCHES = LIVE_CAPTURE_PENDING_BATCHES + LIVE_CAPTURE_FINALIZATION_SLOTS;
const MAX_PENDING_CONTROLS = 2;
const port = parentPort;
if (!port) throw new Error('Live capture recording worker requires a parent port');
const data = workerData as { directory?: unknown };
if (typeof data.directory !== 'string' || data.directory.length === 0) throw new Error('Live capture worker requires a recording directory');

const store = new LiveCaptureRecordingStore(data.directory);
let pendingBatches = 0;
let pendingControls = 0;
let closing = false;
let queue = Promise.resolve();

function post(result: LiveCaptureWriteResult): void {
  if (result.type === 'persisted' && result.recycledSamples) port?.postMessage(result, [result.recycledSamples]);
  else port?.postMessage(result);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enqueueBatch(batch: LiveCaptureBatch): void {
  const fail = (error: string): void => post({ type: 'failed', operation: 'batch', sequence: batch.sequence,
    recordingId: batch.manifest.recordingId, error });
  if (closing) {
    fail('Live capture recording worker is closing');
    return;
  }
  // The controller reserves the final two batch slots. Sparse-only batches use the same
  // envelope as numeric batches; maintenance controls have their own small bound.
  if (pendingBatches >= MAX_PENDING_BATCHES) {
    fail(`Live capture worker queue is full (limit ${MAX_PENDING_BATCHES})`);
    return;
  }
  pendingBatches++;
  queue = queue.then(async () => {
    try {
      const result = await store.write(batch);
      post({ type: 'persisted', sequence: batch.sequence, manifest: result.manifest, bytes: result.bytes,
        recycledSamples: batch.samples.buffer as ArrayBuffer });
    } catch (error: unknown) {
      fail(errorText(error));
    } finally {
      pendingBatches--;
    }
  });
}

function enqueueClose(): void {
  if (closing) return;
  closing = true;
  queue = queue.then(async () => {
    try {
      await store.close();
      post({ type: 'closed' });
    } catch (error: unknown) {
      post({ type: 'failed', error: errorText(error) });
    } finally {
      port?.close();
    }
  });
}

function enqueueLink(message: Extract<LiveCaptureWriteMessage, { type: 'link' }>): void {
  const fail = (error: string): void => post({ type: 'failed', operation: 'link', recordingId: message.recordingId, error });
  if (closing) {
    fail('Live capture recording worker is closing');
    return;
  }
  if (pendingControls >= MAX_PENDING_CONTROLS) {
    fail(`Live capture worker control queue is full (limit ${MAX_PENDING_CONTROLS})`);
    return;
  }
  pendingControls++;
  queue = queue.then(async () => {
    try {
      await store.link(message.filename, message.recordingId, message.sessionId, message.gameVersion);
      post({ type: 'linked', recordingId: message.recordingId });
    } catch (error: unknown) {
      fail(errorText(error));
    } finally {
      pendingControls--;
    }
  });
}

function enqueueCatalog(): void {
  const fail = (error: string): void => post({ type: 'failed', operation: 'catalog', error });
  if (closing) {
    fail('Live capture recording worker is closing');
    return;
  }
  if (pendingControls >= MAX_PENDING_CONTROLS) {
    fail(`Live capture worker control queue is full (limit ${MAX_PENDING_CONTROLS})`);
    return;
  }
  pendingControls++;
  queue = queue.then(async () => {
    try {
      const result = await store.catalog();
      post({ type: 'catalogued', ...result });
    } catch (error: unknown) {
      fail(errorText(error));
    } finally {
      pendingControls--;
    }
  });
}

port.on('message', (message: unknown) => {
  if (!isWorkerMessage<LiveCaptureWriteMessage>(message, ['batch', 'close', 'link', 'catalog'])) return;
  if (message.type === 'close') enqueueClose();
  else if (message.type === 'link') enqueueLink(message);
  else if (message.type === 'catalog') enqueueCatalog();
  else enqueueBatch(message);
});
