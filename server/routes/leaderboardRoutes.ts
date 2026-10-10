import { Response, Router } from 'express';
import { LeaderboardQuery } from '../../shared/domain/leaderboard.js';
import { describeRival, pinnedTarget, resolveRival } from '../../shared/domain/rivals.js';
import type { Leaderboard, RivalStatus } from '../../shared/types/leaderboard.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import type { RivalScope } from '../core/dbRivalStore.js';
import { ServerContext } from '../core/serverContext.js';
import { queryCompactLeaderboard, queryCompactLeaderboardLayouts, queryCompactPlayerSessionBests } from '../core/sessionSummaries/leaderboardQueries.js';
import { queryString } from './queryParams.js';
import { requireSessionSummaries } from './summaryReadiness.js';

/** The board a request names, from the query (GET) or the JSON body (POST); null when incomplete. */
function readBoardQuery(source: Record<string, unknown>): LeaderboardQuery | null {
  const layoutKey = queryString(source.layout)?.trim();
  const carClass = queryString(source.carClass)?.trim();
  if (!layoutKey || !carClass) return null;
  return { layoutKey, carClass, carType: queryString(source.carType)?.trim() || null };
}

/** /api/leaderboard/* and /api/rivals/*: where the player stands among the real drivers met on each layout. */
export function createLeaderboardRouter(context: ServerContext): Router {
  const router = Router();
  router.use(['/leaderboard', '/rivals'], requireSessionSummaries(context));
  const boardFor = (query: LeaderboardQuery): Leaderboard =>
    queryCompactLeaderboard(context.sessionDb.getDb(), query, loadReferenceLaptimesFromCache()?.entries ?? []);

  const scopeOf = (board: Leaderboard, query: LeaderboardQuery): RivalScope => ({
    layoutKey: board.layoutKey,
    carClass: board.carClass,
    carType: query.carType ?? '',
  });

  /** Brings the stored rival up to date with the board, and describes the chase. */
  const rivalStatus = (query: LeaderboardQuery): RivalStatus => {
    const board = boardFor(query);
    const scope = scopeOf(board, query);
    const db = context.sessionDb;
    const resolution = resolveRival(board, db.getActiveRival(scope), Date.now());
    if (resolution.beaten || resolution.retimed || resolution.created) db.applyRivalResolution(scope, resolution);
    return describeRival(board, db.getActiveRival(scope), db.getBeatenRivals(scope), queryCompactPlayerSessionBests(db.getDb(), query));
  };

  const withBoardQuery = (source: Record<string, unknown>, res: Response) => {
    const query = readBoardQuery(source);
    if (!query) res.status(400).json({ error: 'layout and carClass are required' });
    return query;
  };

  router.get('/leaderboard/layouts', (_req, res) => {
    res.json(queryCompactLeaderboardLayouts(context.sessionDb.getDb()));
  });

  router.get('/leaderboard', (req, res) => {
    const query = withBoardQuery(req.query, res);
    if (query) res.json(boardFor(query));
  });

  router.get('/rivals', (req, res) => {
    const query = withBoardQuery(req.query, res);
    if (query) res.json(rivalStatus(query));
  });

  // The player picks their rival: any driver ahead on the board.
  router.post('/rivals/pin', (req, res) => {
    const query = withBoardQuery(req.body ?? {}, res);
    if (!query) return;
    const driverName = queryString(req.body?.driverName);
    const board = boardFor(query);
    const target = driverName ? pinnedTarget(board, driverName, Date.now()) : null;
    if (!target) {
      res.status(400).json({ error: 'Only a driver ahead of you on this board can be your rival' });
      return;
    }
    context.sessionDb.pinRival(scopeOf(board, query), target);
    res.json(rivalStatus(query));
  });

  return router;
}
