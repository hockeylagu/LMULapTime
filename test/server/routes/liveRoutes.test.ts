import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerContext } from '../../../server/core/serverContext.js';
import { LiveService } from '../../../server/live/liveService.js';
import { createLiveRouter } from '../../../server/routes/liveRoutes.js';
import { LiveDiagnostics } from '../../../server/live/capture/diagnostics.js';
import type { LiveCaptureController } from '../../../server/live/capture/controller.js';
import { TypedEmitter } from '../../../server/core/typedEmitter.js';

function setup(stored: string | null = null, capture?: Parameters<typeof createLiveRouter>[2]) {
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
  app.use('/api', createLiveRouter(context, live, capture));
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
    expect((await request(setup().app).get('/api/live/settings')).body).toEqual({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
    expect((await request(setup('false').app).get('/api/live/settings')).body).toEqual({ autoOpen: false, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
  });

  it('stores a valid auto-open setting', async () => {
    const { app, metadata } = setup();
    const response = await request(app).post('/api/live/settings').send({ autoOpen: false });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ autoOpen: false, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
    expect(metadata.get('live_auto_open')).toBe('false');
  });

  it('stores the reserve alone, keeps auto-open, and hands the new reserve to the live service', async () => {
    const { app, live, metadata } = setup('false');
    const reserve = vi.spyOn(live, 'setReserveSeconds');
    const response = await request(app).post('/api/live/settings').send({ reserveSeconds: 30 });
    expect(response.body).toEqual({ autoOpen: false, reserveSeconds: 30, pedalTraceSeconds: 30, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
    expect(metadata.get('live_reserve_seconds')).toBe('30');
    expect(reserve).toHaveBeenCalledWith(30);
    expect((await request(app).post('/api/live/settings').send({ reserveSeconds: 40 })).status).toBe(400);
    expect((await request(app).post('/api/live/settings').send({ reserveLaps: 0.5 })).status).toBe(400);
  });

  it('persists trace duration independently and preserves the other settings', async () => {
    const { app, metadata } = setup('false');
    metadata.set('live_reserve_seconds', '90');
    expect((await request(app).post('/api/live/settings').send({ pedalTraceSeconds: 60 })).body).toEqual({ autoOpen: false, reserveSeconds: 90, pedalTraceSeconds: 60, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
    expect((await request(app).post('/api/live/settings').send({ pedalTraceSeconds: 25 })).body).toEqual({ autoOpen: false, reserveSeconds: 90, pedalTraceSeconds: 25, diagnostics: false, voice: true, voiceVolume: 80, voiceOutput: null });
    expect(metadata.get('live_pedal_trace_seconds')).toBe('25');
    expect((await request(app).get('/api/live/settings')).body).toHaveProperty('pedalTraceSeconds', 25);
    for (const pedalTraceSeconds of [0, -5, 31, 121, '60', null]) {
      expect((await request(app).post('/api/live/settings').send({ pedalTraceSeconds })).status).toBe(400);
    }
    expect(metadata.get('live_pedal_trace_seconds')).toBe('25');
  });

  it('stores the diagnostics setting and applies it to the recorder from the next session', async () => {
    const diagnostics = new LiveDiagnostics('unused', false);
    const capture = { directory: 'unused', status: () => ({ state: 'idle' }), diagnostics } as unknown as Pick<LiveCaptureController, 'directory' | 'status' | 'diagnostics'>;
    const { app, metadata } = setup(null, capture);
    const response = await request(app).post('/api/live/settings').send({ diagnostics: true });
    expect(response.body).toEqual({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: true, voice: true, voiceVolume: 80, voiceOutput: null });
    expect(metadata.get('live_diagnostics')).toBe('true');
    expect(diagnostics.enabled).toBe(true);
    expect((await request(app).post('/api/live/settings').send({ diagnostics: 'yes' })).status).toBe(400);
  });

  it('stores the voice switch and volume, and rejects other volumes', async () => {
    const { app, metadata, live } = setup();
    const setVoice = vi.spyOn(live, 'setVoice');
    expect((await request(app).post('/api/live/settings').send({ voice: false, voiceVolume: 40 })).body)
      .toEqual({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: false, voice: false, voiceVolume: 40, voiceOutput: null });
    expect(metadata.get('live_voice')).toBe('false');
    expect(metadata.get('live_voice_volume')).toBe('40');
    expect(setVoice).toHaveBeenLastCalledWith(false);
    for (const body of [{ voice: 'off' }, { voiceVolume: 0 }, { voiceVolume: 45 }, { voiceVolume: '80' }]) {
      expect((await request(app).post('/api/live/settings').send(body)).status).toBe(400);
    }
    expect((await request(app).get('/api/live/settings')).body).toMatchObject({ voice: false, voiceVolume: 40 });
  });

  it('stores the radio output, back to the Windows default with null, and rejects other values', async () => {
    const { app, metadata } = setup();
    expect((await request(app).post('/api/live/settings').send({ voiceOutput: 'a1b2' })).body).toMatchObject({ voiceOutput: 'a1b2', voice: true });
    expect(metadata.get('live_voice_output')).toBe('a1b2');
    for (const body of [{ voiceOutput: '' }, { voiceOutput: 4 }, { voiceOutput: 'x'.repeat(257) }]) {
      expect((await request(app).post('/api/live/settings').send(body)).status).toBe(400);
    }
    expect((await request(app).post('/api/live/settings').send({ voiceOutput: null })).body).toMatchObject({ voiceOutput: null });
  });

  it('records what a page says became of a radio call, once', async () => {
    const { app, live } = setup();
    const report = vi.spyOn(live, 'reportCall').mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect((await request(app).post('/api/live/calls/7/outcome').send({ outcome: 'spoken' })).body).toEqual({ recorded: true });
    expect((await request(app).post('/api/live/calls/7/outcome').send({ outcome: 'spoken' })).body).toEqual({ recorded: false });
    expect(report).toHaveBeenCalledWith(7, 'spoken');
    for (const [id, outcome] of [['7', 'expired'], ['7', 'queued'], ['x', 'spoken'], ['0', 'spoken']]) {
      expect((await request(app).post(`/api/live/calls/${id}/outcome`).send({ outcome })).status).toBe(400);
    }
    expect(report).toHaveBeenCalledTimes(2);
  });

  it.each([[{}], [{ autoOpen: 'yes' }], [{ autoOpen: 1 }], [{ autoOpen: null }]])('rejects %j with 400', async body => {
    const { app, metadata } = setup();
    const response = await request(app).post('/api/live/settings').send(body);
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', expect.stringMatching(/autoOpen/));
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

  it.each([null, 'false'] as const)('sends the initial auto-open decision when LMU is already running (setting %s)', async stored => {
    const { app, live } = setup(stored);
    vi.spyOn(live, 'isGameRunning').mockReturnValue(true);
    const { chunks } = await openStream(app, '/api/events');
    await vi.waitFor(() => expect(chunks.join('')).toContain(
      `event: game-running\ndata: ${JSON.stringify({ running: true, autoOpen: stored !== 'false' })}`));
  });

  it('does not auto-open another dashboard when one is already connected on initial load', async () => {
    const { app, live } = setup();
    vi.spyOn(live, 'isGameRunning').mockReturnValue(true);
    await openStream(app, '/api/live/stream');
    await vi.waitFor(() => expect(live.hasClients()).toBe(true));
    const { chunks } = await openStream(app, '/api/events');
    await vi.waitFor(() => expect(chunks.join('')).toContain('"running":true,"autoOpen":false'));
  });

  it('tells open pages once per LMU launch, so they switch to the dashboard (the app never opens a window)', async () => {
    const { app, live } = setup();
    const { response, chunks } = await openStream(app, '/api/events');
    expect(response.statusCode).toBe(200);
    live.events.emit('game-running', true);
    live.events.emit('lifecycle', 'garage');
    live.events.emit('lifecycle', 'driving');
    await vi.waitFor(() => expect(gameStarts(chunks)).toBe(1));
    live.events.emit('game-running', false);
    live.events.emit('game-running', true);
    await vi.waitFor(() => expect(gameStarts(chunks)).toBe(2));
  });

  it('tells each page whether LMU is running on connect, then whenever it starts or closes', async () => {
    const { app, live } = setup();
    const { chunks } = await openStream(app, '/api/events');
    const running = () => [...chunks.join('').matchAll(/event: game-running\ndata: (\{.*?\})/g)]
      .map(([, data]) => (JSON.parse(data) as { running: boolean }).running);
    await vi.waitFor(() => expect(running()).toEqual([false]));
    live.events.emit('game-running', true);
    live.events.emit('lifecycle', 'garage');
    live.events.emit('game-running', false);
    await vi.waitFor(() => expect(running()).toEqual([false, true, false]));
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
    live.events.emit('game-running', true);
    events.emit('scan-started');
    await vi.waitFor(() => expect(chunks.join('')).toContain('event: scan-started'));
    expect(gameStarts(chunks)).toBe(0);
  });
});
