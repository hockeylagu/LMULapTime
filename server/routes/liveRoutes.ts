import { Router } from 'express';
import type { Response } from 'express';
import { APP_EVENTS, LIVE_HEARTBEAT_MS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_LAP_CHOICES } from '../../shared/types/live.js';
import type { ServerContext } from '../core/serverContext.js';
import type { LiveService } from '../live/liveService.js';
import { isPedalTraceSeconds, isReserveLaps, loadLiveSettings, saveLiveSettings } from '../live/liveSettings.js';
import { SSE_HEADERS, writeSseEvent } from '../live/sse.js';
import type { LiveCaptureController } from '../live/capture/controller.js';
import { LIVE_CAPTURE_CHANNELS } from '../live/capture/channels.js';
import { LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SCHEMA_VERSION } from '../../shared/types/liveCapture.js';
import { LearningReadinessError, LearningReadinessReader } from '../live/learning/readinessReader.js';
import type { ReadLearningReadiness } from '../live/learning/readinessReader.js';
import type { LiveLearningReadiness } from '../../shared/types/liveLearning.js';

function openStream(res: Response): void {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders();
}

export function createLiveRouter(context: ServerContext, live: LiveService,
  capture?: Pick<LiveCaptureController, 'directory' | 'status'> & Partial<Pick<LiveCaptureController, 'hasOpenRecordingHandle' | 'diagnostics'>>,
  readReadiness?: ReadLearningReadiness): Router {
  const router = Router();
  const readinessReader = new LearningReadinessReader();
  const deferredReadiness = (): LiveLearningReadiness => ({ state: 'deferred', historicalCorrectionsEnabled: false,
    message: 'Evidence checks resume after you leave the game session and its recording closes.' });
  router.get('/live/learning', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Learning readiness does not accept query parameters.' });
    const blocked = (): boolean => live.isSessionLoaded() || capture?.hasOpenRecordingHandle === true;
    if (blocked()) return res.json(deferredReadiness());
    const abort = new AbortController();
    const cancel = (): void => abort.abort();
    const stopLoaded = live.events.on('session-loaded', loaded => { if (loaded) cancel(); });
    res.once('close', cancel);
    try {
      const filename = context.sessionDb.getDb().name;
      const report = await (readReadiness ?? ((file, signal) => readinessReader.read(file, signal)))(filename, abort.signal);
      if (res.destroyed) return;
      return res.json(blocked() || abort.signal.aborted ? deferredReadiness() : report);
    } catch (error) {
      if (res.destroyed) return;
      if (blocked() || abort.signal.aborted) return res.json(deferredReadiness());
      return res.status(error instanceof LearningReadinessError ? error.status : 500)
        .json({ error: error instanceof Error ? error.message : 'Unable to check learning evidence.' });
    } finally { stopLoaded(); res.off('close', cancel); }
  });
  router.get('/live/capture', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ source: 'live-capture', schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
      normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION, directory: capture?.directory ?? null,
      ...(capture?.status() ?? { state: 'idle', recordingId: null, samples: 0, droppedSamples: 0, pendingBatches: 0, error: null }),
      channels: LIVE_CAPTURE_CHANNELS });
  });

  router.get('/live/stream', (req, res) => {
    openStream(res);
    const remove = live.addClient(res);
    req.on('close', remove);
  });

  router.get('/live/settings', (_req, res) => {
    res.json(loadLiveSettings(context.sessionDb));
  });

  // Any setting may be sent alone; the others keep their stored values.
  router.post('/live/settings', (req, res) => {
    const body = (req.body ?? {}) as { autoOpen?: unknown; reserveLaps?: unknown; pedalTraceSeconds?: unknown; diagnostics?: unknown };
    const current = loadLiveSettings(context.sessionDb);
    if (body.autoOpen === undefined && body.reserveLaps === undefined && body.pedalTraceSeconds === undefined && body.diagnostics === undefined) {
      return res.status(400).json({ error: 'Send autoOpen (true or false), reserveLaps, pedalTraceSeconds, or diagnostics (true or false).' });
    }
    if (body.autoOpen !== undefined && typeof body.autoOpen !== 'boolean') return res.status(400).json({ error: 'autoOpen must be true or false.' });
    if (body.diagnostics !== undefined && typeof body.diagnostics !== 'boolean') return res.status(400).json({ error: 'diagnostics must be true or false.' });
    if (body.reserveLaps !== undefined && !isReserveLaps(body.reserveLaps)) {
      return res.status(400).json({ error: `reserveLaps must be one of ${RESERVE_LAP_CHOICES.join(', ')}.` });
    }
    if (body.pedalTraceSeconds !== undefined && !isPedalTraceSeconds(body.pedalTraceSeconds)) {
      return res.status(400).json({ error: `pedalTraceSeconds must be one of ${PEDAL_TRACE_SECONDS_CHOICES.join(', ')}.` });
    }
    saveLiveSettings(context.sessionDb, {
      autoOpen: typeof body.autoOpen === 'boolean' ? body.autoOpen : current.autoOpen,
      reserveLaps: isReserveLaps(body.reserveLaps) ? body.reserveLaps : current.reserveLaps,
      pedalTraceSeconds: isPedalTraceSeconds(body.pedalTraceSeconds) ? body.pedalTraceSeconds : current.pedalTraceSeconds,
      diagnostics: typeof body.diagnostics === 'boolean' ? body.diagnostics : current.diagnostics,
    });
    const saved = loadLiveSettings(context.sessionDb);
    live.setReserveLaps(saved.reserveLaps);
    if (capture?.diagnostics) capture.diagnostics.enabled = saved.diagnostics;
    res.json(saved);
  });

  // App-wide events: the server can start a scan by itself (after a game session), and pages reload their data when it ends.
  // When LMU's process starts, an open app page switches to the dashboard if the setting is on and no
  // dashboard page is connected yet. The app never opens a browser window itself.
  router.get('/events', (req, res) => {
    openStream(res);
    const publish = (event: string): void => {
      try { writeSseEvent(res, event, { at: Date.now() }); } catch { /* the connection is closing */ }
    };
    const stopStarted = context.events.on('scan-started', () => publish(APP_EVENTS.scanStarted));
    const stopFinished = context.events.on('scan-finished', () => publish(APP_EVENTS.scanFinished));
    let running = live.isGameRunning();
    // Whether LMU is running, so a page that was not switched to the dashboard can offer it.
    const publishRunning = (): void => {
      try { writeSseEvent(res, APP_EVENTS.gameRunning, { running }); } catch { /* the connection is closing */ }
    };
    publishRunning();
    const stopRunning = live.events.on('game-running', next => {
      const started = !running && next;
      running = next;
      publishRunning();
      if (started && !live.hasClients() && loadLiveSettings(context.sessionDb).autoOpen) publish(APP_EVENTS.gameStarted);
    });
    const heartbeat = setInterval(() => publish(APP_EVENTS.heartbeat), LIVE_HEARTBEAT_MS);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      stopStarted();
      stopFinished();
      stopRunning();
    });
  });

  return router;
}
