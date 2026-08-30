import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
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
    const res = await request(app).get('/api/sessions?track=Spa&sessionType=Practice&hideEmpty=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/session/:id returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/session/nonexistent-session-id-12345');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Session not found');
  });

  it('GET /api/progression returns progression array', async () => {
    const res = await request(app).get('/api/progression?track=Spa&hideEmpty=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
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
        resultsDir: 'C:\\NonExistentResults',
        replaysDir: 'C:\\NonExistentReplays',
        playerName: 'TestPlayer',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('playerName', 'TestPlayer');
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
