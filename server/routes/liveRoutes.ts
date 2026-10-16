import { Router } from 'express';
import type { Response } from 'express';
import { APP_EVENTS, LIVE_HEARTBEAT_MS } from '../../shared/types/live.js';
import type { ServerContext } from '../core/serverContext.js';
import type { LiveService } from '../live/liveService.js';
import { loadLiveSettings, saveLiveSettings } from '../live/liveSettings.js';
import { SSE_HEADERS, writeSseEvent } from '../live/sse.js';

function openStream(res: Response): void {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders();
}

export function createLiveRouter(context: ServerContext, live: LiveService): Router {
  const router = Router();

  router.get('/live/stream', (req, res) => {
    openStream(res);
    const remove = live.addClient(res);
    req.on('close', remove);
  });

  router.get('/live/settings', (_req, res) => {
    res.json(loadLiveSettings(context.sessionDb));
  });

  router.post('/live/settings', (req, res) => {
    const autoOpen = (req.body as { autoOpen?: unknown } | undefined)?.autoOpen;
    if (typeof autoOpen !== 'boolean') return res.status(400).json({ error: 'autoOpen must be true or false.' });
    saveLiveSettings(context.sessionDb, { autoOpen });
    res.json(loadLiveSettings(context.sessionDb));
  });

  // App-wide events: the server can start a scan by itself (after a game session), and pages reload their data when it ends.
  // When LMU starts (the lifecycle leaves offline), an open app page switches to the dashboard if the setting is on and no
  // dashboard page is connected yet. The app never opens a browser window itself.
  router.get('/events', (req, res) => {
    openStream(res);
    const publish = (event: string): void => {
      try { writeSseEvent(res, event, { at: Date.now() }); } catch { /* the connection is closing */ }
    };
    const stopStarted = context.events.on('scan-started', () => publish(APP_EVENTS.scanStarted));
    const stopFinished = context.events.on('scan-finished', () => publish(APP_EVENTS.scanFinished));
    let lifecycle = live.getSnapshot().lifecycle;
    const stopLifecycle = live.events.on('lifecycle', next => {
      const started = lifecycle === 'offline' && next !== 'offline';
      lifecycle = next;
      if (started && !live.hasClients() && loadLiveSettings(context.sessionDb).autoOpen) publish(APP_EVENTS.gameStarted);
    });
    const heartbeat = setInterval(() => publish(APP_EVENTS.heartbeat), LIVE_HEARTBEAT_MS);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      stopStarted();
      stopFinished();
      stopLifecycle();
    });
  });

  return router;
}
