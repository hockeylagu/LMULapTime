import { Router } from 'express';
import { queueCornerWork, refreshLayoutSequencePasses, refreshSequenceMaps } from '../corners/sequenceMapService.js';
import type { ServerContext } from '../core/serverContext.js';
import { layoutCorners } from '../corners/sessionCornerPasses.js';
import { queryString } from './queryParams.js';
import type { SequenceMapsResponse } from '../../shared/types/corners/sequenceMaps.js';

/** The turn sequence maps (server/corners/sequenceMapService.ts): the list Settings shows, and regenerating one. */
export function createCornerSequenceRouter(context: ServerContext): Router {
  const router = Router();
  // One map regenerates at a time: it re-reads the class's fastest laps, then rebuilds the layout's sequence passes.
  let regenerating: string | null = null;
  let failed: SequenceMapsResponse['failed'] = null;

  router.get('/corner-sequences/maps', (_req, res) => {
    const body: SequenceMapsResponse = { maps: context.sessionDb.listSequenceMaps(), regenerating, failed };
    res.json(body);
  });

  // A layout's corners for a class (its map, else the official turns): the lap view's corner windows, for any lap.
  router.get('/corner-sequences/layout', (req, res) => {
    const layoutKey = queryString(req.query.layoutKey), carClass = queryString(req.query.carClass) ?? '';
    if (!layoutKey) return res.status(400).json({ error: 'layoutKey is required' });
    const corners = layoutCorners(layoutKey, carClass, (layout, carClassOf) => context.sessionDb.getSequenceMap(layout, carClassOf));
    if (!corners) return res.status(404).json({ error: `No centre line for ${layoutKey}` });
    res.json(corners);
  });

  router.post('/corner-sequences/maps/regenerate', (req, res) => {
    const { layoutKey, carClass } = (req.body ?? {}) as { layoutKey?: unknown; carClass?: unknown };
    if (typeof layoutKey !== 'string' || typeof carClass !== 'string') return res.status(400).json({ error: 'layoutKey and carClass are required' });
    if (!context.sessionDb.getSequenceMap(layoutKey, carClass)) return res.status(404).json({ error: `No sequence map for ${layoutKey} ${carClass}` });
    if (regenerating) return res.status(409).json({ error: 'Another map is regenerating' });
    // Ingestion builds the same rows: a map changing under it would leave them on the old map.
    if (context.getReplayScanStatus().running) return res.status(409).json({ error: 'Wait for the replay scan to finish' });
    const map = `${layoutKey}|${carClass}`;
    regenerating = map;
    failed = null;
    res.status(202).json({ regenerating });
    void (async () => {
      try {
        // Queued with ingestion's corner work, so a scan started meanwhile never builds on a map being replaced.
        await queueCornerWork(async () => {
          await refreshSequenceMaps(context.sessionDb, layoutKey, [carClass], { remap: true });
          await refreshLayoutSequencePasses(context.sessionDb, layoutKey);
        });
      } catch (error) {
        console.error(`Sequence map ${layoutKey} ${carClass} failed to regenerate:`, error);
        failed = { map, error: error instanceof Error ? error.message : String(error) };
      } finally {
        regenerating = null;
      }
    })();
  });

  return router;
}
