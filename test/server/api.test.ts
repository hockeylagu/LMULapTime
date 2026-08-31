import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { app } from '../../server/index';
import * as refModule from '../../server/referenceLaptimes';

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
});
