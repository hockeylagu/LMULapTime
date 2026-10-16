import http from 'node:http';
import { parentPort } from 'node:worker_threads';
import { isWorkerMessage } from '../core/workerThreads.js';
import { LiveReader } from './liveReader.js';
import { openMapping } from './sharedMemory.js';

/** The one LMU REST read the app makes to learn the game is gone. A paused game still answers. */
const GAME_STATE_URL = 'http://127.0.0.1:6397/navigation/state';
const PROBE_TIMEOUT_MS = 1000;

function probeGame(): Promise<boolean> {
  return new Promise(resolve => {
    const request = http.get(GAME_STATE_URL, { timeout: PROBE_TIMEOUT_MS }, response => {
      response.resume();
      resolve(true);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

if (parentPort) {
  const port = parentPort;
  const reader = new LiveReader({ openMapping, probeGame, post: message => port.postMessage(message) });
  port.on('message', (message: unknown) => {
    if (!isWorkerMessage<{ type: 'stop' }>(message, ['stop'])) return;
    reader.stop();
    port.close();
  });
  reader.start();
}
