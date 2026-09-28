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
import { DetailedSession } from '../../../server/core/types.js';
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
    sessionDb = new SessionDatabase(':memory:');
    referenceCache.load.mockReturnValue({
      entries: { Monza_LMGT3: { key: 'Monza_LMGT3', trackName: 'Monza', carClass: 'LMGT3', target100Sec: 106 } },
    });
  });

  it('lists the layouts the player drove, the same on every call', async () => {
    const first = await request(app).get('/api/leaderboard/layouts');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject([{ layoutKey: 'monza_gp', lastCarClass: 'LMGT3', classes: [{ playerRank: 2, fieldSize: 2 }] }]);
    expect(first.body[0].outlinePath).toMatch(/^M.+Z$/);
    const second = await request(app).get('/api/leaderboard/layouts');
    expect(second.body).toEqual(first.body);
  });

  it('answers the board of a layout and class, with its benchmark', async () => {
    const res = await request(app).get('/api/leaderboard?layout=monza_gp&carClass=LMGT3');
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { driverName: string }) => e.driverName)).toEqual(['Rival', 'Me']);
    expect(res.body.player).toMatchObject({ rank: 2, gapToLeader: 0.3 });
    expect(res.body.benchmark).toMatchObject({ carClass: 'LMGT3', target100Sec: 106 });
  });

  it('refuses a board without a layout or a class', async () => {
    const res = await request(app).get('/api/leaderboard?layout=monza_gp');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
    expect((await request(app).get('/api/rivals?carClass=LMGT3')).status).toBe(400);
  });

  describe('rivals', () => {
    const BOARD = { layout: 'monza_gp', carClass: 'LMGT3' };

    it('sets the driver about 0.3 s ahead as the rival, and keeps it on the next visit', async () => {
      const first = await request(app).get('/api/rivals?layout=monza_gp&carClass=LMGT3');
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        rival: { kind: 'driver', driverName: 'Rival', targetTime: 107.7, startTime: 108, status: 'active' },
        rivalEntry: { driverName: 'Rival', rank: 1 },
        gap: 0.3,
        progress: 0,
        beaten: [],
        trend: [{ sessionId: 'r1', best: 108, gap: 0.3 }],
      });
      const again = await request(app).get('/api/rivals?layout=monza_gp&carClass=LMGT3');
      expect(again.body.rival.id).toBe(first.body.rival.id);
    });

    it('moves on to a ghost time when the rival is skipped, and remembers the skip', async () => {
      await request(app).get('/api/rivals?layout=monza_gp&carClass=LMGT3');
      const skipped = await request(app).post('/api/rivals/skip').send(BOARD);
      expect(skipped.status).toBe(200);
      expect(skipped.body.rival).toMatchObject({ kind: 'ghost', driverName: null, targetTime: 107.8 });
      const again = await request(app).get('/api/rivals?layout=monza_gp&carClass=LMGT3');
      expect(again.body.rival.kind).toBe('ghost');
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
