import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { dataPlugin } from '../../../server/plugins/dataPlugin.js';
import { app } from '../../../server/index.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

// Each router is tested on its own in test/server/routes. This suite starts the real app to check
// that server/index.ts mounts them all and that a scan, the cache and the replay store work together.
describe('Server API wiring', () => {
  const fixtureFolders = {
    resultsDir: path.join(process.cwd(), 'test', 'fixtures', 'results'),
    replaysDir: path.join(process.cwd(), 'test', 'fixtures', 'replays'),
    playerName: 'TestPlayer',
  };

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

  it.each([
    ['system', '/api/status'],
    ['system', '/api/scan/status'],
    ['session', '/api/sessions'],
    ['session', '/api/progression'],
    ['session', '/api/track/Spa'],
    ['session', '/api/compare/laps?track=Spa'],
    ['reference', '/api/reference-laptimes'],
    ['leaderboard', '/api/leaderboard/layouts'],
    ['replay', '/api/replays'],
    ['replay', '/api/replays/cache'],
    ['replay', '/api/telemetry'],
    ['ai', '/api/ai/reports'],
  ])('mounts the %s router: GET %s answers 200', async (_router, url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
  });

  it.each(['absent','invalid','ready'] as const)('keeps cloud AI settings and reports available when the plugin is %s',async state=>{
    const previous=dataPlugin.status.state;
    try {
      dataPlugin.status.state=state;
      expect((await request(app).get('/api/ai/settings')).status).toBe(200);
      expect((await request(app).get('/api/ai/reports')).status).toBe(200);
      const response=await request(app).post('/api/ai/analyze-lap').send({});
      expect(response.status).toBe(400);expect(response.body.errorCode).toBe('invalid_request');
    } finally {dataPlugin.status.state=previous;}
  });

  it('answers JSON errors from the routers, not an HTML page', async () => {
    const missing = await request(app).get('/api/session/nonexistent-session-id-12345');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Session not found' });

    const unsafe = await request(app).get('/api/replays/%2E%2E%2Fsecret.vcr/metadata');
    expect(unsafe.status).toBe(400);
    expect(unsafe.body).toHaveProperty('error');
  });

  it('reads the fixture sessions from the results folder at start-up', async () => {
    const res = await request(app).get('/api/session/2026_05_28_P1.xml');
    expect(res.status).toBe(200);
    expect(res.body.trackVenue).toBe('Spa');
    expect(res.body.drivers.length).toBeGreaterThan(0);
  });

  it('refuses to clear the cache while the scan it just started is running, then clears it', async () => {
    const scan = await request(app).post('/api/scan').send(fixtureFolders);
    expect(scan.status).toBe(200);

    const refused = await request(app).post('/api/cache/clear');
    expect(refused.status).toBe(409);

    await waitForFileScans();
    const cleared = await request(app).post('/api/cache/clear');
    expect(cleared.status).toBe(200);
    expect(cleared.body.sqliteCache.sessionsCount).toBe(0);

    await request(app).post('/api/scan').send(fixtureFolders);
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
