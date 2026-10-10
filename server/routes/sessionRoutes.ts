import { Router } from 'express';
import { findMatchingTrackBenchmarkEntries } from '../../shared/domain/paceCategory.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { ServerContext } from '../core/serverContext.js';
import { queryString } from './queryParams.js';
import { requireSessionSummaries } from './summaryReadiness.js';
import { attachPitServices } from '../sessions/sessionPitStops.js';
import { querySessionPage, queryProgression, type SessionQuery } from '../core/sessionSummaries/pageQueries.js';
import { queryCompactComparableLaps } from '../core/sessionSummaries/comparisonQueries.js';
import { queryTrackDetailFilters, queryTrackDetailSummary, queryTrackLatestSessionContext, queryTrackPositionAverages, queryTrackSummaries } from '../core/sessionSummaries/trackQueries.js';
import { rateSessionDetail } from '../core/sessionSummaries/readTimePace.js';
import { querySessionContext } from '../core/sessionSummaries/contextQueries.js';
import { queryCompactDashboard } from '../core/sessionSummaries/dashboardQueries.js';

export interface SessionFilterOptions {
  track?: string;
  car?: string;
  carClass?: string;
  driver?: string;
  sessionType?: string;
  hideEmpty?: boolean;
}

export function parseSessionFilters(query: Record<string, unknown>): SessionFilterOptions {
  return {
    track: queryString(query.track),
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
  router.use(['/sessions', '/dashboard', '/progression', '/tracks', '/track', '/compare'], requireSessionSummaries(context));
  router.get('/sessions', (req, res) => res.json({...querySessionPage(db,options(req.query)),revision:revision()}));
  router.get('/dashboard',(req,res)=>res.json(queryCompactDashboard(db,{...options(req.query),revision:revision(),referenceEntries:loadReferenceLaptimesFromCache()?.entries ?? {}})));
  router.get('/session/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session=context.sessionDb.getSessionById(req.params.id);
    if (!session) return res.status(404).json({error:'Session not found'});
    attachPitServices(db,session);
    return res.json({...rateSessionDetail(session),historyContext:querySessionContext(db,session),revision:revision()});
  });
  router.get('/progression', (req,res) => res.json({...queryProgression(db,{...options(req.query),pageSize:pageNumber(req.query.pageSize,200)}),revision:revision()}));
  router.get('/tracks', (req,res) => res.json({tracks:queryTrackSummaries(db,queryString(req.query.carClass)),revision:revision()}));
  router.get('/track/:trackName', (req,res) => {
    const selected={...options(req.query),track:req.params.trackName,playerCar:queryString(req.query.car)};
    const page=querySessionPage(db,selected);
    const latestSession=queryTrackLatestSessionContext(db,req.params.trackName,selected.carClass,queryString(req.query.car));
    const course=latestSession.trackCourse ?? page.sessions[0]?.trackCourse ?? '';
    const references=loadReferenceLaptimesFromCache();
    const progressionPage = pageNumber(req.query.progressionPage,1,1000000);
    const progression=queryProgression(db,{...selected,page:progressionPage,pageSize:200});
    const filters=queryTrackDetailFilters(db,req.params.trackName,selected.carClass,queryString(req.query.car));
    res.json({...page, sessionsCount:page.total, trackName:req.params.trackName,
      normalizedTrackName:getCircuitSpecification(req.params.trackName,course).benchmarkName,
      summary:queryTrackDetailSummary(db,req.params.trackName,selected.carClass,queryString(req.query.car)),
      filters,
      latestSession,
      positions:queryTrackPositionAverages(db,req.params.trackName,selected.carClass,queryString(req.query.car)),
      progression,
      benchmarks:references ? findMatchingTrackBenchmarkEntries(references.entries,req.params.trackName,course) : [],revision:revision()});
  });
  router.get('/compare/laps',(req,res) => {
    const ordinal = (name: 'driverOrdinal' | 'lapOrdinal' | 'lapNum', max: number): number | undefined => {
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
    const lapNum = ordinal('lapNum', 10000000);
    if (res.headersSent) return;
    const track=queryString(req.query.track); const references=loadReferenceLaptimesFromCache();
    const result=queryCompactComparableLaps(db,id=>context.sessionDb.getSessionById(id),{
      trackName:track,carClass:queryString(req.query.carClass),carModel:queryString(req.query.carModel),
      driverName:queryString(req.query.driver),sessionId:queryString(req.query.sessionId),
      driverOrdinal, lapOrdinal, lapNum,
      playerOnly:req.query.playerOnly !== 'false',humansOnly:req.query.humansOnly === 'true',
    },{page:pageNumber(req.query.page,1,1000000),pageSize:pageNumber(req.query.pageSize,50,100)});
    res.json({...result,benchmarks:references && track ? findMatchingTrackBenchmarkEntries(references.entries,track,'') : [],revision:revision()});
  });
  return router;
}
