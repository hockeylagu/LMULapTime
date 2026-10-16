import { Router } from 'express';
import type { Response } from 'express';
import { APP_EVENTS, LIVE_HEARTBEAT_MS } from '../../shared/types/live.js';
import type { ServerContext } from '../core/serverContext.js';
import type { LiveService } from '../live/liveService.js';
import { isReserveLaps, loadLiveSettings, RESERVE_LAP_CHOICES, saveLiveSettings } from '../live/liveSettings.js';
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

  // Either setting may be sent alone; the other keeps its stored value.
  router.post('/live/settings', (req, res) => {
    const body = (req.body ?? {}) as { autoOpen?: unknown; reserveLaps?: unknown };
    const current = loadLiveSettings(context.sessionDb);
    if (body.autoOpen === undefined && body.reserveLaps === undefined) {
      return res.status(400).json({ error: 'Send autoOpen (true or false), reserveLaps, or both.' });
    }
    if (body.autoOpen !== undefined && typeof body.autoOpen !== 'boolean') return res.status(400).json({ error: 'autoOpen must be true or false.' });
    if (body.reserveLaps !== undefined && !isReserveLaps(body.reserveLaps)) {
      return res.status(400).json({ error: `reserveLaps must be one of ${RESERVE_LAP_CHOICES.join(', ')}.` });
    }
    saveLiveSettings(context.sessionDb, {
      autoOpen: typeof body.autoOpen === 'boolean' ? body.autoOpen : current.autoOpen,
      reserveLaps: isReserveLaps(body.reserveLaps) ? body.reserveLaps : current.reserveLaps,
    });
    const saved = loadLiveSettings(context.sessionDb);
    live.setReserveLaps(saved.reserveLaps);
    res.json(saved);
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
