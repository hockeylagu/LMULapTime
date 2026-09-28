import { Router } from 'express';
import { buildLeaderboard, listLeaderboardLayouts } from '../../shared/domain/leaderboard.js';
import type { LeaderboardLayout } from '../../shared/types/leaderboard.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { ServerContext } from '../core/serverContext.js';
import { getTrackOutlinePath } from '../tracks/trackOutline.js';
import { DetailedSession } from '../core/types.js';
import { queryString } from './queryParams.js';

/** /api/leaderboard/*: where the player stands among the real drivers met on each layout. */
export function createLeaderboardRouter(context: ServerContext): Router {
  const router = Router();
  // loadSessions returns the same array until the sessions change: the ribbon is built once per list.
  let layoutsFor: { sessions: DetailedSession[]; layouts: LeaderboardLayout[] } | null = null;

  router.get('/leaderboard/layouts', (_req, res) => {
    const sessions = context.loadSessions();
    if (layoutsFor?.sessions !== sessions) {
      const layouts = listLeaderboardLayouts(sessions).map((layout) => ({
        ...layout,
        outlinePath: getTrackOutlinePath(layout.layoutKey),
      }));
      layoutsFor = { sessions, layouts };
    }
    res.json(layoutsFor.layouts);
  });

  router.get('/leaderboard', (req, res) => {
    const layoutKey = queryString(req.query.layout)?.trim();
    const carClass = queryString(req.query.carClass)?.trim();
    if (!layoutKey || !carClass) {
      res.status(400).json({ error: 'layout and carClass are required' });
      return;
    }
    const refCache = loadReferenceLaptimesFromCache();
    res.json(buildLeaderboard(
      context.loadSessions(),
      { layoutKey, carClass, carType: queryString(req.query.carType) },
      refCache?.entries ?? []
    ));
  });

  return router;
}
