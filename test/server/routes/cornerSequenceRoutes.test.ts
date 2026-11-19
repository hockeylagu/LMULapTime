import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  refreshSequenceMaps: vi.fn(), refreshLayoutSequencePasses: vi.fn(), queueCornerWork: vi.fn((work: () => Promise<unknown>) => work()),
}));
vi.mock('../../../server/corners/sequenceMapService.js', () => service);
const corners = vi.hoisted(() => ({ layoutCorners: vi.fn() }));
vi.mock('../../../server/corners/sessionCornerPasses.js', () => corners);

import { createCornerSequenceRouter } from '../../../server/routes/cornerSequenceRoutes.js';
import type { ServerContext } from '../../../server/core/serverContext.js';

function app(scanRunning = false) {
  const sessionDb = {
    listSequenceMaps: vi.fn(() => [{ layoutKey: 'spa_gp', carClass: 'GT3' }]),
    getSequenceMap: vi.fn((layoutKey: string) => (layoutKey === 'spa_gp' ? { layoutKey } : null)),
  };
  const context = { sessionDb, getReplayScanStatus: () => ({ running: scanRunning }) } as unknown as ServerContext;
  return express().use(express.json()).use('/api', createCornerSequenceRouter(context));
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
    expect((await request(app()).get('/api/corner-sequences/layout?layoutKey=spa_gp&carClass=GT3')).body).toEqual(body);
    expect(corners.layoutCorners).toHaveBeenCalledWith('spa_gp', 'GT3', expect.any(Function));
    expect((await request(app()).get('/api/corner-sequences/layout?layoutKey=nowhere&carClass=GT3')).status).toBe(404);
    expect((await request(app()).get('/api/corner-sequences/layout?carClass=GT3')).status).toBe(400);
  });

  it('refuses a missing map, a bad request and a regenerate during a replay scan', async () => {
    expect((await request(app()).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'monza_gp', carClass: 'GT3' })).status).toBe(404);
    expect((await request(app()).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp' })).status).toBe(400);
    const busy = await request(app(true)).post('/api/corner-sequences/maps/regenerate').send({ layoutKey: 'spa_gp', carClass: 'GT3' });
    expect(busy.status).toBe(409);
    expect(busy.body).toEqual({ error: 'Wait for the replay scan to finish' });
  });
});
