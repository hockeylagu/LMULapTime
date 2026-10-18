import { parentPort } from 'node:worker_threads';
import { isWorkerMessage } from '../core/workerThreads.js';
import { LiveReader } from './liveReader.js';
import type { GameProbe } from './liveReader.js';
import { lmuHttpGet } from './lmuHttp.js';
import { navigationProbe } from './lmuNavigation.js';
import { openMapping } from './sharedMemory.js';
import { createGameProcessProbe } from './gameProcess.js';

/** Navigation determines the screen; connection refusal is an exit fallback if process detection is unavailable. */
const GAME_STATE_URL = 'http://127.0.0.1:6397/navigation/state';
const PROBE_TIMEOUT_MS = 1000;

// Only a refused connection means gone: a game loading a track can be too slow to answer, and an answer cut off
// midway is asked again (a game that exited refuses the next one).
async function probeGame(): Promise<GameProbe> {
  const answer = await lmuHttpGet(GAME_STATE_URL, PROBE_TIMEOUT_MS);
  if (answer.status === 'ok') return navigationProbe(answer.body);
  return answer.status === 'error' ? 'gone' : 'busy';
}

if (parentPort) {
  const port = parentPort;
  const reader = new LiveReader({ openMapping, probeGame, process: createGameProcessProbe(), capture: true,
    post: message => port.postMessage(message) });
  port.on('message', (message: unknown) => {
    if (!isWorkerMessage<{ type: 'stop' }>(message, ['stop'])) return;
    reader.stop();
    port.close();
  });
  reader.start();
}
