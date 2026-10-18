import express from 'express';
import cors from 'cors';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { resetSessionDatabaseForTest } from '../../server/core/db.js';
import { resetCachedReferenceLaptimes } from '../../server/benchmarks/referenceLaptimes.js';
import { LmuParser } from '../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../server/telemetry/telemetryCatalog.js';
import { ReplayRecordingService } from '../../server/replay/replayRecordingService.js';
import { ServerContext } from '../../server/core/serverContext.js';
import { createAiRouter } from '../../server/routes/aiRoutes.js';
import { createDataPluginRouter } from '../../server/routes/dataPluginRoutes.js';
import { createSystemRouter } from '../../server/routes/systemRoutes.js';
import { createReferenceRouter } from '../../server/routes/referenceRoutes.js';
import { createSessionRouter } from '../../server/routes/sessionRoutes.js';
import { createLeaderboardRouter } from '../../server/routes/leaderboardRoutes.js';
import { createReplayRouter } from '../../server/routes/replayRoutes.js';
import { createLiveRouter } from '../../server/routes/liveRoutes.js';
import { createLiveEvidenceRouter } from '../../server/routes/liveEvidenceRoutes.js';
import { LiveService } from '../../server/live/liveService.js';

/** SQLite backup includes committed WAL data and never modifies the user's database. */
export async function snapshotDatabase(sourcePath: string, destination: string): Promise<void> {
  if (path.resolve(sourcePath) === path.resolve(destination) || fs.existsSync(destination)) {
    throw new Error('Snapshot destination must be a new, separate file.');
  }
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try { await source.backup(destination); }
  finally { source.close(); }
}

/** Production routers and services, without index.ts's scans or external benchmark refresh. */
export async function startBenchmarkServer(snapshot: string) {
  const store = resetSessionDatabaseForTest(snapshot);
  // Rebuild versioned summaries on the isolated copy before measuring ready-state requests.
  while (!store.isSessionSummaryReady()) {
    const batch = store.backfillSessionSummaryBatch(25);
    if (batch.failed.length || batch.processed === 0) {
      store.close();
      throw new Error('Cannot benchmark: isolated session-summary rebuild failed.');
    }
  }
  resetCachedReferenceLaptimes();
  // Retained recordings only; benchmark requests must never decode a live VCR file.
  const absent = path.join(path.dirname(snapshot), 'no-live-recordings');
  const parser = new LmuParser(absent, absent, { indexReplays: false, readReplayMetadata: false, detectPlayer: false });
  const player = store.getDb().prepare(`SELECT n.name FROM session_drivers d JOIN drivers n ON n.driver_id=d.driver_id
    WHERE d.is_player=1 GROUP BY n.name ORDER BY count(*) DESC,n.name LIMIT 1`).get() as { name: string } | undefined;
  parser.configuredPlayerName = player?.name ?? '';
  const context = new ServerContext({
    sessionDb: store, parser, resultsDir: absent, replaysDir: absent, telemetryDir: absent,
    telemetryCatalog: new TelemetryCatalog(store), replayRecordings: new ReplayRecordingService(store),
  });
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/data-plugin', createDataPluginRouter());
  app.use('/api/ai', createAiRouter(store));
  app.use('/api', createSystemRouter(context));
  app.use('/api', createReferenceRouter(context));
  app.use('/api', createSessionRouter(context));
  app.use('/api', createLeaderboardRouter(context));
  app.use('/api', createReplayRouter(context));
  app.use('/api', createLiveRouter(context, new LiveService()));
  app.use('/api', createLiveEvidenceRouter(context, absent));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    store, baseUrl,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      store.close();
      resetCachedReferenceLaptimes();
    },
  };
}

export interface HttpSample { ms: number; bytes: number; status: number; body: unknown; }

export async function measureRequest(baseUrl: string, url: string): Promise<HttpSample> {
  const start = performance.now();
  const response = await fetch(new URL(url, baseUrl), { signal: AbortSignal.timeout(120_000), headers: { Connection: 'close' } });
  const buffer = await response.arrayBuffer();
  const ms = performance.now() - start;
  const text = Buffer.from(buffer).toString('utf8');
  let body: unknown;
  try { body = JSON.parse(text); }
  catch {
    const detail = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (response.ok) throw new Error(`HTTP ${response.status}: Expected JSON; received ${detail || 'an empty response'}`);
    body = { error: detail || response.statusText || 'Non-JSON error response' };
  }
  return { ms, bytes: buffer.byteLength, status: response.status, body };
}
