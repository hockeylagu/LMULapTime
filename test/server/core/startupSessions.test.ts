import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { SessionDatabase } from '../../../server/core/db.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import type { Worker } from 'node:worker_threads';
import { FileIngestWorker } from '../../../server/core/ingest/fileIngestWorkerClient.js';
import { createSessionRouter } from '../../../server/routes/sessionRoutes.js';

// What the web app shows: /api/sessions, reloaded once the session scan finishes (useAppData).
const fixture = fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'results', '2026_05_28_P1.xml'));

describe('sessions on the web after a server start', () => {
  let root: string;
  let resultsDir: string;
  let db: SessionDatabase;
  let context: ServerContext;
  let app: express.Express;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-startup-web-'));
    resultsDir = path.join(root, 'Results');
    for (const dir of [resultsDir, path.join(root, 'Replays'), path.join(root, 'Telemetry')]) fs.mkdirSync(dir);
    db = new SessionDatabase(path.join(root, 'cache.db'));
    context = new ServerContext({
      resultsDir, replaysDir: path.join(root, 'Replays'), telemetryDir: path.join(root, 'Telemetry'),
      parser: new LmuParser(undefined, undefined, { detectPlayer: false }),
      sessionDb: db, telemetryCatalog: new TelemetryCatalog(db), replayRecordings: new ReplayRecordingService(db),
    });
    app = express();
    app.use('/api', createSessionRouter(context));
  });

  afterEach(async () => {
    await vi.waitFor(() => expect(context.getScanStatus().allComplete).toBe(true), { timeout: 10_000 });
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writeSession = (name: string, content: Buffer = fixture) => fs.writeFileSync(path.join(resultsDir, name), content);
  const shownSessions = async (): Promise<string[]> =>
    ((await request(app).get('/api/sessions').expect(200)).body as { sessions: Array<{ filename: string }> }).sessions.map(s => s.filename).sort();
  const scanFinished = () => vi.waitFor(() => expect(context.getScanStatus().allComplete).toBe(true), { timeout: 10_000 });

  it('shows every session that is new since the last run once the startup scan finishes', async () => {
    writeSession('2026_10_05_20_12_31-51Q1.xml');
    writeSession('2026_10_05_21_22_50-68R1.xml');

    context.runInitialSessionSyncInBackground();
    await scanFinished();

    expect(await shownSessions()).toEqual(['2026_10_05_20_12_31-51Q1.xml', '2026_10_05_21_22_50-68R1.xml']);
  });

  it('still shows the newest sessions when the XML worker dies during the startup scan', async () => {
    for (const name of ['2026_10_05_20_12_31-51Q1.xml', '2026_10_05_20_37_38-93R1.xml', '2026_10_05_21_22_50-68R1.xml']) writeSession(name);
    const parse = FileIngestWorker.prototype.parseXml;
    let calls = 0;
    vi.spyOn(FileIngestWorker.prototype, 'parseXml').mockImplementation(function (this: FileIngestWorker, ...args) {
      const parsing = parse.apply(this, args);
      // The worker thread dies while it reads the first file; before the fix every later (newer) file failed with it.
      if (++calls === 1) void (this as unknown as { worker: Worker }).worker.terminate();
      return parsing;
    });

    context.runInitialSessionSyncInBackground();
    await scanFinished();

    expect(await shownSessions()).toHaveLength(3);
  });

});
