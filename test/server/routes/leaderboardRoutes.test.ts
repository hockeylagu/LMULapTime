import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const referenceCache = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../server/benchmarks/referenceLaptimes.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../server/benchmarks/referenceLaptimes.js')>(),
  loadReferenceLaptimesFromCache: referenceCache.load,
}));

import { createLeaderboardRouter } from '../../../server/routes/leaderboardRoutes.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { SessionDatabase } from '../../../server/core/db.js';
import { DetailedSession } from '../../../shared/types/index.js';
import { driver, lap, session } from '../../domain/leaderboardFixtures.js';

describe('leaderboardRoutes', () => {
  const sessions: DetailedSession[] = [
    session('r1', [driver('Me', [lap(2, 108)], { isPlayer: true }), driver('Rival', [lap(2, 107.7)])]),
  ];
  const loadSessions = vi.fn(() => sessions);
  let sessionDb = new SessionDatabase(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api', createLeaderboardRouter({ loadSessions, get sessionDb() { return sessionDb; } } as unknown as ServerContext));

  beforeEach(() => {
    loadSessions.mockClear();
    referenceCache.load.mockClear();
    sessionDb = new SessionDatabase(':memory:');
    for (const value of sessions) sessionDb.upsertSession(value, value.filename || `${value.id}.xml`, value.timestamp, 1);
    referenceCache.load.mockReturnValue({
      entries: { Monza_LMGT3: { key: 'Monza_LMGT3', trackName: 'Monza', carClass: 'GT3', targets: { alienSec: 106 } } },
    });
  });

  it('answers 503 for boards while summaries rebuild, leaving later /api routers alone', async () => {
    const shared = express();
    shared.use('/api', createLeaderboardRouter({ loadSessions, get sessionDb() { return sessionDb; } } as unknown as ServerContext));
    shared.get('/api/session/:id/telemetry', (_req, res) => { res.json({ ok: true }); });
    sessionDb.getDb().prepare('UPDATE sessions SET projection_version=0').run();
    expect((await request(shared).get('/api/leaderboard/layouts')).status).toBe(503);
    expect((await request(shared).get('/api/session/r1/telemetry')).status).toBe(200);
  });

  it('lists the layouts the player drove, the same on every call', async () => {
    const first = await request(app).get('/api/leaderboard/layouts');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject([{ layoutKey: 'monza_gp', lastCarClass: 'GT3', classes: [{ playerRank: 2, fieldSize: 2 }] }]);
    expect(first.body[0]).not.toHaveProperty('outlinePath');
    const second = await request(app).get('/api/leaderboard/layouts');
    expect(second.body).toEqual(first.body);
  });

  it('answers the board of a layout and class, with its benchmark', async () => {
    const res = await request(app).get('/api/leaderboard?layout=monza_gp&carClass=GT3');
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { driverName: string }) => e.driverName)).toEqual(['Rival', 'Me']);
    expect(res.body.entries.find((e: { isPlayer: boolean }) => e.isPlayer)).toMatchObject({ rank: 2, gapToLeader: 0.3 });
    expect(res.body).not.toHaveProperty('player');
    expect(res.body.benchmark).toMatchObject({ carClass: 'GT3', targets: { alienSec: 106 } });
  });

  it('refuses a board without a layout or a class', async () => {
    const res = await request(app).get('/api/leaderboard?layout=monza_gp');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
    expect((await request(app).get('/api/leaderboard?carClass=GT3&includeRival=true')).status).toBe(400);
  });

  it('returns one consistent board and rival snapshot when requested', async () => {
    const res = await request(app).get('/api/leaderboard?layout=monza_gp&carClass=GT3&includeRival=true');
    expect(res.status).toBe(200);
    expect(res.body.entries[1]).toMatchObject({ driverName: 'Me', rank: 2, isPlayer: true });
    expect(res.body.rivalStatus).toMatchObject({ gap: 0.3 });
    expect(res.body.rivalStatus).not.toHaveProperty('rivalEntry');
    expect(referenceCache.load).toHaveBeenCalledTimes(1);
    expect((await request(app).get('/api/leaderboard?layout=monza_gp&carClass=GT3')).body).not.toHaveProperty('rivalStatus');
  });

  describe('rivals', () => {
    const BOARD = { layout: 'monza_gp', carClass: 'GT3' };

    it('sets the driver about 0.3 s ahead as the rival, and keeps it on the next visit', async () => {
      const first = await request(app).get('/api/leaderboard?layout=monza_gp&carClass=GT3&includeRival=true');
      expect(first.status).toBe(200);
      expect(first.body.rivalStatus).toMatchObject({
        rival: { kind: 'driver', driverName: 'Rival', targetTime: 107.7, startTime: 108, status: 'active' },
        gap: 0.3,
        progress: 0,
        beaten: [],
        trend: [{ sessionId: 'r1', best: 108, gap: 0.3 }],
      });
      const again = await request(app).get('/api/leaderboard?layout=monza_gp&carClass=GT3&includeRival=true');
      expect(again.body.rivalStatus.rival.id).toBe(first.body.rivalStatus.rival.id);
    });

    it('pins a driver ahead as the rival, and refuses one who is not ahead', async () => {
      const pinned = await request(app).post('/api/rivals/pin').send({ ...BOARD, driverName: 'Rival' });
      expect(pinned.body.rival).toMatchObject({ driverName: 'Rival', pinned: true });

      const refused = await request(app).post('/api/rivals/pin').send({ ...BOARD, driverName: 'Me' });
      expect(refused.status).toBe(400);
      expect(refused.body.error).toMatch(/ahead of you/);
    });
  });
});
