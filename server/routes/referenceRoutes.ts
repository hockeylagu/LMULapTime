import { Router } from 'express';
import { fetchAndCacheReferenceLaptimes, loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';

export function createReferenceRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/reference-laptimes', (_req, res) => {
    const refData = loadReferenceLaptimesFromCache();
    res.json(refData || { lastUpdated: null, entriesCount: 0, entries: {} });
  });

  router.get('/reference-laptimes/diffs', (_req, res) => {
    try {
      context.refreshBenchmarkDiffImpacts();
      const history = context.sessionDb.getBenchmarkDiffHistory(50);
      if (history.length === 0) {
        const currentCache = loadReferenceLaptimesFromCache();
        if (currentCache?.lastUpdateDiff) {
          const diff = currentCache.lastUpdateDiff;
          const diffId = context.sessionDb.recordBenchmarkDiff(diff, currentCache.sourceUrl);
          diff.id = diffId;
          return res.json([
            {
              id: diffId,
              timestamp: diff.timestamp,
              hasChanges: diff.hasChanges,
              addedCount: diff.addedCount,
              updatedCount: diff.updatedCount,
              removedCount: diff.removedCount,
              totalEntries: diff.totalEntries,
              totalAffectedSessions: diff.totalAffectedSessions || 0,
              totalCategoryShifts: diff.totalCategoryShifts || 0,
            },
          ]);
        }
      }
      res.json(history);
    } catch (error: unknown) {
      console.error('Failed to get benchmark diff history:', error);
      const message = error instanceof Error ? error.message : 'Failed to get benchmark diff history';
      res.status(500).json({ error: message });
    }
  });

  router.get('/reference-laptimes/diffs/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid diff ID' });
      }

      context.refreshBenchmarkDiffImpacts();
      const diff = context.sessionDb.getBenchmarkDiffById(id);
      if (!diff) {
        return res.status(404).json({ error: 'Benchmark diff not found' });
      }
      res.json(diff);
    } catch (error: unknown) {
      console.error('Failed to get benchmark diff by id:', error);
      const message = error instanceof Error ? error.message : 'Failed to get benchmark diff';
      res.status(500).json({ error: message });
    }
  });

  router.post('/reference-laptimes/refresh', async (_req, res) => {
    try {
      const updatedCache = await fetchAndCacheReferenceLaptimes();
      context.rerateSessionPace();
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
