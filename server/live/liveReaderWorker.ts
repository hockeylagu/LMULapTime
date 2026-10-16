import http from 'node:http';
import { parentPort } from 'node:worker_threads';
import { isWorkerMessage } from '../core/workerThreads.js';
import { LiveReader } from './liveReader.js';
import type { GameProbe } from './liveReader.js';
import { openMapping } from './sharedMemory.js';

/** The one LMU REST read the app makes to learn the game is gone. A paused game still answers; a busy one may be slow. */
const GAME_STATE_URL = 'http://127.0.0.1:6397/navigation/state';
const PROBE_TIMEOUT_MS = 1000;

/** LMU's main menu, from the answer's `state.navigationState` (seen live: `NAV_MAIN_MENU`, `NAV_EVENT`, `NAV_REALTIME`). */
export function navigationProbe(body: string): GameProbe {
  try {
    const state = (JSON.parse(body) as { state?: { navigationState?: unknown } }).state;
    return state?.navigationState === 'NAV_MAIN_MENU' ? 'menu' : 'session';
  } catch {
    return 'session';
  }
}

function probeGame(): Promise<GameProbe> {
  return new Promise(resolve => {
    const request = http.get(GAME_STATE_URL, { timeout: PROBE_TIMEOUT_MS }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve(navigationProbe(body)));
    });
    // Only a refused connection means gone: a game loading a track can be too slow to answer and is still there.
    request.on('timeout', () => { request.destroy(); resolve('busy'); });
    request.on('error', () => resolve('gone'));
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
