import http from 'node:http';

/**
 * One local GET to LMU, settled exactly once and never later than `deadlineMs` after it starts:
 * - `ok`: the whole body arrived (any status; callers check it),
 * - `timeout`: no complete answer within the deadline (a socket's own `timeout` is an idle timer, and an answer
 *   trickling in would never trip it),
 * - `aborted`: the connection dropped before the whole answer came (a reset: LMU drops requests in the last
 *   frozen seconds of a session load, seen 2026-10-16; or the game exiting while it answers),
 * - `error`: the connection was refused: the game is not there.
 * Without the deadline and the abort cases a caller that waits for one request at a time could wait forever.
 */
export type LmuHttpResult =
  | { status: 'ok'; statusCode: number; body: string }
  | { status: 'timeout' | 'aborted' | 'error'; diagnostic?: {
    statusCode?: number; bodyExcerpt: string; bodyTruncated: boolean; errorCode?: string;
  } };

export function lmuHttpGet(url: string, deadlineMs: number, captureFailure = false): Promise<LmuHttpResult> {
  return new Promise(resolve => {
    let settled = false;
    let partialBody = '';
    let partialTruncated = false;
    let statusCode: number | undefined;
    let errorCode: string | undefined;
    const settle = (result: LmuHttpResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (result.status !== 'ok') request.destroy();
      resolve(result.status !== 'ok' && captureFailure ? { ...result,
        diagnostic: { statusCode, bodyExcerpt: partialBody, bodyTruncated: partialTruncated, errorCode } } : result);
    };
    const request = http.get(url, response => {
      statusCode = response.statusCode;
      let body = '';
      let complete = false;
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
        if (captureFailure) {
          partialTruncated ||= partialBody.length + chunk.length > 8192;
          const remaining = 8192 - partialBody.length;
          if (remaining > 0) partialBody += chunk.length <= remaining ? chunk : chunk.slice(0, remaining);
        }
      });
      response.on('end', () => { complete = true; settle({ status: 'ok', statusCode: response.statusCode ?? 0, body }); });
      response.on('error', () => settle({ status: 'aborted' }));
      response.on('close', () => { if (!complete) settle({ status: 'aborted' }); });
    });
    const deadline = setTimeout(() => settle({ status: 'timeout' }), deadlineMs);
    deadline.unref();
    request.on('error', (error: NodeJS.ErrnoException) => {
      errorCode = error.code;
      settle({ status: error.code === 'ECONNREFUSED' ? 'error' : 'aborted' });
    });
  });
}
