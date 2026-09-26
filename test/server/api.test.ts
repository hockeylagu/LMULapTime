import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '../../server/index.js';
import * as refModule from '../../server/benchmarks/referenceLaptimes.js';
import { createSliceVcrBuffer } from '../utils/mockVcr.js';

describe('Server API routes', () => {
  const waitForFileScans = async (): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await request(app).get('/api/scan/status');
      if (status.body.allComplete) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('File scans did not finish during the test setup window');
  };

  beforeAll(waitForFileScans);

  beforeEach(async () => {
    await waitForFileScans();
    vi.restoreAllMocks();
  });

  it('GET /api/status returns application status', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('resultsDir');
    expect(res.body).toHaveProperty('replaysDir');
    expect(res.body).toHaveProperty('telemetryDir');
    expect(res.body).toHaveProperty('telemetryExist');
    expect(res.body).toHaveProperty('sessionsCount');
    expect(res.body).toHaveProperty('referenceLaptimes');
    expect(res.body).toHaveProperty('sqliteCache');
    expect(res.body.sqliteCache).toHaveProperty('enabled', true);
    expect(typeof res.body.sqliteCache.sessionsCount).toBe('number');
  });

  it('GET /api/scan/status reports the session and replay scan states', async () => {
    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('running');
    expect(res.body).toHaveProperty('sessionScan');
    expect(res.body.sessionScan).toHaveProperty('running', false);
    expect(res.body).toHaveProperty('referenceLaptimes');
    expect(res.body.referenceLaptimes).toMatchObject({ started: false, checked: false, running: false });
  });

  it('POST /api/cache/clear clears the SQLite cache', async () => {
    const res = await request(app).post('/api/cache/clear');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('sessionsCount', 0);
    expect(res.body.sqliteCache).toHaveProperty('sessionsCount', 0);
  });

  it('POST /api/cache/clear rejects while file processing is active', async () => {
    const scan = await request(app)
      .post('/api/scan')
      .send({
        resultsDir: path.join(process.cwd(), 'test', 'fixtures', 'results'),
        replaysDir: path.join(process.cwd(), 'test', 'fixtures', 'replays'),
        playerName: 'TestPlayer',
      });
    expect(scan.status).toBe(200);

    const clear = await request(app).post('/api/cache/clear');

    expect(clear.status).toBe(409);
    expect(clear.body.error).toMatch(/file scan is already running/i);
    await waitForFileScans();
  });

  it('GET /api/sessions returns session summaries and supports filtering', async () => {
    const res = await request(app).get('/api/sessions?refresh=true&track=Spa&sessionType=Practice&carClass=Hypercar&driver=TestPlayer&hideEmpty=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const allRes = await request(app).get('/api/sessions?track=All&sessionType=All&carClass=All&refresh=false');
    expect(allRes.status).toBe(200);
    expect(Array.isArray(allRes.body)).toBe(true);
  });

  it('GET /api/session/:id returns session details or 404', async () => {
    const successRes = await request(app).get('/api/session/2026_05_28_P1.xml');
    if (successRes.status === 200) {
      expect(successRes.body).toHaveProperty('trackVenue', 'Spa');
      expect(successRes.body).toHaveProperty('drivers');
    }

    const notFoundRes = await request(app).get('/api/session/nonexistent-session-id-12345');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body).toHaveProperty('error', 'Session not found');
  });

  it('GET /api/progression returns progression array with filters', async () => {
    const res = await request(app).get('/api/progression?track=Spa&carClass=Hypercar&driver=TestPlayer&hideEmpty=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const allProg = await request(app).get('/api/progression?track=All&carClass=All');
    expect(allProg.status).toBe(200);
    expect(Array.isArray(allProg.body)).toBe(true);

    const raceProg = await request(app).get('/api/progression?sessionType=Race');
    expect(raceProg.status).toBe(200);
    expect(Array.isArray(raceProg.body)).toBe(true);
  });

  it('GET /api/track/:trackName returns track details with benchmarks', async () => {
    const res = await request(app).get('/api/track/Spa');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trackName', 'Spa');
    expect(res.body).toHaveProperty('normalizedTrackName');
    expect(res.body).toHaveProperty('benchmarks');
  });

  it('GET /api/reference-laptimes returns cached benchmarks', async () => {
    const res = await request(app).get('/api/reference-laptimes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
  });

  it('POST /api/scan updates directories and scans sessions', async () => {
    const res = await request(app)
      .post('/api/scan')
      .send({
        resultsDir: path.join(process.cwd(), 'test', 'fixtures', 'results'),
        replaysDir: path.join(process.cwd(), 'test', 'fixtures', 'replays'),
        playerName: 'TestPlayer',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('playerName', 'TestPlayer');
    expect(res.body).toHaveProperty('telemetryScanStarted', true);
    expect(res.body).toHaveProperty('telemetryFilesScanned', null);
  });

  it('GET /api/compare/laps returns comparable laps and benchmarks', async () => {
    const res = await request(app).get('/api/compare/laps?track=Spa&carClass=Hypercar&playerOnly=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('laps');
    expect(Array.isArray(res.body.laps)).toBe(true);
    expect(res.body).toHaveProperty('benchmarks');
    expect(Array.isArray(res.body.benchmarks)).toBe(true);
  });

  it('POST /api/reference-laptimes/refresh triggers refresh from Google Sheets', async () => {
    vi.spyOn(refModule, 'fetchAndCacheReferenceLaptimes').mockResolvedValue({
      lastUpdated: new Date().toISOString(),
      sourceUrl: '',
      entriesCount: 50,
      entries: {},
    });

    const res = await request(app).post('/api/reference-laptimes/refresh');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('entriesCount', 50);
  });

  it('GET /api/replays returns replay summaries list', async () => {
    const res = await request(app).get('/api/replays');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/replays/:name/metadata returns 404 for nonexistent file', async () => {
    const res = await request(app).get('/api/replays/nonexistent.vcr/metadata');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/replays/:name/trajectory returns 404 for nonexistent file', async () => {
    const res = await request(app).get('/api/replays/nonexistent.vcr/trajectory');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects unsafe replay names and unbounded trajectory parameters', async () => {
    const unsafe = await request(app).get('/api/replays/%2E%2E%2Fsecret.vcr/metadata');
    expect(unsafe.status).toBe(400);

    const invalidSlot = await request(app).get('/api/replays/valid.vcr/trajectory?driverSlot=999999');
    expect(invalidSlot.status).toBe(400);

    const invalidPoints = await request(app).get('/api/replays/valid.vcr/trajectory?maxPoints=-1');
    expect(invalidPoints.status).toBe(400);
  });

  it('GET /api/replays/cache returns the cached replay list', async () => {
    const res = await request(app).get('/api/replays/cache');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/ai/reports returns the AI report history list', async () => {
    const res = await request(app).get('/api/ai/reports');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('validates AI settings and analysis payloads before calling Gemini', async () => {
    const invalidModel = await request(app)
      .post('/api/ai/settings')
      .send({ model: 'unsupported-model' });
    expect(invalidModel.status).toBe(400);
    expect(invalidModel.body.errorCode).toBe('invalid_model');

    const invalidKey = await request(app)
      .post('/api/ai/settings')
      .send({ apiKey: 123 });
    expect(invalidKey.status).toBe(400);
    expect(invalidKey.body.errorCode).toBe('invalid_request');

    const missingEvidence = await request(app)
      .post('/api/ai/analyze-lap')
      .send({});
    expect(missingEvidence.status).toBe(400);
    expect(missingEvidence.body.errorCode).toBe('invalid_request');

    const oversizedEvidence = await request(app)
      .post('/api/ai/analyze-lap')
      .send({ evidence: 'x'.repeat(64 * 1024 + 1) });
    expect(oversizedEvidence.status).toBe(413);
    expect(oversizedEvidence.body.errorCode).toBe('payload_too_large');
  });

  it('GET /api/telemetry returns list of scanned DuckDB telemetry files', async () => {
    const res = await request(app).get('/api/telemetry');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('caches replay metadata and trajectory in SQLite after a scan and reuses it on request', async () => {
    const tempReplaysDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_api_temp');
    fs.mkdirSync(tempReplaysDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempReplaysDir, 'Api_Cache_Test_P1.Vcr'),
      createSliceVcrBuffer({
        drivers: [{ name: 'Api Test Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
        slices: [
          { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
          { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        ],
      })
    );

    try {
      const scanRes = await request(app)
        .post('/api/scan')
        .send({
          resultsDir: path.join(process.cwd(), 'test', 'fixtures', 'results'),
          replaysDir: tempReplaysDir,
          playerName: 'Api Test Driver',
        });
      expect(scanRes.status).toBe(200);
      expect(scanRes.body.replayScanStarted).toBe(true);

      // Replay trajectory extraction runs in the background - poll the scan status
      // endpoint until it finishes instead of asserting on the immediate scan response.
      let status;
      for (let i = 0; i < 50; i++) {
        status = (await request(app).get('/api/scan/status')).body;
        if (status.allComplete) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(status.allComplete).toBe(true);
      expect(status.result).toEqual(expect.objectContaining({ added: 1 }));

      const cacheListRes = await request(app).get('/api/replays/cache');
      expect(cacheListRes.status).toBe(200);
      const cached = cacheListRes.body.find((r: { filename: string }) => r.filename === 'Api_Cache_Test_P1.Vcr');
      expect(cached).toBeDefined();
      expect(cached.driversCount).toBe(1);

      const metadataRes = await request(app).get('/api/replays/Api_Cache_Test_P1.Vcr/metadata');
      expect(metadataRes.status).toBe(200);
      expect(metadataRes.body.drivers?.[0]?.name).toBe('Api Test Driver');

      const trajectoryRes = await request(app)
        .get('/api/replays/Api_Cache_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr&maxPoints=10');
      expect(trajectoryRes.status).toBe(200);
      expect(trajectoryRes.body.source).toBe('vcr');
      expect(Array.isArray(trajectoryRes.body.points)).toBe(true);
      expect(trajectoryRes.body.points.length).toBeGreaterThan(0);
    } finally {
      // Restore the default fixtures replays dir so later test runs aren't affected
      await request(app)
        .post('/api/scan')
        .send({
          resultsDir: path.join(process.cwd(), 'test', 'fixtures', 'results'),
          replaysDir: path.join(process.cwd(), 'test', 'fixtures', 'replays'),
          playerName: 'TestPlayer',
        });
      for (let i = 0; i < 50; i++) {
        const status = (await request(app).get('/api/scan/status')).body;
        if (!status.running) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      fs.rmSync(tempReplaysDir, { recursive: true, force: true });
    }
  });
});
