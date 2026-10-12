import { Router } from 'express';
import { findMatchingTrackBenchmarkEntries } from '../../shared/domain/paceCategory.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { ServerContext } from '../core/serverContext.js';
import { queryString } from './queryParams.js';
import { requireSessionSummaries } from './summaryReadiness.js';
import { attachPitServices } from '../sessions/sessionPitStops.js';
import { querySessionPage, queryProgression, type SessionQuery } from '../core/sessionSummaries/pageQueries.js';
import { queryCompactComparableLaps, queryTelemetryComparableLaps, type CompactCompareFilters } from '../core/sessionSummaries/comparisonQueries.js';
import { queryTrackDetailFilters, queryTrackDetailSummary, queryTrackLatestSessionContext, queryTrackPositionAverages, queryTrackSummaries } from '../core/sessionSummaries/trackQueries.js';
import { rateSessionDetail } from '../core/sessionSummaries/readTimePace.js';
import { querySessionContext, querySessionPersonalBestById } from '../core/sessionSummaries/contextQueries.js';
import { queryCompactDashboard } from '../core/sessionSummaries/dashboardQueries.js';

export interface SessionFilterOptions {
  track?: string;
  trackVenue?: string;
  trackCourse?: string;
  car?: string;
  carClass?: string;
  driver?: string;
  sessionType?: string;
  hideEmpty?: boolean;
}

export function parseSessionFilters(query: Record<string, unknown>): SessionFilterOptions {
  return {
    track: queryString(query.track),
    trackVenue: queryString(query.trackVenue),
    trackCourse: queryString(query.trackCourse),
    car: queryString(query.car),
    carClass: queryString(query.carClass),
    driver: queryString(query.driver),
    sessionType: queryString(query.sessionType),
    hideEmpty: query.hideEmpty === 'true' || query.filterEmpty === 'true',
  };
}

function pageNumber(value: unknown, fallback: number, max = 500): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(max, Math.floor(parsed)) : fallback;
}

export function createSessionRouter(context: ServerContext): Router {
  const router = Router();
  const db = context.sessionDb.getDb();
  const options = (query: Record<string, unknown>): SessionQuery => ({
    ...parseSessionFilters(query), search: queryString(query.q), hasReplay: query.hasReplay === 'true',
    sessionType: queryString(query.type) ?? queryString(query.sessionType), sort: queryString(query.sort),
    page: pageNumber(query.page, 1, 1000000), pageSize: pageNumber(query.pageSize, 25, 100),
    from: query.from === undefined ? undefined : Number(query.from), to: query.to === undefined ? undefined : Number(query.to),
  });
  const revision = () => context.getScanStatus().dataRevision;
  router.use(['/sessions', '/dashboard', '/tracks', '/track', '/compare'], requireSessionSummaries(context));
  router.get('/sessions', (req, res) => res.json({...querySessionPage(db,options(req.query)),revision:revision()}));
  router.get('/dashboard',(req,res)=>res.json(queryCompactDashboard(db,{...options(req.query),revision:revision(),referenceEntries:loadReferenceLaptimesFromCache()?.entries ?? {}})));
  router.get('/session/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session=context.sessionDb.getSessionById(req.params.id);
    if (!session) return res.status(404).json({error:'Session not found'});
    attachPitServices(db,session);
    return res.json({...rateSessionDetail(session),historyContext:querySessionContext(db,session),revision:revision()});
  });
  router.get('/session/:id/personal-best/:driverOrdinal', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionId = req.params.id;
    if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId)) return res.status(404).json({ error: 'Session not found' });
    const driverOrdinal = Number(req.params.driverOrdinal);
    if (!/^\d+$/.test(req.params.driverOrdinal) || !Number.isSafeInteger(driverOrdinal)) {
      return res.status(400).json({ error: 'Invalid driver ordinal' });
    }
    const personalBest = querySessionPersonalBestById(db, sessionId, driverOrdinal);
    if (!personalBest) return res.status(400).json({ error: 'Invalid driver ordinal' });
    return res.json(personalBest);
  });
  router.get('/tracks', (req,res) => res.json({tracks:queryTrackSummaries(db,queryString(req.query.carClass)),revision:revision()}));
  router.get('/track/:trackName', (req,res) => {
    const trackVenue = queryString(req.query.trackVenue) ?? req.params.trackName;
    const trackCourse = queryString(req.query.trackCourse) ?? '';
    const selected={...options(req.query),track:req.params.trackName,trackVenue,trackCourse,playerCar:queryString(req.query.car)};
    const page=querySessionPage(db,selected);
    const latestSession=queryTrackLatestSessionContext(db,trackVenue,selected.carClass,queryString(req.query.car),trackCourse);
    const course=latestSession.trackCourse ?? page.sessions[0]?.trackCourse ?? '';
    const references=loadReferenceLaptimesFromCache();
    const progressionPage = pageNumber(req.query.progressionPage,1,1000000);
    const progression=queryProgression(db,{...selected,page:progressionPage,pageSize:200});
    const filters=queryTrackDetailFilters(db,trackVenue,selected.carClass,queryString(req.query.car),trackCourse);
    res.json({...page, sessionsCount:page.total, trackName:req.params.trackName,
      normalizedTrackName:getCircuitSpecification(req.params.trackName,course).benchmarkName,
      summary:queryTrackDetailSummary(db,trackVenue,selected.carClass,queryString(req.query.car),trackCourse),
      filters,
      latestSession,
      positions:queryTrackPositionAverages(db,trackVenue,selected.carClass,queryString(req.query.car),trackCourse),
      progression,
      benchmarks:references ? findMatchingTrackBenchmarkEntries(references.entries,req.params.trackName,course) : [],revision:revision()});
  });
  router.get('/compare/laps',(req,res) => {
    const ordinal = (name: 'driverOrdinal' | 'lapOrdinal' | 'lapNumber', max: number): number | undefined => {
      const value = req.query[name];
      if (value === undefined) return undefined;
      if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) > max) {
        res.status(400).json({ error: `${name} must be a non-negative integer` });
        return undefined;
      }
      return Number(value);
    };
    const driverOrdinal = ordinal('driverOrdinal', 1000000);
    if (res.headersSent) return;
    const lapOrdinal = ordinal('lapOrdinal', 10000000);
    if (res.headersSent) return;
    const lapNumber = ordinal('lapNumber', 10000000);
    if (res.headersSent) return;
    const track=queryString(req.query.track);
    const filters: CompactCompareFilters = {
      trackName:track,trackVenue:queryString(req.query.trackVenue),trackCourse:queryString(req.query.trackCourse),
      carClass:queryString(req.query.carClass),carType:queryString(req.query.carType),
      driverName:queryString(req.query.driver),sessionId:queryString(req.query.sessionId),
      driverOrdinal, lapOrdinal, lapNumber,
      playerOnly:req.query.playerOnly !== 'false',humansOnly:req.query.humansOnly === 'true',
      telemetryOnly:req.query.telemetryOnly === 'true',
    };
    const page = {page:pageNumber(req.query.page,1,1000000),pageSize:pageNumber(req.query.pageSize,50,100)};
    if (filters.telemetryOnly) {
      res.json({...queryTelemetryComparableLaps(db,filters,page),revision:revision()});
      return;
    }
    const references=loadReferenceLaptimesFromCache();
    const result=queryCompactComparableLaps(db,filters,page);
    res.json({...result,benchmarks:references && track ? findMatchingTrackBenchmarkEntries(references.entries,track,'') : [],revision:revision()});
  });
  return router;
}
