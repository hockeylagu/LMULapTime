import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const referenceCache = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../server/benchmarks/referenceLaptimes.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../server/benchmarks/referenceLaptimes.js')>(),
  loadReferenceLaptimesFromCache: referenceCache.load,
}));

import { createSystemRouter } from '../../../server/routes/systemRoutes.js';
import type { ServerContext } from '../../../server/core/serverContext.js';

const cacheStats = {
  enabled: true, dbPath: ':memory:', sessionsCount: 3, lastSyncedAt: null, dbSizeBytes: 0,
  replaysCount: 1, replayTrajectoriesCount: 1, telemetryFilesCount: 0,
};

function fakeContext(dir: string) {
  return {
    resultsDir: path.join(dir, 'results'),
    replaysDir: path.join(dir, 'missing-replays'),
    telemetryDir: path.join(dir, 'telemetry'),
    currentParser: { configuredPlayerName: 'Test Player' },
    loadSessions: vi.fn(() => [
      { trackVenue: 'Spa', trackCourse: 'Grand Prix' },
      { trackVenue: 'Spa', trackCourse: 'Grand Prix' },
      { trackVenue: 'Monza', trackCourse: 'GP' },
    ]),
    sessionDb: {
      getCacheStats: vi.fn(() => cacheStats),
      getIngestErrors: vi.fn(() => [{ filePath: 'bad.xml', error: 'truncated' }]),
      clearCache: vi.fn(),
    },
    telemetryCatalog: {
      getStatus: vi.fn(() => ({ running: false })),
      clear: vi.fn(),
    },
    hasActiveFileScan: vi.fn(() => false),
    configureDirectories: vi.fn(() => true),
    runSessionSyncInBackground: vi.fn(() => true),
    runTelemetryScanInBackground: vi.fn(),
    getScanStatus: vi.fn(() => ({ running: false, allComplete: true })),
  };
}

describe('system routes', () => {
  let dir: string;
  let context: ReturnType<typeof fakeContext>;
  let app: express.Express;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-system-route-'));
    fs.mkdirSync(path.join(dir, 'results'));
    fs.mkdirSync(path.join(dir, 'telemetry'));
    referenceCache.load.mockReturnValue(null);
    context = fakeContext(dir);
    app = express();
    app.use(express.json());
    app.use('/api', createSystemRouter(context as unknown as ServerContext));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  describe('GET /api/status', () => {
    it('reports which folders exist, the session and track counts and the cache', async () => {
      const res = await request(app).get('/api/status');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resultsExist: true, replaysExist: false, telemetryExist: true,
        playerName: 'Test Player', sessionsCount: 3, tracksCount: 2,
        referenceLaptimes: { lastUpdated: null, entriesCount: 0, lastUpdateDiff: null },
        sqliteCache: { sessionsCount: 3, replaysCount: 1, telemetryCatalog: { running: false }, ingestErrors: [{ filePath: 'bad.xml' }] },
      });
    });

    it('reports the downloaded benchmark table', async () => {
      referenceCache.load.mockReturnValue({ lastUpdated: '2026-09-20T00:00:00.000Z', entriesCount: 42, lastUpdateDiff: { updatedCount: 2 } });
      const res = await request(app).get('/api/status');
      expect(res.body.referenceLaptimes).toEqual({ lastUpdated: '2026-09-20T00:00:00.000Z', entriesCount: 42, lastUpdateDiff: { updatedCount: 2 } });
    });
  });

  describe('POST /api/cache/clear', () => {
    it('clears the cache and reports it empty', async () => {
      const res = await request(app).post('/api/cache/clear');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, sessionsCount: 0 });
      expect(context.sessionDb.clearCache).toHaveBeenCalledTimes(1);
    });

    it('refuses while a file scan is running, and leaves the cache alone', async () => {
      context.hasActiveFileScan.mockReturnValue(true);
      const res = await request(app).post('/api/cache/clear');
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/file scan is already running/i);
      expect(context.sessionDb.clearCache).not.toHaveBeenCalled();
    });

    it("answers 500 with the database's message when clearing fails", async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      context.sessionDb.clearCache.mockImplementation(() => { throw new Error('database is locked'); });
      const res = await request(app).post('/api/cache/clear');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'database is locked' });
    });
  });

  describe('POST /api/scan', () => {
    const folders = { resultsDir: 'C:/lmu/results', replaysDir: 'C:/lmu/replays', telemetryDir: 'C:/lmu/telemetry', playerName: 'New Name' };

    it('applies the folders and starts XML before associated telemetry scanning', async () => {
      const res = await request(app).post('/api/scan').send(folders);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, sessionScanStarted: true, replayScanStarted: true, telemetryScanStarted: true, sessionsCount: 3 });
      expect(context.configureDirectories).toHaveBeenCalledWith(folders);
      expect(context.telemetryCatalog.clear).toHaveBeenCalled();
      expect(context.runTelemetryScanInBackground).not.toHaveBeenCalled();
      expect(context.runSessionSyncInBackground).toHaveBeenCalled();
    });

    it('refuses to change folders while a scan is running, and starts nothing', async () => {
      context.configureDirectories.mockReturnValue(false);
      const res = await request(app).post('/api/scan').send(folders);

      expect(res.status).toBe(409);
      expect(context.telemetryCatalog.clear).not.toHaveBeenCalled();
      expect(context.runSessionSyncInBackground).not.toHaveBeenCalled();
    });

    it('starts XML before its associated replay and telemetry scans without reconfiguring directories', async () => {
      const res = await request(app).post('/api/scan').send({});

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, sessionScanStarted: true });
      expect(context.configureDirectories).not.toHaveBeenCalled();
      expect(context.telemetryCatalog.clear).not.toHaveBeenCalled();
      expect(context.runTelemetryScanInBackground).not.toHaveBeenCalled();
      expect(context.runSessionSyncInBackground).toHaveBeenCalled();
    });

    it('queues an empty-body refresh when a file scan is already active', async () => {
      context.runSessionSyncInBackground.mockReturnValue(false);

      const res = await request(app).post('/api/scan').send({});

      expect(res.status).toBe(200);
      expect(context.loadSessions).toHaveBeenCalledWith(true);
      expect(context.telemetryCatalog.clear).not.toHaveBeenCalled();
      expect(context.runTelemetryScanInBackground).not.toHaveBeenCalled();
    });
  });

  it('GET /api/scan/status returns the context scan status', async () => {
    const res = await request(app).get('/api/scan/status');
    expect(res.body).toEqual({ running: false, allComplete: true });
  });
});
