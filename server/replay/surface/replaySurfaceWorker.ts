import { parentPort } from 'node:worker_threads';
import { buildReplaySurfaceIndex, replaySurfaceAt, type ReplaySurfaceIndex } from './replaySurfaceIndex.js';

/** A request for the surface state of one replay file at one session time; `key` names the file's identity and element count. */
export interface SurfaceStateRequest { type: 'state'; id: number; key: string; filePath: string; elements: number; time: number }
export type SurfaceWorkerMessage = { type: 'state'; id: number; state: Uint8Array } | { type: 'error'; id: number; message: string };

/** Indexes kept: a scene shows one session, and a second one keeps a switch back cheap. Le Mans: about 50 MB each. */
const KEPT_INDEXES = 2;

const port = parentPort;
if (!port) throw new Error('Replay surface worker requires a parent port');
const indexes = new Map<string, ReplaySurfaceIndex>();

port.on('message', (request: SurfaceStateRequest) => {
  try {
    let index = indexes.get(request.key);
    if (index) indexes.delete(request.key);
    else index = buildReplaySurfaceIndex(request.filePath, request.elements);
    indexes.set(request.key, index);
    while (indexes.size > KEPT_INDEXES) indexes.delete(indexes.keys().next().value!);
    const state = replaySurfaceAt(request.filePath, index, request.time);
    port.postMessage({type: 'state', id: request.id, state} satisfies SurfaceWorkerMessage, [state.buffer as ArrayBuffer]);
  } catch (error) {
    port.postMessage({type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error)} satisfies SurfaceWorkerMessage);
  }
});
