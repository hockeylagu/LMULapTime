import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const referenceCache = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../server/benchmarks/referenceLaptimes.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../server/benchmarks/referenceLaptimes.js')>(),
  loadReferenceLaptimesFromCache: referenceCache.load,
}));

import {
  createSessionRouter,
  filterSessions,
  parseSessionFilters,
} from '../../../server/routes/sessionRoutes.js';
import { DetailedSession, ReferenceLaptimeEntry } from '../../../server/core/types.js';
import { ServerContext } from '../../../server/core/serverContext.js';

describe('sessionRoutes and filterSessions', () => {
  const mockSessions: DetailedSession[] = [
    {
      id: 'sess_1',
      filename: 'sess_1.xml',
      filePath: '/path/1',
      trackVenue: 'Spa',
      trackCourse: 'GP',
      trackEvent: '',
      trackLengthMeters: 7004,
      timeString: '2026/05/28 14:00',
      timestamp: 1000,
      sessionType: 'Practice',
      sessionName: 'P1',
      driversCount: 1,
      drivers: [
        {
          name: 'Driver Alpha',
          isPlayer: true,
          carType: 'Ferrari 499P',
          carClass: 'Hypercar',
          carNumber: '50',
          teamName: 'AF',
          position: 1,
          classPosition: 1,
          bestLapTime: 120.0,
          bestLapTimeString: '2:00.000',
          bestS1: 30,
          bestS2: 45,
          bestS3: 45,
          theoreticalBest: 120.0,
          theoreticalBestString: '2:00.000',
          lapsCount: 2,
          laps: [
            { lapNum: 1, position: 1, lapTime: 120.0, lapTimeString: '2:00.000', s1: 30, s2: 45, s3: 45, topSpeed: 300, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: false },
          ],
        },
      ],
      playerDriver: {
        name: 'Driver Alpha',
        isPlayer: true,
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        carNumber: '50',
        teamName: 'AF',
        position: 1,
        classPosition: 1,
        bestLapTime: 120.0,
        bestLapTimeString: '2:00.000',
        bestS1: 30,
        bestS2: 45,
        bestS3: 45,
        theoreticalBest: 120.0,
        theoreticalBestString: '2:00.000',
        lapsCount: 2,
        laps: [],
      },
    },
    {
      id: 'sess_2',
      filename: 'sess_2.xml',
      filePath: '/path/2',
      trackVenue: 'Monza',
      trackCourse: 'GP',
      trackEvent: '',
      trackLengthMeters: 5793,
      timeString: '2026/05/29 14:00',
      timestamp: 2000,
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      driversCount: 1,
      drivers: [
        {
          name: 'Driver Beta',
          isPlayer: false,
          carType: 'Porsche 963',
          carClass: 'Hypercar',
          carNumber: '5',
          teamName: 'Penske',
          position: 1,
          classPosition: 1,
          bestLapTime: 96.0,
          bestLapTimeString: '1:36.000',
          bestS1: 27,
          bestS2: 38,
          bestS3: 31,
          theoreticalBest: 96.0,
          theoreticalBestString: '1:36.000',
          lapsCount: 3,
          laps: [
            { lapNum: 1, position: 1, lapTime: 96.0, lapTimeString: '1:36.000', s1: 27, s2: 38, s3: 31, topSpeed: 330, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false },
          ],
        },
      ],
      playerDriver: undefined,
    },
    {
      id: 'sess_empty',
      filename: 'sess_empty.xml',
      filePath: '/path/empty',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      trackEvent: '',
      trackLengthMeters: 5412,
      timeString: '2026/05/30 14:00',
      timestamp: 3000,
      sessionType: 'Practice',
      sessionName: 'P2',
      driversCount: 0,
      drivers: [],
      playerDriver: undefined,
    },
  ];

  describe('parseSessionFilters', () => {
    it('parses valid query parameters into SessionFilterOptions', () => {
      const filters = parseSessionFilters({
        track: 'Spa',
        car: 'Ferrari',
        carClass: 'Hypercar',
        driver: 'Alpha',
        sessionType: 'Practice',
        hideEmpty: 'true',
      });

      expect(filters.track).toBe('Spa');
      expect(filters.car).toBe('Ferrari');
      expect(filters.carClass).toBe('Hypercar');
      expect(filters.driver).toBe('Alpha');
      expect(filters.sessionType).toBe('Practice');
      expect(filters.hideEmpty).toBe(true);
    });

    it('treats a repeated or nested parameter as absent', () => {
      const filters = parseSessionFilters({ track: ['Spa', 'Monza'], driver: { name: 'Alpha' }, carClass: 'Hypercar' });
      expect(filters.track).toBeUndefined();
      expect(filters.driver).toBeUndefined();
      expect(filters.carClass).toBe('Hypercar');
    });

    it('handles filterEmpty alias and undefined fields', () => {
      const filters = parseSessionFilters({ filterEmpty: 'true' });
      expect(filters.hideEmpty).toBe(true);
      expect(filters.track).toBeUndefined();
    });
  });

  describe('filterSessions', () => {
    it('filters out empty sessions when hideEmpty is true', () => {
      const result = filterSessions(mockSessions, { hideEmpty: true });
      expect(result).toHaveLength(2);
      expect(result.some(s => s.id === 'sess_empty')).toBe(false);
    });

    it('filters sessions by track matching', () => {
      const result = filterSessions(mockSessions, { track: 'Spa' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_1');
    });

    it('filters sessions by sessionType matching', () => {
      const result = filterSessions(mockSessions, { sessionType: 'Qualifying' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_2');
    });

    it('filters sessions by driver name', () => {
      const result = filterSessions(mockSessions, { driver: 'Beta' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_2');
    });

    it('filters sessions by car model substring', () => {
      const result = filterSessions(mockSessions, { car: 'Ferrari' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sess_1');
    });

    it('ignores "All" sentinel values across all filter fields', () => {
      const result = filterSessions(mockSessions, {
        track: 'All',
        car: 'All',
        carClass: 'All',
        driver: 'All',
        sessionType: 'All',
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('createSessionRouter integration', () => {
    let app: express.Express;

    beforeEach(() => {
      referenceCache.load.mockReturnValue(null);
      const context = {
        loadSessions: () => mockSessions,
      } as unknown as ServerContext;

      app = express();
      app.use('/api', createSessionRouter(context));
    });

    it('GET /api/sessions returns filtered sessions metadata without drivers payload', async () => {
      const res = await request(app).get('/api/sessions?track=Spa');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('sess_1');
      expect(res.body[0].drivers).toBeUndefined();
    });

    it('GET /api/sessions answers a repeated filter instead of failing', async () => {
      const res = await request(app).get('/api/sessions?track=Spa&track=Monza&driver=Alpha&driver=Beta');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/track/:trackName reads a name containing % as sent', async () => {
      const res = await request(app).get(`/api/track/${encodeURIComponent('Spa 100%')}`);
      expect(res.status).toBe(200);
      expect(res.body.trackName).toBe('Spa 100%');
    });

    it('GET /api/progression applies shared session filters and computes progression', async () => {
      const res = await request(app).get('/api/progression?track=Spa&driver=Driver Alpha');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].sessionId).toBe('sess_1');
      expect(res.body[0].driverName).toBe('Driver Alpha');
    });
  });

  describe('GET /api/session/:id', () => {
    let resultsDir: string;
    const sessionDb = { getSessionById: vi.fn() };
    const enrichSessionsWithTelemetry = vi.fn();
    const parseAndCacheFile = vi.fn();

    function sessionApp(): express.Express {
      const context = { sessionDb, enrichSessionsWithTelemetry, parseAndCacheFile, resultsDir } as unknown as ServerContext;
      const app = express();
      app.use('/api', createSessionRouter(context));
      return app;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-session-route-'));
    });
    afterEach(() => fs.rmSync(resultsDir, { recursive: true, force: true }));

    it('answers from the cache, with telemetry links, without reading the results folder', async () => {
      sessionDb.getSessionById.mockReturnValue(mockSessions[0]);

      const res = await request(sessionApp()).get('/api/session/sess_1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sess_1');
      expect(res.body.drivers).toHaveLength(1);
      expect(res.headers['cache-control']).toBe('private, max-age=120');
      expect(enrichSessionsWithTelemetry).toHaveBeenCalledWith([expect.objectContaining({ id: 'sess_1' })]);
      expect(parseAndCacheFile).not.toHaveBeenCalled();
    });

    it('parses a results file the cache does not know yet, with or without the .xml suffix', async () => {
      sessionDb.getSessionById.mockReturnValue(undefined);
      fs.writeFileSync(path.join(resultsDir, 'sess_new.xml'), '<rFactorXML/>');
      parseAndCacheFile.mockReturnValue({ ...mockSessions[1], id: 'sess_new' });

      const bare = await request(sessionApp()).get('/api/session/sess_new');
      const suffixed = await request(sessionApp()).get('/api/session/sess_new.xml');

      expect(bare.status).toBe(200);
      expect(bare.body.id).toBe('sess_new');
      expect(suffixed.status).toBe(200);
      expect(parseAndCacheFile).toHaveBeenNthCalledWith(1, path.join(resultsDir, 'sess_new.xml'));
      expect(parseAndCacheFile).toHaveBeenNthCalledWith(2, path.join(resultsDir, 'sess_new.xml'));
    });

    it('answers 404 when the session is neither cached nor on disk, or its file does not parse', async () => {
      sessionDb.getSessionById.mockReturnValue(undefined);
      fs.writeFileSync(path.join(resultsDir, 'broken.xml'), 'not xml');
      parseAndCacheFile.mockReturnValue(null);

      const missing = await request(sessionApp()).get('/api/session/nope');
      const broken = await request(sessionApp()).get('/api/session/broken');

      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: 'Session not found' });
      expect(broken.status).toBe(404);
      expect(enrichSessionsWithTelemetry).not.toHaveBeenCalled();
    });
  });

  describe('track and comparison routes', () => {
    const benchmark = (trackName: string, carClass: string): ReferenceLaptimeEntry => ({
      key: `${trackName}_${carClass}`, trackName, carClass, patch: '1.4+', target100Sec: 100,
      targets: { alienSec: 100, competitiveSec: 101, goodSec: 102, goodMidpackSec: 103, midpackSec: 104, midpackTailSec: 105, tailEnderSec: 106, offlineSec: 107 },
    });
    let app: express.Express;

    beforeEach(() => {
      referenceCache.load.mockReturnValue({
        lastUpdated: '2026-09-20T00:00:00.000Z',
        entriesCount: 3,
        entries: [benchmark('Monza', 'Hypercar'), benchmark('Monza (curvagrande)', 'Hypercar'), benchmark('Spa', 'Hypercar')],
      });
      app = express();
      app.use('/api', createSessionRouter({ loadSessions: () => mockSessions } as unknown as ServerContext));
    });

    it("GET /api/track/:trackName lists that layout's sessions without drivers and only its own benchmarks", async () => {
      const res = await request(app).get('/api/track/Monza');

      expect(res.status).toBe(200);
      expect(res.body.sessionsCount).toBe(1);
      expect(res.body.sessions.map((s: DetailedSession) => s.id)).toEqual(['sess_2']);
      expect(res.body.sessions[0].drivers).toBeUndefined();
      expect(res.body.benchmarks.map((b: ReferenceLaptimeEntry) => b.trackName)).toEqual(['Monza']);
    });

    it('GET /api/track/:trackName has no benchmarks before the table is first downloaded', async () => {
      referenceCache.load.mockReturnValue(null);
      const res = await request(app).get('/api/track/Spa');
      expect(res.body.sessionsCount).toBe(1);
      expect(res.body.benchmarks).toEqual([]);
    });

    it("GET /api/compare/laps keeps only the player's laps unless playerOnly=false", async () => {
      const playerOnly = await request(app).get('/api/compare/laps?track=Monza');
      const everyone = await request(app).get('/api/compare/laps?track=Monza&playerOnly=false');

      expect(playerOnly.status).toBe(200);
      expect(playerOnly.body.laps).toEqual([]);
      expect(everyone.body.laps.map((l: { driverName: string }) => l.driverName)).toEqual(['Driver Beta']);
      expect(everyone.body.benchmarks.map((b: ReferenceLaptimeEntry) => b.trackName)).toEqual(['Monza']);
    });

    it('GET /api/compare/laps without a track has no benchmarks', async () => {
      const res = await request(app).get('/api/compare/laps?playerOnly=false');
      expect(res.status).toBe(200);
      expect(res.body.benchmarks).toEqual([]);
    });
  });
});
