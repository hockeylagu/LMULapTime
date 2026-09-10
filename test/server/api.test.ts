import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '../../server/index';
import * as refModule from '../../server/referenceLaptimes';
import { createSliceVcrBuffer } from '../utils/mockVcr';

describe('Server API routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/status returns application status', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('resultsDir');
    expect(res.body).toHaveProperty('sessionsCount');
    expect(res.body).toHaveProperty('referenceLaptimes');
    expect(res.body).toHaveProperty('sqliteCache');
    expect(res.body.sqliteCache).toHaveProperty('enabled', true);
    expect(typeof res.body.sqliteCache.sessionsCount).toBe('number');
  });

  it('POST /api/cache/clear clears the SQLite cache', async () => {
    const res = await request(app).post('/api/cache/clear');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('sessionsCount', 0);
    expect(res.body.sqliteCache).toHaveProperty('sessionsCount', 0);
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
  });

  it('GET /api/tracks returns track summaries', async () => {
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
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
        if (!status.running) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(status.running).toBe(false);
      expect(status.result).toEqual(expect.objectContaining({ added: 1 }));

      const cacheListRes = await request(app).get('/api/replays/cache');
      expect(cacheListRes.status).toBe(200);
      const cached = cacheListRes.body.find((r: { filename: string }) => r.filename === 'Api_Cache_Test_P1.Vcr');
      expect(cached).toBeDefined();
      expect(cached.driversCount).toBe(1);

      const metadataRes = await request(app).get('/api/replays/Api_Cache_Test_P1.Vcr/metadata');
      expect(metadataRes.status).toBe(200);
      expect(metadataRes.body.drivers?.[0]?.name).toBe('Api Test Driver');
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
