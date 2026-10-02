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
  const rerateSessionPace = vi.fn();
  const context = { loadSessions, rerateSessionPace } as unknown as ServerContext;
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
    expect(rerateSessionPace).toHaveBeenCalledTimes(1);
  });

  it('returns the refresh error without attempting a session reparse', async () => {
    referenceApi.fetchAndCacheReferenceLaptimes.mockRejectedValue(new Error('Reference source unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post('/api/reference-laptimes/refresh');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Reference source unavailable' });
    expect(loadSessions).not.toHaveBeenCalled();
  });

  it('returns benchmark diff history summaries', async () => {
    const mockHistory = [
      {
        id: 1,
        timestamp: '2026-10-01T10:00:00Z',
        hasChanges: true,
        addedCount: 1,
        updatedCount: 2,
        removedCount: 0,
        totalEntries: 187,
        totalAffectedSessions: 3,
        totalCategoryShifts: 1,
      },
    ];

    const mockSessionDb = {
      getBenchmarkDiffHistory: vi.fn().mockReturnValue(mockHistory),
      getBenchmarkDiffById: vi.fn(),
      recordBenchmarkDiff: vi.fn(),
    };
    const ctx = { loadSessions, sessionDb: mockSessionDb, refreshBenchmarkDiffImpacts: vi.fn() } as unknown as ServerContext;
    const testApp = express();
    testApp.use('/api', createReferenceRouter(ctx));

    const response = await request(testApp).get('/api/reference-laptimes/diffs');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockHistory);
    expect(mockSessionDb.getBenchmarkDiffHistory).toHaveBeenCalledWith(50);
  });

  it('returns specific benchmark diff by id and 404 for missing id', async () => {
    const mockDiff = {
      id: 42,
      timestamp: '2026-10-01T10:00:00Z',
      hasChanges: true,
      addedCount: 0,
      updatedCount: 1,
      removedCount: 0,
      totalEntries: 187,
      totalAffectedSessions: 2,
      totalCategoryShifts: 1,
      added: [],
      updated: [],
      removed: [],
    };

    const mockSessionDb = {
      getBenchmarkDiffHistory: vi.fn(),
      getBenchmarkDiffById: vi.fn().mockImplementation((id: number) => (id === 42 ? mockDiff : null)),
      recordBenchmarkDiff: vi.fn(),
    };
    const ctx = { loadSessions, sessionDb: mockSessionDb, refreshBenchmarkDiffImpacts: vi.fn() } as unknown as ServerContext;
    const testApp = express();
    testApp.use('/api', createReferenceRouter(ctx));

    const okRes = await request(testApp).get('/api/reference-laptimes/diffs/42');
    expect(okRes.status).toBe(200);
    expect(okRes.body).toMatchObject({ id: 42 });

    const missingRes = await request(testApp).get('/api/reference-laptimes/diffs/999');
    expect(missingRes.status).toBe(404);
    expect(missingRes.body).toEqual({ error: 'Benchmark diff not found' });
  });

  it('recounts stored updates before serving the history and a single update', async () => {
    const refreshBenchmarkDiffImpacts = vi.fn();
    const mockSessionDb = {
      getBenchmarkDiffHistory: vi.fn().mockReturnValue([{ id: 1 }]),
      getBenchmarkDiffById: vi.fn().mockReturnValue({ id: 1 }),
      recordBenchmarkDiff: vi.fn(),
    };
    const ctx = { loadSessions, sessionDb: mockSessionDb, refreshBenchmarkDiffImpacts } as unknown as ServerContext;
    const testApp = express();
    testApp.use('/api', createReferenceRouter(ctx));

    await request(testApp).get('/api/reference-laptimes/diffs');
    await request(testApp).get('/api/reference-laptimes/diffs/1');

    expect(refreshBenchmarkDiffImpacts).toHaveBeenCalledTimes(2);
  });
});
