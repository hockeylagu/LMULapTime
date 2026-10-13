import { querySessionPage, type SessionQuery } from '../../../server/core/sessionSummaries/pageQueries.js';
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
  parseSessionFilters,
} from '../../../server/routes/sessionRoutes.js';
import { DetailedSession, ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { SessionDatabase } from '../../../server/core/db.js';

function createSessionDb(sessions: DetailedSession[] = []): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  for (const session of sessions) {
    const stored = structuredClone(session);
    const playerOrdinal = stored.drivers.findIndex(driver => driver.isPlayer);
    if (playerOrdinal >= 0) stored.playerDriver = stored.drivers[playerOrdinal];
    db.upsertSession(stored, session.filePath ?? `${session.id}.xml`, session.timestamp, 1);
  }
  return db;
}

function filterSessions(sessions: DetailedSession[], options: SessionQuery) {
  const db = createSessionDb(sessions);
  try { return querySessionPage(db.getDb(), { ...options, pageSize: 100 }).sessions; }
  finally { db.close(); }
}
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
          carClass: 'Hyper',
          carNumber: '50',
          teamName: 'AF',
          position: 1,
          classPosition: 1,
          bestLapTime: 120.0,
          bestS1: 30,
          bestS2: 45,
          bestS3: 45,
          theoreticalBest: 120.0,
          declaredLapsCount: 2,
          laps: [
            { lapNumber: 1, position: 1, lapTime: 120.0, s1: 30, s2: 45, s3: 45, topSpeed: 300, fCompound: 'Hard', rCompound: 'Hard', isValid: true, isPitStop: false },
          ],
        },
      ],
      playerDriver: {
        name: 'Driver Alpha',
        isPlayer: true,
        carType: 'Ferrari 499P',
        carClass: 'Hyper',
        carNumber: '50',
        teamName: 'AF',
        position: 1,
        classPosition: 1,
        bestLapTime: 120.0,
        bestS1: 30,
        bestS2: 45,
        bestS3: 45,
        theoreticalBest: 120.0,
        declaredLapsCount: 2,
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
          carClass: 'Hyper',
          carNumber: '5',
          teamName: 'Penske',
          position: 1,
          classPosition: 1,
          bestLapTime: 96.0,
          bestS1: 27,
          bestS2: 38,
          bestS3: 31,
          theoreticalBest: 96.0,
          declaredLapsCount: 3,
          laps: [
            { lapNumber: 1, position: 1, lapTime: 96.0, s1: 27, s2: 38, s3: 31, topSpeed: 330, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false },
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
        carClass: 'Hyper',
        driver: 'Alpha',
        sessionType: 'Practice',
        hideEmpty: 'true',
      });

      expect(filters.track).toBe('Spa');
      expect(filters.car).toBe('Ferrari');
      expect(filters.carClass).toBe('Hyper');
      expect(filters.driver).toBe('Alpha');
      expect(filters.sessionType).toBe('Practice');
      expect(filters.hideEmpty).toBe(true);
    });

    it('treats a repeated or nested parameter as absent', () => {
      const filters = parseSessionFilters({ track: ['Spa', 'Monza'], driver: { name: 'Alpha' }, carClass: 'Hyper' });
      expect(filters.track).toBeUndefined();
      expect(filters.driver).toBeUndefined();
      expect(filters.carClass).toBe('Hyper');
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
    let sessionDb: SessionDatabase;

    beforeEach(() => {
      referenceCache.load.mockReturnValue(null);
      sessionDb = createSessionDb(mockSessions);
      const context = {
        sessionDb,
        getScanStatus: () => ({ dataRevision: 'test:1' }),
      } as unknown as ServerContext;

      app = express();
      app.use('/api', createSessionRouter(context));
    });
    afterEach(() => sessionDb.close());

    it('has removed the combined snapshot endpoint', async () => {
      const res = await request(app).get('/api/session-snapshot');
      expect(res.status).toBe(404);
    });

    it('GET /api/sessions returns a compact filtered page and total count', async () => {
      const res = await request(app).get('/api/sessions?track=Spa&page=1&pageSize=1');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].id).toBe('sess_1');
      expect(res.body.sessions[0].drivers).toBeUndefined();
      expect(res.body.sessions[0].playerDriver).not.toHaveProperty('laps');
      expect(res.body.sessions[0].playerDriver).toHaveProperty('lapsCount');
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(1);
    });

    it('GET /api/sessions leaves out lap stewards and traffic records without touching the cached session', () => {
      const session = structuredClone(mockSessions[0]);
      const player = session.playerDriver!;
      const lapRecords = { traffic: { passed: [], passedBy: [] }, incidents: [{ elapsedTime: 1 }], trackLimits: [{ elapsedTime: 2 }] };
      player.laps = [{ ...session.drivers[0].laps[0], ...lapRecords } as unknown as typeof player.laps[number]];
      player.incidents = lapRecords.incidents as unknown as typeof player.incidents;
      player.trackLimits = lapRecords.trackLimits as unknown as typeof player.trackLimits;

      const entry = filterSessions([session], {})[0];

      expect(entry).not.toHaveProperty('drivers');
      expect(entry.playerDriver).not.toHaveProperty('incidents');
      expect(entry.playerDriver).not.toHaveProperty('trackLimits');
      expect(entry.playerDriver).not.toHaveProperty('laps');
      expect(entry.playerDriver?.bestLapTime).toBe(120);
      expect(player.laps[0].traffic).toBeDefined();
      expect(player.incidents).toHaveLength(1);
      expect(session.drivers).toHaveLength(1);
    });

    it('GET /api/sessions safely ignores repeated filters', async () => {
      const res = await request(app).get('/api/sessions?track=Spa&track=Monza&driver=Alpha&driver=Beta');
      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });

    it('GET /api/track/:trackName reads a name containing % as sent', async () => {
      const res = await request(app).get(`/api/track/${encodeURIComponent('Spa 100%')}`);
      expect(res.status).toBe(200);
      expect(res.body.trackName).toBe('Spa 100%');
    });

  });

  describe('GET /api/session/:id', () => {
    let sessionDb:SessionDatabase;
    let app:express.Express;
    beforeEach(()=>{
      sessionDb=createSessionDb(mockSessions);
      app=express();
      app.use('/api',createSessionRouter({sessionDb,getScanStatus:()=>({dataRevision:'test:1'})} as unknown as ServerContext));
    });
    afterEach(()=>sessionDb.close());
    it('reads one retained detail without discovering files or rematching recordings',async()=>{
      const response=await request(app).get('/api/session/sess_1');
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('sess_1');
      expect(response.body.drivers).toHaveLength(1);
      expect(response.body.playerDriver?.driverOrdinal).toBe(0);
      expect(response.body.drivers[0].driverOrdinal).toBe(0);
      expect(response.body.drivers[0].laps[0].lapOrdinal).toBe(0);
      expect(response.body.historyContext.personalBests).toEqual([{driverOrdinal:0,bestLapTime:120}]);
      expect(response.headers['cache-control']).toBe('no-store');
    });
    it('returns 404 for a source not yet ingested',async()=>{
      expect((await request(app).get('/api/session/sess_new')).status).toBe(404);
    });
    it('loads a driver PB on demand and validates its session and ordinal', async () => {
      const response = await request(app).get('/api/session/sess_1/personal-best/0');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ driverOrdinal: 0, bestLapTime: 120, ready: true });
      expect(response.headers['cache-control']).toBe('no-store');
      const hydrateSession = vi.spyOn(sessionDb, 'getSessionById');
      const aliasResponse = await request(app).get('/api/session/sess_1.xml/personal-best/0');
      expect(aliasResponse.status).toBe(404);
      expect(hydrateSession).not.toHaveBeenCalled();
      for (const ordinal of ['-1', '1', '1.5', 'abc']) {
        expect((await request(app).get(`/api/session/sess_1/personal-best/${ordinal}`)).status).toBe(400);
      }
      expect((await request(app).get('/api/session/missing/personal-best/0')).status).toBe(404);
      expect((await request(app).get('/api/session/missing/personal-best/abc')).status).toBe(404);
      sessionDb.getDb().prepare('UPDATE sessions SET projection_version=0').run();
      expect((await request(app).get('/api/session/sess_1/personal-best/0')).body.ready).toBe(false);
    });
    it('does not report incomplete summaries as complete totals',async()=>{
      sessionDb.getDb().prepare('UPDATE sessions SET projection_version=0 WHERE id=?').run('sess_1');
      expect((await request(app).get('/api/sessions')).status).toBe(503);
      expect((await request(app).get('/api/session/sess_1')).status).toBe(200);
    });
    it('holds only its history reads while summaries rebuild, not routers mounted after it',async()=>{
      // Routers share the /api prefix: session telemetry and replay routes come after this one.
      app.get('/api/session/:id/telemetry',(_req,res)=>{ res.json({ok:true}); });
      app.get('/api/tracksheet',(_req,res)=>{ res.json({ok:true}); });
      sessionDb.getDb().prepare('UPDATE sessions SET projection_version=0 WHERE id=?').run('sess_1');
      expect((await request(app).get('/api/track/Monza')).status).toBe(503);
      expect((await request(app).get('/api/session/sess_1/telemetry')).status).toBe(200);
      expect((await request(app).get('/api/tracksheet')).status).toBe(200);
    });
  });
  describe('track and comparison routes', () => {
    const benchmark = (trackName: string, carClass: string): ReferenceLaptimeEntry => ({
      key: `${trackName}_${carClass}`, trackName, carClass, patch: '1.4+',
      targets: { alienSec: 100, competitiveSec: 101, goodSec: 102, goodMidpackSec: 103, midpackSec: 104, midpackTailSec: 105, tailEnderSec: 106, offlineSec: 107 },
    });
    let app: express.Express;
    let sessionDb:SessionDatabase;
    afterEach(()=>sessionDb.close());

    beforeEach(() => {
      referenceCache.load.mockReturnValue({
        lastUpdated: '2026-09-20T00:00:00.000Z',
        entriesCount: 3,
        entries: [benchmark('Monza', 'Hyper'), benchmark('Monza (curvagrande)', 'Hyper'), benchmark('Spa', 'Hyper')],
      });
      app = express();
      sessionDb=createSessionDb(mockSessions);
      app.use('/api', createSessionRouter({ sessionDb,getScanStatus:()=>({dataRevision:'test:1'}) } as unknown as ServerContext));
    });

    it("GET /api/track/:trackName lists that layout's sessions without drivers and only its own benchmarks", async () => {
      const res = await request(app).get('/api/track/Monza');

      expect(res.status).toBe(200);
      expect(res.body.sessionsCount).toBe(1);
      expect(res.body.sessions.map((s: DetailedSession) => s.id)).toEqual(['sess_2']);
      expect(res.body.sessions[0].drivers).toBeUndefined();
      expect(res.body.benchmarks.map((b: ReferenceLaptimeEntry) => b.trackName)).toEqual(['Monza']);
    });

    it('GET /api/track/:trackName returns every progression point, not one page of them', async () => {
      const template = mockSessions.find(session => session.trackVenue === 'Spa');
      if (!template) throw new Error('Spa fixture missing');
      const many = Array.from({ length: 230 }, (_, index) => ({
        ...structuredClone(template), id: `spa_many_${index}`, filename: `spa_many_${index}.xml`, filePath: `spa_many_${index}.xml`, timestamp: 5000 + index,
      }));
      const bigDb = createSessionDb(many);
      const bigApp = express();
      bigApp.use('/api', createSessionRouter({ sessionDb: bigDb, getScanStatus: () => ({ dataRevision: 'test:2' }) } as unknown as ServerContext));
      try {
        const res = await request(bigApp).get('/api/track/Spa');
        expect(res.body.sessions).toHaveLength(25);
        expect(res.body.progression).toHaveLength(230);
        expect(res.body.progression[0].sessionId).toBe('spa_many_0');
        expect(res.body.progression[229].sessionId).toBe('spa_many_229');
      } finally { bigDb.close(); }
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

    it.each(['-1', '1.5', 'NaN', ''])('GET /api/compare/laps rejects invalid driver ordinals (%s)', async ordinal => {
      const response = await request(app).get(`/api/compare/laps?driverOrdinal=${encodeURIComponent(ordinal)}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/driverOrdinal/);
    });

    it('GET /api/compare/laps telemetry picker returns only its page without loading sessions or benchmarks', async () => {
      referenceCache.load.mockClear();
      const readSession = vi.spyOn(sessionDb, 'getSessionById');
      const response = await request(app).get('/api/compare/laps?track=Spa&telemetryOnly=true');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ laps: [], total: 0, page: 1, pageSize: 50 });
      expect(response.body).not.toHaveProperty('allTimeBestLap');
      expect(response.body).not.toHaveProperty('benchmarks');
      expect(referenceCache.load).not.toHaveBeenCalled();
      expect(readSession).not.toHaveBeenCalled();
    });

    it.each(['sort=best', 'sessionType=Race', 'condition=Foggy'])('GET /api/compare/laps rejects unknown picker params (%s)', async param => {
      const response = await request(app).get(`/api/compare/laps?track=Spa&telemetryOnly=true&${param}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(param.split('=')[0]);
    });

    it('GET /api/compare/laps accepts the telemetry picker sort and filters and lists car types', async () => {
      const response = await request(app).get('/api/compare/laps?track=Spa&telemetryOnly=true&sort=recent&sessionType=quali&condition=Dynamic%20Weather&carType=BMW');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ laps: [], total: 0, carTypes: [] });
    });

    it('GET /api/compare/laps accepts the exact-driver and excluded-lap options of the reference suggestion', async () => {
      const response = await request(app).get('/api/compare/laps?track=Spa&telemetryOnly=true&driver=Driver%20Alpha&driverExact=true&excludeSessionId=sess_1&excludeLapOrdinal=0&pageSize=1&page=2');
      expect(response.status).toBe(200);
      expect(response.body.carTypes).toBeUndefined();
      expect((await request(app).get('/api/compare/laps?track=Spa&telemetryOnly=true&excludeLapOrdinal=-1')).status).toBe(400);
    });

    it('GET /api/compare/laps without a track has no benchmarks', async () => {
      const res = await request(app).get('/api/compare/laps?playerOnly=false');
      expect(res.status).toBe(200);
      expect(res.body.benchmarks).toEqual([]);
    });
  });
});
