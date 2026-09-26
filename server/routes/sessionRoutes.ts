import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { computeProgression, extractComparableLaps } from '../sessions/sessionAnalytics.js';
import { findMatchingTrackBenchmarkEntries, matchesTrack, matchesSessionCarClass } from '../../shared/domain/paceCategory.js';
import { matchesSessionType, isSessionEmpty } from '../../shared/domain/formatters.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { ServerContext } from '../core/serverContext.js';
import { DetailedSession } from '../core/types.js';

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
    track: query.track as string | undefined,
    car: query.car as string | undefined,
    carClass: query.carClass as string | undefined,
    driver: query.driver as string | undefined,
    sessionType: query.sessionType as string | undefined,
    hideEmpty: query.hideEmpty === 'true' || query.filterEmpty === 'true',
  };
}

export function filterSessions(sessions: DetailedSession[], options: SessionFilterOptions): DetailedSession[] {
  let filtered = sessions;

  if (options.hideEmpty) {
    filtered = filtered.filter(session => !isSessionEmpty(session));
  }
  if (options.track && options.track !== 'All') {
    filtered = filtered.filter(session => matchesTrack(options.track, session.trackVenue, session.trackCourse));
  }
  if (options.sessionType && options.sessionType !== 'All') {
    filtered = filtered.filter(session => matchesSessionType(session.sessionType, session.sessionName, options.sessionType));
  }
  if (options.carClass && options.carClass !== 'All') {
    filtered = filtered.filter(session => matchesSessionCarClass(session, options.carClass));
  }
  if (options.driver && options.driver !== 'All') {
    const driverLower = options.driver.toLowerCase();
    filtered = filtered.filter(session =>
      (session.playerDriver?.name && session.playerDriver.name.toLowerCase().includes(driverLower)) ||
      session.drivers.some(driverData => driverData.name.toLowerCase().includes(driverLower))
    );
  }
  if (options.car && options.car !== 'All') {
    const carLower = options.car.toLowerCase();
    filtered = filtered.filter(session =>
      session.drivers.some(driverData => driverData.carType.toLowerCase().includes(carLower))
    );
  }

  return filtered;
}

export function createSessionRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/sessions', (req, res) => {
    const forceRefresh = req.query.refresh === 'true';
    const filters = parseSessionFilters(req.query as Record<string, unknown>);
    const sessions = filterSessions(context.loadSessions(forceRefresh), filters);

    res.json(sessions.map(session => {
      const { drivers, ...metadata } = session;
      return metadata;
    }));
  });

  router.get('/session/:id', (req, res) => {
    const { id } = req.params;
    res.setHeader('Cache-Control', 'private, max-age=120');

    const cached = context.sessionDb.getSessionById(id);
    if (cached) {
      context.enrichSessionsWithTelemetry([cached]);
      return res.json(cached);
    }

    const singleFilePath = path.join(context.resultsDir, id.endsWith('.xml') ? id : `${id}.xml`);
    if (fs.existsSync(singleFilePath)) {
      const parsed = context.parseAndCacheFile(singleFilePath);
      if (parsed) {
        context.enrichSessionsWithTelemetry([parsed]);
        return res.json(parsed);
      }
    }
    return res.status(404).json({ error: 'Session not found' });
  });

  router.get('/progression', (req, res) => {
    const filters = parseSessionFilters(req.query as Record<string, unknown>);
    // In progression, driver is the focal driver for progression points rather than a session exclusion filter
    const sessions = filterSessions(context.loadSessions(), { ...filters, driver: undefined });

    res.json(computeProgression(sessions, filters.driver));
  });

  router.get('/track/:trackName', (req, res) => {
    const decoded = decodeURIComponent(req.params.trackName);
    const allSessions = context.loadSessions();
    const trackSessions = allSessions.filter(session => matchesTrack(decoded, session.trackVenue, session.trackCourse));
    const sampleCourse = trackSessions.length > 0 ? trackSessions[0].trackCourse : '';
    const refCache = loadReferenceLaptimesFromCache();

    res.json({
      trackName: decoded,
      normalizedTrackName: getCircuitSpecification(decoded, sampleCourse).benchmarkName,
      sessionsCount: trackSessions.length,
      sessions: trackSessions.map(session => {
        const { drivers, ...metadata } = session;
        return metadata;
      }),
      benchmarks: refCache ? findMatchingTrackBenchmarkEntries(refCache.entries, decoded, sampleCourse) : [],
    });
  });

  router.get('/compare/laps', (req, res) => {
    const track = req.query.track as string | undefined;
    const refCache = loadReferenceLaptimesFromCache();
    const comparisonData = extractComparableLaps(context.loadSessions(), {
      trackName: track,
      carClass: req.query.carClass as string | undefined,
      carModel: req.query.carModel as string | undefined,
      driverName: req.query.driver as string | undefined,
      sessionId: req.query.sessionId as string | undefined,
      playerOnly: req.query.playerOnly !== 'false',
    });

    res.json({
      ...comparisonData,
      benchmarks: refCache && track ? findMatchingTrackBenchmarkEntries(refCache.entries, track, '') : [],
    });
  });

  return router;
}
