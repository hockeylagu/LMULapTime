import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const referenceApi = vi.hoisted(() => ({
  fetchAndCacheReferenceLaptimes: vi.fn(),
  loadReferenceLaptimesFromCache: vi.fn(),
}));

vi.mock('../../../server/benchmarks/referenceLaptimes.js', () => referenceApi);

import { createReferenceRouter } from '../../../server/routes/referenceRoutes.js';
import type { ServerContext } from '../../../server/core/serverContext.js';

describe('Reference laptime routes', () => {
  const loadSessions = vi.fn();
  const context = { loadSessions } as unknown as ServerContext;
  const app = express();

  beforeEach(() => {
    vi.clearAllMocks();
    app.use('/api', createReferenceRouter(context));
  });

  it('returns cached references and refreshes sessions after a successful update', async () => {
    referenceApi.loadReferenceLaptimesFromCache.mockReturnValue(null);
    referenceApi.fetchAndCacheReferenceLaptimes.mockResolvedValue({
      lastUpdated: '2026-09-23T00:00:00.000Z',
      entriesCount: 4,
      lastUpdateDiff: { updatedCount: 1 },
    });
    loadSessions.mockReturnValue([{ id: 'session-1' }]);

    const cached = await request(app).get('/api/reference-laptimes');
    const refreshed = await request(app).post('/api/reference-laptimes/refresh');

    expect(cached.body).toEqual({ lastUpdated: null, entriesCount: 0, entries: {} });
    expect(refreshed.body).toMatchObject({ success: true, entriesCount: 4, sessionsCount: 1, diff: { updatedCount: 1 } });
    expect(loadSessions).toHaveBeenCalledWith(true, true);
  });

  it('returns the refresh error without attempting a session reparse', async () => {
    referenceApi.fetchAndCacheReferenceLaptimes.mockRejectedValue(new Error('Reference source unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post('/api/reference-laptimes/refresh');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Reference source unavailable' });
    expect(loadSessions).not.toHaveBeenCalled();
  });
});