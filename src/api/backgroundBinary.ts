import { fetchBinary } from './apiClient.js';

/** Enough to keep downloads moving while one worker waits on a large file. */
const WORKERS = 2;

interface Reply { id: number; bytes?: ArrayBuffer; error?: string }
interface Waiting { resolve(bytes: ArrayBuffer): void; reject(error: Error): void }

let workers: Worker[] | undefined, next = 0;
const waiting = new Map<number, Waiting>();

function start(): Worker[] {
  return Array.from({ length: WORKERS }, () => {
    const worker = new Worker(new URL('./backgroundBinaryWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const request = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.bytes) request?.resolve(data.bytes);
      else request?.reject(Error(data.error ?? 'Background request failed'));
    };
    return worker;
  });
}

/**
 * Reads a binary file on a worker thread. `fetchBinary` gathers a response body on the main thread, which costs frames when
 * megabytes arrive while the page is animating; here the bytes come back whole. Use it for files fetched during playback.
 * Where workers do not exist the file is read on the main thread.
 */
export function fetchBinaryInBackground(path: string): Promise<ArrayBuffer> {
  if (typeof Worker === 'undefined') return fetchBinary(path);
  workers ??= start();
  const id = next++, worker = workers[id % WORKERS];
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, url: new URL(path, location.href).href });
  });
}
