import { parentPort, workerData } from 'node:worker_threads';
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
const diagnosticEnabled = (workerData as { diagnostics?: boolean } | undefined)?.diagnostics === true;

// Only a refused connection means gone: a game loading a track can be too slow to answer, and an answer cut off
// midway is asked again (a game that exited refuses the next one).
async function probeGame(): Promise<GameProbe> {
  const startedAt = Date.now();
  const answer = await lmuHttpGet(GAME_STATE_URL, PROBE_TIMEOUT_MS, diagnosticEnabled);
  const finishedAt = Date.now();
  if (diagnosticEnabled) {
    let body: unknown;
    let parser = 'not-run';
    if (answer.status === 'ok') {
      try { body = JSON.parse(answer.body) as unknown; parser = 'accepted'; }
      catch { body = answer.body.slice(0, 8192); parser = 'invalid-json'; }
    }
    parentPort?.postMessage({ type: 'diagnostic', event: { kind: 'reader-rest', at: finishedAt, data: {
      path: '/navigation/state', startedAt, finishedAt, durationMs: finishedAt - startedAt,
      outcome: answer.status === 'ok' && answer.statusCode !== 200 ? 'http-error' : answer.status,
      statusCode: answer.status === 'ok' ? answer.statusCode : undefined,
      ...(answer.status === 'ok' ? {} : answer.diagnostic),
      // A good reply is the same one the pit poller logs: keep the body only for an error or an unreadable reply.
      parser, disposition: 'probe', body: answer.status === 'ok' && answer.statusCode === 200 && parser === 'accepted' ? undefined : body,
      bodyTruncated: answer.status === 'ok' ? parser === 'invalid-json' && answer.body.length > 8192 : answer.diagnostic?.bodyTruncated,
    } } });
  }
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
