import { Router } from 'express';
import { COMPARE_LAP_SORTS, SESSION_TYPE_BY_KIND, WEATHER_CONDITIONS, type SessionKind } from '../../shared/domain/compareLapScope.js';
import { findMatchingTrackBenchmarkEntries } from '../../shared/domain/paceCategory.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
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
import { getSessionLiveCaptures } from '../core/live/dbLiveCaptureStore.js';
import { readSessionStrategy } from '../sessions/sessionStrategy.js';
import { readSessionRacePlan } from '../core/live/dbRacePlanStore.js';
import { readSessionRadioCalls } from '../core/live/dbRadioLogStore.js';

function pageNumber(value: unknown, fallback: number, max = 500): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(max, Math.floor(parsed)) : fallback;
}

export function createSessionRouter(context: ServerContext): Router {
  const router = Router();
  const db = context.sessionDb.getDb();
  const options = (query: Record<string, unknown>): SessionQuery => ({
    track: queryString(query.track), car: queryString(query.car), carClass: queryString(query.carClass),
    hideEmpty: query.hideEmpty === 'true', search: queryString(query.q), hasReplay: query.hasReplay === 'true',
    sessionType: queryString(query.type), sort: queryString(query.sort),
    page: pageNumber(query.page, 1, 1000000), pageSize: pageNumber(query.pageSize, 25, 100),
  });
  const revision = () => context.getScanStatus().dataRevision;
  router.use(['/dashboard', '/tracks', '/track', '/compare'], requireSessionSummaries(context));
  router.get('/dashboard',(req,res)=>res.json(queryCompactDashboard(db,{...options(req.query),revision:revision(),referenceEntries:loadReferenceLaptimesFromCache()?.entries ?? {}})));
  router.get('/session/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session=context.sessionDb.getSessionById(req.params.id);
    if (!session) return res.status(404).json({error:'Session not found'});
    attachPitServices(db,session);
    return res.json({...rateSessionDetail(session),liveCaptures:getSessionLiveCaptures(db,session.id),
      historyContext:querySessionContext(db,session),revision:revision()});
  });
  router.get('/session/:id/strategy', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const strategy = await readSessionStrategy(context.sessionDb, req.params.id);
    if (strategy === undefined) return res.status(404).json({ error: 'Session not found' });
    return res.json({ strategy, plan: strategy ? readSessionRacePlan(db, req.params.id) : null });
  });
  router.get('/session/:id/radio', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Session not found' });
    return res.json({ calls: readSessionRadioCalls(db, req.params.id) });
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
    const trackName = req.params.trackName;
    const selected={...options(req.query),track:trackName,playerCar:queryString(req.query.car)};
    const page=querySessionPage(db,selected);
    const latestSession=queryTrackLatestSessionContext(db,trackName,selected.carClass,queryString(req.query.car));
    const course=latestSession.trackCourse ?? page.sessions[0]?.trackCourse ?? '';
    const references=loadReferenceLaptimesFromCache();
    const progression=queryProgression(db,selected);
    const filters=queryTrackDetailFilters(db,trackName,selected.carClass,queryString(req.query.car));
    res.json({...page, trackName,
      summary:queryTrackDetailSummary(db,trackName,selected.carClass,queryString(req.query.car)),
      filters,
      latestSession,
      positions:queryTrackPositionAverages(db,trackName,selected.carClass,queryString(req.query.car)),
      progression,
      benchmarks:references ? findMatchingTrackBenchmarkEntries(references.entries,trackName,course) : [],revision:revision()});
  });
  router.get('/compare/laps',(req,res) => {
    const ordinal = (name: 'driverOrdinal' | 'lapOrdinal' | 'lapNumber' | 'excludeLapOrdinal', max: number): number | undefined => {
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
    const excludeLapOrdinal = ordinal('excludeLapOrdinal', 10000000);
    if (res.headersSent) return;
    const excludeSessionId = queryString(req.query.excludeSessionId);
    const choice = <T extends string>(name: string, allowed: readonly T[]): T | undefined => {
      const value = queryString(req.query[name]);
      if (value === undefined) return undefined;
      if (!(allowed as readonly string[]).includes(value)) {
        res.status(400).json({ error: `${name} must be one of: ${allowed.join(', ')}` });
        return undefined;
      }
      return value as T;
    };
    const sort = choice('sort', COMPARE_LAP_SORTS);
    if (res.headersSent) return;
    const sessionKind = choice('sessionType', Object.keys(SESSION_TYPE_BY_KIND) as SessionKind[]);
    if (res.headersSent) return;
    const condition = choice('condition', WEATHER_CONDITIONS);
    if (res.headersSent) return;
    const track=queryString(req.query.track);
    const filters: CompactCompareFilters = {
      sessionKind, condition, representativeOnly:req.query.representativeOnly === 'true',
      trackName:track,trackVenue:queryString(req.query.trackVenue),trackCourse:queryString(req.query.trackCourse),
      carClass:queryString(req.query.carClass),carType:queryString(req.query.carType),
      driverName:queryString(req.query.driver),sessionId:queryString(req.query.sessionId),
      driverOrdinal, lapOrdinal, lapNumber, driverNameExact:req.query.driverExact === 'true',
      excludeLap: excludeSessionId !== undefined && excludeLapOrdinal !== undefined ? { sessionId: excludeSessionId, lapOrdinal: excludeLapOrdinal } : undefined,
      playerOnly:req.query.playerOnly !== 'false',humansOnly:req.query.humansOnly === 'true',
      telemetryOnly:req.query.telemetryOnly === 'true',
    };
    const page = {page:pageNumber(req.query.page,1,1000000),pageSize:pageNumber(req.query.pageSize,50,100),sort};
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
