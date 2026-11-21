import { Router, type Request } from 'express';
import { queueCornerWork, refreshLayoutSequencePasses, refreshSequenceMaps } from '../corners/sequenceMapService.js';
import type { ServerContext } from '../core/serverContext.js';
import { layoutCorners } from '../corners/sessionCornerPasses.js';
import { readCornerTrends } from '../corners/cornerTrends.js';
import { benchmarkTargetSec } from '../benchmarks/referenceLaptimes.js';
import { pinnedCornerTurns, readCornerHabitTrends, readSessionCornerAnalysis } from '../corners/cornerAnalysisService.js';
import { FOCUS_SLOTS } from '../../shared/domain/cornerAnalysis/habitFocus.js';
import type { HabitFocusPin } from '../../shared/types/corners/habitFocus.js';
import { queryString } from './queryParams.js';
import { requireSessionSummaries } from './summaryReadiness.js';
import type { SequenceMapsResponse } from '../../shared/types/corners/sequenceMaps.js';

/** A pin as a request names it: the layout, class and a turn of the corner; null when one is missing. */
function pinOf(body: unknown): HabitFocusPin | null {
  const { layoutKey, carClass, turnId } = (body ?? {}) as Record<string, unknown>;
  return typeof layoutKey === 'string' && typeof carClass === 'string' && Number.isInteger(turnId)
    ? { layoutKey, carClass, turnId: turnId as number } : null;
}

/**
 * The turn sequence maps (server/corners/sequenceMapService.ts): the list Settings shows, regenerating one, the corner
 * trends and a session's corner analysis, with the habit focus's pins.
 */
export function createCornerRouter(context: ServerContext): Router {
  const router = Router();
  // One map regenerates at a time: it re-reads the class's fastest laps, then rebuilds the layout's sequence passes.
  let regenerating: string | null = null;
  let failed: SequenceMapsResponse['failed'] = null;

  router.get('/corner-sequences/maps', (_req, res) => {
    const body: SequenceMapsResponse = { maps: context.sessionDb.listSequenceMaps(), regenerating, failed };
    res.json(body);
  });

  // A layout's corners for a class (its map, else the official turns): the lap view's corner windows, for any lap.
  router.get('/corners', (req, res) => {
    const layoutKey = queryString(req.query.layoutKey), carClass = queryString(req.query.carClass) ?? '';
    if (!layoutKey) return res.status(400).json({ error: 'layoutKey is required' });
    const corners = layoutCorners(layoutKey, carClass, (layout, carClassOf) => context.sessionDb.getSequenceMap(layout, carClassOf));
    if (!corners) return res.status(404).json({ error: `No centre line for ${layoutKey}` });
    res.json(corners);
  });

  // The driver's time through each corner of a layout, session after session (server/corners/cornerTrends.ts).
  router.get('/corner-trends', requireSessionSummaries(context), (req, res) => {
    const layoutKey = queryString(req.query.layoutKey), carClass = queryString(req.query.carClass);
    if (!layoutKey || !carClass) return res.status(400).json({ error: 'layoutKey and carClass are required' });
    const carType = queryString(req.query.carType) ?? '';
    // The habits first: their target is the trends' reference, so a corner's gap and its cost are against one driver.
    const { habits, target } = readCornerHabitTrends(context.sessionDb, layoutKey, carClass, carType.trim().toLowerCase());
    const trends = readCornerTrends(context.sessionDb, layoutKey, carClass, carType, undefined, target);
    if (!trends) return res.status(404).json({ error: `No centre line for ${layoutKey}` });
    res.json({ ...trends, corners: trends.corners.map(corner => ({ ...corner, habit: habits.get(corner.id) ?? null })) });
  });

  // The session player's corner habits and mistakes (server/corners/cornerAnalysisService.ts); references come from
  // the layout's other sessions too, so it waits for the summaries like the trends.
  router.get('/session/:sessionId/corner-analysis', requireSessionSummaries(context), (req: Request<{ sessionId: string }>, res) => {
    const analysis = readSessionCornerAnalysis(context.sessionDb, req.params.sessionId, benchmarkTargetSec);
    if (!analysis) return res.status(404).json({ error: 'No corner analysis for this session' });
    res.json(analysis);
  });

  // The driver makes a corner a focus: it holds one of the 2 slots until unpinned.
  router.post('/habit-focus/pin', (req, res) => {
    const pin = pinOf(req.body);
    if (!pin) return res.status(400).json({ error: 'layoutKey, carClass and turnId are required' });
    const corner = pinnedCornerTurns(context.sessionDb, pin, pin.turnId);
    if (!corner) return res.status(404).json({ error: 'No corner holds this turn' });
    if (corner.pinnedHere.length === 0) {
      if (corner.pinnedCorners >= FOCUS_SLOTS) return res.status(409).json({ error: 'Unpin one first' });
      context.sessionDb.addHabitFocusPin({ ...pin, turnId: corner.cornerTurnIds[0] }, Date.now());
    }
    res.json({ pinned: true });
  });

  router.post('/habit-focus/unpin', (req, res) => {
    const pin = pinOf(req.body);
    if (!pin) return res.status(400).json({ error: 'layoutKey, carClass and turnId are required' });
    const corner = pinnedCornerTurns(context.sessionDb, pin, pin.turnId);
    if (!corner) return res.status(404).json({ error: 'No corner holds this turn' });
    context.sessionDb.removeHabitFocusPins(pin, corner.pinnedHere);
    res.json({ pinned: false });
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
