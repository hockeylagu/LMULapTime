import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  refreshSequenceMaps: vi.fn(), refreshLayoutSequencePasses: vi.fn(), queueCornerWork: vi.fn((work: () => Promise<unknown>) => work()),
}));
vi.mock('../../../server/corners/sequenceMapService.js', () => service);
const corners = vi.hoisted(() => ({ layoutCorners: vi.fn() }));
vi.mock('../../../server/corners/sessionCornerPasses.js', () => corners);
const trends = vi.hoisted(() => ({ readCornerTrends: vi.fn() }));
vi.mock('../../../server/corners/cornerTrends.js', () => trends);
const analysis = vi.hoisted(() => ({ readSessionCornerAnalysis: vi.fn(), readCornerHabitTrends: vi.fn(), pinnedCornerTurns: vi.fn() }));
vi.mock('../../../server/corners/cornerAnalysisService.js', () => analysis);

import { benchmarkTargetSec } from '../../../server/benchmarks/referenceLaptimes.js';
import { createCornerRouter } from '../../../server/routes/cornerRoutes.js';
import type { ServerContext } from '../../../server/core/serverContext.js';

const pins = { addHabitFocusPin: vi.fn(), removeHabitFocusPins: vi.fn() };

function app(scanRunning = false, summariesReady = true) {
  const sessionDb = {
    ...pins,
    isSessionSummaryReady: () => summariesReady,
    getSessionCatalogStats: () => ({ sessions: 3 }),
    listSequenceMaps: vi.fn(() => [{ layoutKey: 'spa_gp', carClass: 'GT3' }]),
    getSequenceMap: vi.fn((layoutKey: string) => (layoutKey === 'spa_gp' ? { layoutKey } : null)),
  };
  const context = { sessionDb, getReplayScanStatus: () => ({ running: scanRunning }) } as unknown as ServerContext;
  return express().use(express.json()).use('/api', createCornerRouter(context));
}

const regeneratingOf = (response: { body: unknown }) => (response.body as { regenerating: string | null }).regenerating;

