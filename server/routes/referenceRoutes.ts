import { Router } from 'express';
import { fetchAndCacheReferenceLaptimes, loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';

export function createReferenceRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/reference-laptimes', (_req, res) => {
    const refData = loadReferenceLaptimesFromCache();
    res.json(refData || { lastUpdated: null, entriesCount: 0, entries: {} });
  });

  router.post('/reference-laptimes/refresh', async (_req, res) => {
    try {
      const updatedCache = await fetchAndCacheReferenceLaptimes();
      const sessions = context.loadSessions(true, true);
      res.json({
        success: true,
        lastUpdated: updatedCache.lastUpdated,
        entriesCount: updatedCache.entriesCount,
        sessionsCount: sessions.length,
        diff: updatedCache.lastUpdateDiff || null,
      });
    } catch (error: unknown) {
      console.error('Failed to refresh reference laptimes:', error);
      const message = error instanceof Error ? error.message : 'Failed to refresh reference laptimes';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
