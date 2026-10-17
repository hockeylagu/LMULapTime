import http from 'node:http';

/**
 * One local GET to LMU, settled exactly once and never later than `deadlineMs` after it starts:
 * - `ok`: the whole body arrived (any status; callers check it),
 * - `timeout`: no complete answer within the deadline (a socket's own `timeout` is an idle timer, and an answer
 *   trickling in would never trip it),
 * - `aborted`: the connection closed in the middle of the answer (the game exiting while it answers),
 * - `error`: no answer at all (refused: the game is not there).
 * Without the deadline and the abort cases a caller that waits for one request at a time could wait forever.
 */
export type LmuHttpResult =
  | { status: 'ok'; statusCode: number; body: string }
  | { status: 'timeout' | 'aborted' | 'error' };

export function lmuHttpGet(url: string, deadlineMs: number): Promise<LmuHttpResult> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: LmuHttpResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (result.status !== 'ok') request.destroy();
      resolve(result);
    };
    const request = http.get(url, response => {
      let body = '';
      let complete = false;
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => { complete = true; settle({ status: 'ok', statusCode: response.statusCode ?? 0, body }); });
      response.on('error', () => settle({ status: 'aborted' }));
      response.on('close', () => { if (!complete) settle({ status: 'aborted' }); });
    });
    const deadline = setTimeout(() => settle({ status: 'timeout' }), deadlineMs);
    deadline.unref();
    request.on('error', () => settle({ status: 'error' }));
  });
}