describe('corner sequence routes', () => {
  it('lists the maps and regenerates one in the background, one at a time', async () => {
    let finish = () => {};
    service.refreshSequenceMaps.mockReturnValue(new Promise<string[]>(resolve => { finish = () => resolve(['GT3']); }));
    service.refreshLayoutSequencePasses.mockResolvedValue(undefined);
    const server = app();
    expect((await request(server).get('/api/corner-sequences/maps')).body).toEqual({ maps: [{ layoutKey: 'spa_gp', carClass: 'GT3' }], regenerating: null, failed: null });

    const started = await request(server).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' });
    expect(started.status).toBe(202);
    expect(service.refreshSequenceMaps).toHaveBeenCalledWith(expect.anything(), 'spa_gp', ['GT3'], { remap: true });
    expect(regeneratingOf(await request(server).get('/api/corner-sequences/maps'))).toBe('spa_gp|GT3');
    expect((await request(server).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' })).status).toBe(409);

    finish();
    await vi.waitFor(async () => expect(regeneratingOf(await request(server).get('/api/corner-sequences/maps'))).toBeNull());
    expect(service.refreshLayoutSequencePasses).toHaveBeenCalledWith(expect.anything(), 'spa_gp');
  });

  it('says which map failed to regenerate and why, until the next one starts', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.refreshSequenceMaps.mockRejectedValueOnce(new Error('a lap is no longer stored'));
    const server = app();
    await request(server).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' });
    const failedOf = async () => (await request(server).get('/api/corner-sequences/maps')).body as { failed: unknown };
    await vi.waitFor(async () => expect((await failedOf()).failed).toEqual({ map: 'spa_gp|GT3', error: 'a lap is no longer stored' }));
    expect(logged).toHaveBeenCalled();
    service.refreshSequenceMaps.mockResolvedValueOnce([]);
    await request(server).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' });
    expect((await failedOf()).failed).toBeNull();
    logged.mockRestore();
  });

  it("serves a layout's corners for a class, from its stored map", async () => {
    const body = { kind: 'sequences', startStationM: 10, lengthM: 4000, corners: [] };
    corners.layoutCorners.mockImplementation((layoutKey: string, _carClass: string, getMap: (l: string, c: string) => unknown) => (layoutKey === 'spa_gp' && getMap(layoutKey, 'GT3') ? body : null));
    expect((await request(app()).get('/api/corners?layoutKey=spa_gp&carClass=GT3')).body).toEqual(body);
    expect(corners.layoutCorners).toHaveBeenCalledWith('spa_gp', 'GT3', expect.any(Function));
    expect((await request(app()).get('/api/corners?layoutKey=nowhere&carClass=GT3')).status).toBe(404);
    expect((await request(app()).get('/api/corners?carClass=GT3')).status).toBe(400);
  });

  it("serves a layout's corner trends, behind the summary readiness gate", async () => {
    const body = { corners: [{ id: 1, habit: null }, { id: 2, habit: null }], sessions: { total: 0, noReplay: 0, waiting: 0, tooFewPasses: 0 } };
    trends.readCornerTrends.mockImplementation((_db: unknown, layoutKey: string) => (layoutKey === 'spa_gp' ? body : null));
    // Each corner's habit and focus over the latest sessions, from the corner analysis; its target is the trends' reference.
    const target = { sessionId: 's9', driverOrdinal: 3 };
    analysis.readCornerHabitTrends.mockReturnValue({ habits: new Map([[2, { focus: 'pinned' }]]), target });
    expect((await request(app()).get('/api/corner-trends?layoutKey=spa_gp&carClass=GT3&carType=Car%20A')).body)
      .toEqual({ ...body, corners: [{ id: 1, habit: null }, { id: 2, habit: { focus: 'pinned' } }] });
    expect(analysis.readCornerHabitTrends).toHaveBeenCalledWith(expect.anything(), 'spa_gp', 'GT3', 'car a');
    expect(trends.readCornerTrends).toHaveBeenCalledWith(expect.anything(), 'spa_gp', 'GT3', 'Car A', undefined, target);
    expect((await request(app()).get('/api/corner-trends?layoutKey=nowhere&carClass=GT3')).status).toBe(404);
    expect((await request(app()).get('/api/corner-trends?layoutKey=spa_gp')).status).toBe(400);
    expect((await request(app(false, false)).get('/api/corner-trends?layoutKey=spa_gp&carClass=GT3')).status).toBe(503);
  });

  it("serves a session's corner analysis, behind the summary readiness gate", async () => {
    const body = { sessionId: 's1', layoutKey: 'spa_gp', carClass: 'GT3', driverOrdinal: 0, laps: 8, corners: [], habits: [], mistakes: [] };
    analysis.readSessionCornerAnalysis.mockImplementation((_db: unknown, sessionId: string) => (sessionId === 's1' ? body : null));
    expect((await request(app()).get('/api/session/s1/corner-analysis')).body).toEqual(body);
    // The goal is measured against the app's Reference Benchmarks.
    expect(analysis.readSessionCornerAnalysis).toHaveBeenCalledWith(expect.anything(), 's1', benchmarkTargetSec);
    expect((await request(app()).get('/api/session/s2/corner-analysis')).status).toBe(404);
    expect((await request(app(false, false)).get('/api/session/s1/corner-analysis')).status).toBe(503);
  });

  it("pins a corner by its first turn, refuses a third pin and unpins whatever turn it was pinned by", async () => {
    const pin = { layoutKey: 'spa_gp', carClass: 'GT3', turnId: 6 };
    // Turn 6 sits in a corner of turns 5 and 6, with one other corner pinned.
    analysis.pinnedCornerTurns.mockReturnValue({ cornerTurnIds: [5, 6], pinnedHere: [], pinnedCorners: 1 });
    expect((await request(app()).post('/api/habit-focus/pin').send(pin)).body).toEqual({ pinned: true });
    expect(analysis.pinnedCornerTurns).toHaveBeenCalledWith(expect.anything(), pin, 6);
    expect(pins.addHabitFocusPin).toHaveBeenCalledWith({ ...pin, turnId: 5 }, expect.any(Number));

    pins.addHabitFocusPin.mockClear();
    analysis.pinnedCornerTurns.mockReturnValue({ cornerTurnIds: [5, 6], pinnedHere: [], pinnedCorners: 2 });
    const third = await request(app()).post('/api/habit-focus/pin').send(pin);
    expect(third.status).toBe(409);
    expect(third.body).toEqual({ error: 'Unpin one first' });
    // Already pinned: nothing to store, and never refused.
    analysis.pinnedCornerTurns.mockReturnValue({ cornerTurnIds: [5, 6], pinnedHere: [5], pinnedCorners: 2 });
    expect((await request(app()).post('/api/habit-focus/pin').send(pin)).body).toEqual({ pinned: true });
    expect(pins.addHabitFocusPin).not.toHaveBeenCalled();

    expect((await request(app()).post('/api/habit-focus/unpin').send(pin)).body).toEqual({ pinned: false });
    expect(pins.removeHabitFocusPins).toHaveBeenCalledWith(pin, [5]);

    analysis.pinnedCornerTurns.mockReturnValue(null);
    for (const route of ['pin', 'unpin']) {
      expect((await request(app()).post(`/api/habit-focus/${route}`).send(pin)).status).toBe(404);
      for (const bad of [{ ...pin, turnId: 1.5 }, { ...pin, layoutKey: undefined }, { ...pin, carClass: 3 }]) {
        expect((await request(app()).post(`/api/habit-focus/${route}`).send(bad)).status).toBe(400);
      }
    }
  });

  it('refuses a missing map, a bad request and a regenerate during a replay scan', async () => {
    expect((await request(app()).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'monza_gp', carClass: 'GT3' })).status).toBe(404);
    expect((await request(app()).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp' })).status).toBe(400);
    const busy = await request(app(true)).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' });
    expect(busy.status).toBe(409);
    expect(busy.body).toEqual({ error: 'Wait for the replay scan to finish' });
  });
});
