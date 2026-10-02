import { Worker } from 'node:worker_threads';
import { findWorkerBootstrap } from '../../replay/worker/replayTrajectoryWorkerClient.js';
import type { DetailedSession, ReplayMetadata, ReferenceLaptimesCache } from '../types.js';
import type { ReplayFileEntry } from '../../sessions/sessionXmlTypes.js';

/** One lazy worker per scan, reused across files. XML and replay metadata never block HTTP. */
export class FileIngestWorker {
  private worker: Worker | null = null;
  private pending: { resolve: (value: DetailedSession | ReplayMetadata | null) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  private request(input: { kind: 'xml' | 'replay'; filePath: string; playerName?: string; replays?: ReplayFileEntry[]; referenceCache?: ReferenceLaptimesCache | null }): Promise<DetailedSession | ReplayMetadata | null> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error('File ingest worker already has a request'));
    if (!this.worker) {
      this.worker = new Worker(findWorkerBootstrap(import.meta.url, ['core', 'ingest', 'fileIngestWorkerBootstrap.mjs']));
      this.worker.on('message', (message: { result?: DetailedSession | ReplayMetadata | null; error?: string }) => {
        const pending = this.pending;
        this.pending = null;
        if (message.error) pending?.reject(new Error(message.error));
        else pending?.resolve(message.result ?? null);
      });
      const fail = (error: Error): void => { this.failure = error; this.pending?.reject(error); this.pending = null; };
      this.worker.on('error', fail);
      this.worker.on('exit', code => { if (this.pending) fail(new Error(`File ingest worker exited with code ${code}`)); });
    }
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; this.worker!.postMessage(input); });
  }

  public async parseXml(filePath: string, playerName: string, replays: ReplayFileEntry[], referenceCache: ReferenceLaptimesCache | null = null): Promise<DetailedSession | null> {
    return await this.request({ kind: 'xml', filePath, playerName, replays, referenceCache }) as DetailedSession | null;
  }
  public async parseReplay(filePath: string, playerName?: string): Promise<ReplayMetadata> {
    const result = await this.request({ kind: 'replay', filePath, playerName });
    if (!result) throw new Error('Replay metadata worker returned no metadata');
    return result as ReplayMetadata;
  }
  public async close(): Promise<void> { await this.worker?.terminate(); this.worker = null; }
}
