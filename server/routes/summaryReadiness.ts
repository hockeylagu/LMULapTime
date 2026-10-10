import type { RequestHandler } from 'express';
import type { ServerContext } from '../core/serverContext.js';

/**
 * History reads (lists, dashboard, tracks, boards, comparisons) answer 503 while session
 * summaries are rebuilt. Mount it on those paths only: routers share the /api prefix, so a
 * router-wide gate would also hold single-session detail and telemetry, which stay available.
 */
export function requireSessionSummaries(context: ServerContext): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (context.sessionDb.isSessionSummaryReady()) {
      next();
      return;
    }
    res.status(503).json({ error: 'Session summaries are being rebuilt. Please retry shortly.',
      progress: context.sessionDb.getSessionCatalogStats() });
  };
}
