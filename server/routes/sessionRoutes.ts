import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { computeProgression, extractComparableLaps } from '../sessions/sessionAnalytics.js';
import { findMatchingTrackBenchmarkEntries, matchesTrack, matchesSessionCarClass } from '../../shared/domain/paceCategory.js';
import { matchesSessionType, isSessionEmpty } from '../../shared/domain/formatters.js';
import { loadReferenceLaptimesFromCache } from '../benchmarks/referenceLaptimes.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { ServerContext } from '../core/serverContext.js';

export function createSessionRouter(context: ServerContext): Router {
  const router = Router();

  router.get('/sessions', (req, res) => {
    const forceRefresh = req.query.refresh === 'true';
    const track = req.query.track as string | undefined;
    const car = req.query.car as string | undefined;
    const carClass = req.query.carClass as string | undefined;
    const driver = req.query.driver as string | undefined;
    const sessionType = req.query.sessionType as string | undefined;
    const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';
    let sessions = context.loadSessions(forceRefresh);

    if (hideEmpty) sessions = sessions.filter(session => !isSessionEmpty(session));
    if (track && track !== 'All') sessions = sessions.filter(session => matchesTrack(track, session.trackVenue, session.trackCourse));
    if (sessionType && sessionType !== 'All') sessions = sessions.filter(session => matchesSessionType(session.sessionType, session.sessionName, sessionType));
    if (carClass && carClass !== 'All') sessions = sessions.filter(session => matchesSessionCarClass(session, carClass));
    if (driver && driver !== 'All') {
      const driverLower = driver.toLowerCase();
      sessions = sessions.filter(session =>
        (session.playerDriver?.name && session.playerDriver.name.toLowerCase().includes(driverLower)) ||
        session.drivers.some(driverData => driverData.name.toLowerCase().includes(driverLower))
      );
    }
    if (car && car !== 'All') {
      sessions = sessions.filter(session => session.drivers.some(driverData => driverData.carType.toLowerCase().includes(car.toLowerCase())));
    }

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
    const driverName = req.query.driver as string | undefined;
    const track = req.query.track as string | undefined;
    const carClass = req.query.carClass as string | undefined;
    const sessionType = req.query.sessionType as string | undefined;
    const hideEmpty = req.query.hideEmpty === 'true' || req.query.filterEmpty === 'true';
    let sessions = context.loadSessions();

    if (hideEmpty) sessions = sessions.filter(session => !isSessionEmpty(session));
    if (track && track !== 'All') sessions = sessions.filter(session => matchesTrack(track, session.trackVenue, session.trackCourse));
    if (sessionType && sessionType !== 'All') sessions = sessions.filter(session => matchesSessionType(session.sessionType, session.sessionName, sessionType));
    if (carClass && carClass !== 'All') sessions = sessions.filter(session => matchesSessionCarClass(session, carClass));

    res.json(computeProgression(sessions, driverName));
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
