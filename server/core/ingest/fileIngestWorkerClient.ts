import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap, isWorkerMessage } from '../../replay/worker/replayTrajectoryWorkerClient.js';
import type { DetailedSession, ReplayMetadata, ReferenceLaptimesCache } from '../types.js';
import type { ReplayFileEntry } from '../../sessions/sessionXmlTypes.js';

type IngestRequest = { kind: 'xml' | 'replay'; filePath: string; playerName?: string; replays?: ReplayFileEntry[]; referenceCache?: ReferenceLaptimesCache | null };
type IngestResult = DetailedSession | ReplayMetadata | null;
/** An answer of fileIngestWorker.ts. */
type IngestAnswer = { type: 'result'; result: IngestResult } | { type: 'error'; message: string };

/** The ingest worker stopped (crashed, ran out of memory, was terminated) before it answered. */
export class FileIngestWorkerExitError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FileIngestWorkerExitError';
  }
}

/**
 * One lazy worker per scan, reused across files. XML and replay metadata never block HTTP.
 * A worker that dies fails only the file it was reading: the next request starts a new worker,
 * so one bad file cannot fail every file after it in the scan (the newest sessions come last).
 */
export class FileIngestWorker {
  private worker: Worker | null = null;
  private pending: { resolve: (value: IngestResult) => void; reject: (error: Error) => void } | null = null;

  /** `workerPath` replaces the worker (tests). */
  public constructor(private readonly workerPath?: string | URL) {}

  private spawn(): Worker {
    const worker = new Worker(this.workerPath ?? findWorkerBootstrap(import.meta.url, ['core', 'ingest', 'fileIngestWorkerBootstrap.mjs']));
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<IngestAnswer>(message, ['result', 'error'])) return;
      const pending = this.pending;
      this.pending = null;
      if (message.type === 'error') pending?.reject(new Error(message.message));
      else pending?.resolve(message.result ?? null);
    });
    const fail = (error: Error): void => {
      if (this.worker !== worker) return;
      this.worker = null;
      void worker.terminate();
      const pending = this.pending;
      this.pending = null;
      pending?.reject(error);
    };
    worker.on('error', (error: Error) => fail(new FileIngestWorkerExitError(`File ingest worker failed: ${error.message}`)));
    worker.on('exit', code => fail(new FileIngestWorkerExitError(`File ingest worker exited with code ${code}`)));
    return worker;
  }

  private request(input: IngestRequest): Promise<IngestResult> {
    if (this.pending) return Promise.reject(new Error('File ingest worker already has a request'));
    return new Promise((resolve, reject) => {
      const worker = this.worker ?? (this.worker = this.spawn());
      this.pending = { resolve, reject };
      try {
        worker.postMessage(input);
      } catch (error: unknown) {
        // The input could not be sent (not cloneable): nothing is pending in the worker.
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public async parseXml(filePath: string, playerName: string, replays: ReplayFileEntry[], referenceCache: ReferenceLaptimesCache | null = null): Promise<DetailedSession | null> {
    return await this.request({ kind: 'xml', filePath, playerName, replays, referenceCache }) as DetailedSession | null;
  }
  public async parseReplay(filePath: string, playerName?: string): Promise<ReplayMetadata> {
    const result = await this.request({ kind: 'replay', filePath, playerName });
    if (!result) throw new Error('Replay metadata worker returned no metadata');
    return result as ReplayMetadata;
  }
  public async close(): Promise<void> {
    const worker = this.worker;
    const pending = this.pending;
    this.worker = null;
    this.pending = null;
    pending?.reject(new FileIngestWorkerExitError('File ingest worker closed'));
    await worker?.terminate();
  }
}
