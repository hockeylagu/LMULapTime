import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerContext } from '../../../server/core/serverContext.js';
import { LiveService } from '../../../server/live/liveService.js';
import { createLiveRouter } from '../../../server/routes/liveRoutes.js';
import { TypedEmitter } from '../../../server/core/typedEmitter.js';

function setup(stored: string | null = null) {
  const metadata = new Map<string, string>();
  if (stored !== null) metadata.set('live_auto_open', stored);
  const events = new TypedEmitter<{ 'scan-started': []; 'scan-finished': [] }>();
  const context = {
    events,
    sessionDb: {
      getMetadata: vi.fn((key: string) => metadata.get(key) ?? null),
      setMetadata: vi.fn((key: string, value: string) => { metadata.set(key, value); }),
    },
  } as unknown as ServerContext;
  const live = new LiveService({ createWorker: () => { throw new Error('no worker in tests'); } });
  const app = express();
  app.use(express.json());
  app.use('/api', createLiveRouter(context, live));
  return { app, context, events, live, metadata };
}

describe('live routes', () => {
  const servers: http.Server[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      server.close();
    }
  });

  it('reads the auto-open setting, on by default', async () => {
    expect((await request(setup().app).get('/api/live/settings')).body).toEqual({ autoOpen: true, reserveLaps: 0.5 });
    expect((await request(setup('false').app).get('/api/live/settings')).body).toEqual({ autoOpen: false, reserveLaps: 0.5 });
  });

  it('stores a valid auto-open setting', async () => {
    const { app, metadata } = setup();
    const response = await request(app).post('/api/live/settings').send({ autoOpen: false });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ autoOpen: false, reserveLaps: 0.5 });
    expect(metadata.get('live_auto_open')).toBe('false');
  });

  it('stores the reserve alone, keeps auto-open, and hands the new reserve to the live service', async () => {
    const { app, live, metadata } = setup('false');
    const reserve = vi.spyOn(live, 'setReserveLaps');
    const response = await request(app).post('/api/live/settings').send({ reserveLaps: 1 });
    expect(response.body).toEqual({ autoOpen: false, reserveLaps: 1 });
    expect(metadata.get('live_reserve_laps')).toBe('1');
    expect(reserve).toHaveBeenCalledWith(1);
    expect((await request(app).post('/api/live/settings').send({ reserveLaps: 0.3 })).status).toBe(400);
  });

  it.each([[{}], [{ autoOpen: 'yes' }], [{ autoOpen: 1 }], [{ autoOpen: null }]])('rejects %j with 400', async body => {
    const { app, metadata } = setup();
    const response = await request(app).post('/api/live/settings').send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/autoOpen/);
    expect(metadata.size).toBe(0);
  });


  async function openStream(app: express.Express, path: string): Promise<{ response: http.IncomingMessage; chunks: string[] }> {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const chunks: string[] = [];
    const response = await new Promise<http.IncomingMessage>(resolve => {
      http.get({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path }, incoming => {
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => chunks.push(chunk));
        resolve(incoming);
      });
    });
    return { response, chunks };
  }

  it('streams the live snapshot as server-sent events and removes the page when it disconnects', async () => {
    const { app, live } = setup();
    const { response, chunks } = await openStream(app, '/api/live/stream');
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no',
    });
    await vi.waitFor(() => expect(chunks.join('')).toContain('event: snapshot'));
    expect(live.hasClients()).toBe(true);
    response.destroy();
    await vi.waitFor(() => expect(live.hasClients()).toBe(false));
  });

  it('streams the app events', async () => {
    const { app, events } = setup();
    const { chunks } = await openStream(app, '/api/events');
    events.emit('scan-started');
    events.emit('scan-finished');
    await vi.waitFor(() => expect(chunks.join('')).toMatch(/event: scan-started\ndata: \{"at":\d+\}\n\nevent: scan-finished/));
  });

  const gameStarts = (chunks: string[]) => chunks.join('').match(/event: game-started/g)?.length ?? 0;

  it('tells open pages once per LMU launch, so they switch to the dashboard (the app never opens a window)', async () => {
    const { app, live } = setup();
    const { response, chunks } = await openStream(app, '/api/events');
    expect(response.statusCode).toBe(200);
    live.events.emit('lifecycle', 'menu');
    live.events.emit('lifecycle', 'garage');
    live.events.emit('lifecycle', 'driving');
    await vi.waitFor(() => expect(gameStarts(chunks)).toBe(1));
    live.events.emit('lifecycle', 'offline');
    live.events.emit('lifecycle', 'menu');
    await vi.waitFor(() => expect(gameStarts(chunks)).toBe(2));
  });

  it.each([
    ['the setting is off', 'false', false],
    ['a dashboard page is already connected', null, true],
  ] as const)('stays quiet when LMU starts and %s', async (_case, stored, dashboardOpen) => {
    const { app, live, events } = setup(stored);
    if (dashboardOpen) {
      await openStream(app, '/api/live/stream');
      await vi.waitFor(() => expect(live.hasClients()).toBe(true));
    }
    const { chunks } = await openStream(app, '/api/events');
    live.events.emit('lifecycle', 'menu');
    events.emit('scan-started');
    await vi.waitFor(() => expect(chunks.join('')).toContain('event: scan-started'));
    expect(gameStarts(chunks)).toBe(0);
  });
});
