import { Router } from 'express';
import { Readable } from 'node:stream';
import { iterateAuditHistory, readAuditHistory } from '../live/audit/history.js';
import { LiveAuditReader } from '../live/audit/reader.js';
import type { AuditPageReader } from '../live/audit/reader.js';
import { AuditReadError } from '../live/audit/readPage.js';
import { exportLiveAudit } from '../live/audit/export.js';
import type { Response } from 'express';
import type { RequestHandler } from 'express';
import { APP_EVENTS, LIVE_HEARTBEAT_MS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_LAP_CHOICES } from '../../shared/types/live.js';
import type { ServerContext } from '../core/serverContext.js';
import type { LiveService } from '../live/liveService.js';
import { isPedalTraceSeconds, isReserveLaps, loadLiveSettings, saveLiveSettings } from '../live/liveSettings.js';
import { SSE_HEADERS, writeSseEvent } from '../live/sse.js';
import type { LiveCaptureController } from '../live/capture/controller.js';
import { LIVE_CAPTURE_CHANNELS } from '../live/capture/channels.js';
import { LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SCHEMA_VERSION } from '../../shared/types/liveCapture.js';

function openStream(res: Response): void {
  res.writeHead(200, SSE_HEADERS);
  res.flushHeaders();
}

export function createLiveRouter(context: ServerContext, live: LiveService,
  capture?: Pick<LiveCaptureController, 'directory' | 'status'> & Partial<Pick<LiveCaptureController, 'hasOpenRecordingHandle'>>,
  readAuditPage?: AuditPageReader): Router {
  const router = Router();
  const auditReader = new LiveAuditReader();
  router.get('/live/capture', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ source: 'live-capture', schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
      normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION, directory: capture?.directory ?? null,
      ...(capture?.status() ?? { state: 'idle', recordingId: null, samples: 0, droppedSamples: 0, pendingBatches: 0, error: null }),
      channels: LIVE_CAPTURE_CHANNELS });
  });

  // Optional UUID selects one capture; omitted exports all saved captures, including interrupted runs.
  const auditHistory: RequestHandler = async (req, res, next) => {
    const runId = req.query.runId;
    if (Object.keys(req.query).some(key => key !== 'runId') || (runId !== undefined && (typeof runId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(runId)))) {
      return res.status(400).json({ error: 'runId must identify one saved live capture.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const options = { db: context.sessionDb.getDb(), directory: capture?.directory ?? null, runId: runId ?? null,
      blocked: () => res.destroyed || live.isSessionLoaded() || capture?.hasOpenRecordingHandle === true,
      read: readAuditPage ?? ((request) => auditReader.read(request)) };
    try {
      if (!req.path.endsWith('.csv')) return res.json(await readAuditHistory(options));
      const records = iterateAuditHistory(options);
      // Preflight the first record before committing response headers, including loaded/busy errors.
      const first = await records.next();
      if (res.destroyed) { await records.return(undefined); return; }
      async function* history() {
        try { if (!first.done) yield first.value; yield* records; }
        finally { await records.return(undefined); }
      }
      res.type('text/csv').attachment(runId ? `lmu-strategy-${runId}.csv` : 'lmu-strategy-history.csv');
      const stream = Readable.from(exportLiveAudit(history()));
      stream.on('error', error => { if (res.headersSent) res.destroy(error); else next(error); });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof AuditReadError) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  };
  router.get('/live/audit', auditHistory);
  router.get('/live/audit.csv', auditHistory);

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
    const body = (req.body ?? {}) as { autoOpen?: unknown; reserveLaps?: unknown; pedalTraceSeconds?: unknown };
    const current = loadLiveSettings(context.sessionDb);
    if (body.autoOpen === undefined && body.reserveLaps === undefined && body.pedalTraceSeconds === undefined) {
      return res.status(400).json({ error: 'Send autoOpen (true or false), reserveLaps, or pedalTraceSeconds.' });
    }
    if (body.autoOpen !== undefined && typeof body.autoOpen !== 'boolean') return res.status(400).json({ error: 'autoOpen must be true or false.' });
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
    });
    const saved = loadLiveSettings(context.sessionDb);
    live.setReserveLaps(saved.reserveLaps);
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
