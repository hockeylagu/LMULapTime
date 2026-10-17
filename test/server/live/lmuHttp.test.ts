import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lmuHttpGet } from '../../../server/live/lmuHttp.js';

const DEADLINE_MS = 150;
let server: http.Server;
let origin = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(404); res.end('{"a":1}'); return; }
    if (req.url === '/reset') { req.socket.resetAndDestroy(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"a":');
    if (req.url === '/abort') { setTimeout(() => req.socket.destroy(), 20); return; }
    // Trickles a byte well inside any idle timeout, for longer than the deadline.
    const timer = setInterval(() => res.write(' '), 40);
    setTimeout(() => { clearInterval(timer); res.end('1}'); }, DEADLINE_MS * 3);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => { server.close(resolve); });
});

describe('lmuHttpGet', () => {
  it('returns the whole body with its status', async () => {
    expect(await lmuHttpGet(`${origin}/ok`, DEADLINE_MS)).toEqual({ status: 'ok', statusCode: 404, body: '{"a":1}' });
  });

  it('gives up at the deadline on an answer that keeps trickling in', async () => {
    const start = Date.now();
    expect(await lmuHttpGet(`${origin}/trickle`, DEADLINE_MS)).toEqual({ status: 'timeout' });
    expect(Date.now() - start).toBeLessThan(DEADLINE_MS * 2);
  });

  it('settles when the connection drops in the middle of the answer', async () => {
    expect(await lmuHttpGet(`${origin}/abort`, 5000)).toEqual({ status: 'aborted' });
  });

  it('reports a connection reset before any answer as aborted, not as a game that is gone', async () => {
    expect(await lmuHttpGet(`${origin}/reset`, 5000)).toEqual({ status: 'aborted' });
  });

  it('reports a refused connection as an error', async () => {
    const closed = http.createServer();
    await new Promise<void>(resolve => { closed.listen(0, '127.0.0.1', resolve); });
    const port = (closed.address() as AddressInfo).port;
    await new Promise(resolve => { closed.close(resolve); });
    expect(await lmuHttpGet(`http://127.0.0.1:${port}/`, DEADLINE_MS)).toEqual({ status: 'error' });
  });
});
