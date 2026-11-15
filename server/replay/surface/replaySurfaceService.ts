import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { SurfaceStateRequest, SurfaceWorkerMessage } from './replaySurfaceWorker.js';

const bootstrapPath = (): string => findWorkerBootstrap(import.meta.url, ['replay', 'surface', 'replaySurfaceWorkerBootstrap.mjs']);

/**
 * The replay's track surface state at a session time (docs/VCR_FORMAT.md §4.21), read from the replay file on one long-lived worker
 * thread: indexing a replay reads the whole file (about 3 s at Le Mans), and each lookup then reads at most a snapshot's span again.
 * The worker keeps its indexes; a file whose size or modification time changed is indexed afresh.
 */
export class ReplaySurfaceService {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, {resolve: (state: Uint8Array) => void; reject: (error: Error) => void}>();

  constructor(private readonly workerPath: string | URL = bootstrapPath()) {}

  /** `elements` × 4 bytes (rubber laid, loose material, surface water, surface temperature) at `time`; rejects when the file is gone. */
  stateAt(filePath: string, elements: number, time: number): Promise<Uint8Array> {
    const stat = fs.statSync(filePath);
    const request: SurfaceStateRequest = {type: 'state', id: this.nextId++, key: `${filePath}|${stat.size}|${stat.mtimeMs}|${elements}`, filePath, elements, time};
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, {resolve, reject});
      this.ensureWorker().postMessage(request);
    });
  }

  dispose(): void {
    void this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    // Idle, it holds nothing the server waits for.
    worker.unref();
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<SurfaceWorkerMessage>(message, ['state', 'error'])) return;
      const waiting = this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id);
      if (message.type === 'state') waiting.resolve(message.state);
      else waiting.reject(new Error(message.message));
    });
    const fail = (error: Error) => {
      if (this.worker === worker) this.worker = null;
      for (const waiting of this.pending.values()) waiting.reject(error);
      this.pending.clear();
    };
    worker.on('error', error => fail(error instanceof Error ? error : new Error(String(error))));
    worker.on('exit', code => fail(new Error(`Replay surface worker exited with code ${code}`)));
    this.worker = worker;
    return worker;
  }
}
