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
import { DetailedSession } from '../../../server/core/types.js';
import { driver, lap, session } from '../../domain/leaderboardFixtures.js';

describe('leaderboardRoutes', () => {
  const sessions: DetailedSession[] = [
    session('r1', [driver('Me', [lap(2, 108)], { isPlayer: true }), driver('Rival', [lap(2, 107.7)])]),
  ];
  const loadSessions = vi.fn(() => sessions);
  const app = express();
  app.use('/api', createLeaderboardRouter({ loadSessions } as unknown as ServerContext));

  beforeEach(() => {
    loadSessions.mockClear();
    referenceCache.load.mockReturnValue({
      entries: { Monza_LMGT3: { key: 'Monza_LMGT3', trackName: 'Monza', carClass: 'LMGT3', target100Sec: 106 } },
    });
  });

  it('lists the layouts the player drove, the same on every call', async () => {
    const first = await request(app).get('/api/leaderboard/layouts');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject([{ layoutKey: 'monza_gp', lastCarClass: 'LMGT3', classes: [{ playerRank: 2, fieldSize: 2 }] }]);
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
  });
});
