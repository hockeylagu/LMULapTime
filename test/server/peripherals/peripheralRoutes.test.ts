import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createPeripheralRouter } from '../../../server/routes/peripherals/peripheralRoutes.js';
import { setup, snapshot } from './fixtures.js';

describe('peripheral API', () => {
  it('validates settings, devices and mappings and refuses on-track Apply', async () => {
    const fixture = await setup(snapshot('driving'));
    const app = express();
    app.use(express.json());
    app.use('/api/peripherals', createPeripheralRouter(fixture.host));
    try {
      expect((await request(app).get('/api/peripherals')).body).toHaveLength(1);
      const loaded = await request(app).get('/api/peripherals/simagic/loaded-presets');
      expect(loaded.status).toBe(200);
      expect(loaded.body).toHaveProperty('devices', expect.objectContaining({ length: 1 }));
      expect((await request(app).put('/api/peripherals/simagic/settings').send({ enabled: true })).status).toBe(400);
      expect((await request(app).get('/api/peripherals/other/devices')).status).toBe(404);
      expect((await request(app).put('/api/peripherals/simagic/mappings').send([{ scopeKind: 'model', scopeKey: 'Not a car', presetUuid: '1' }])).status).toBe(400);
      expect((await request(app).post('/api/peripherals/simagic/apply').send({ model: 'Ferrari 296 LMGT3' })).status).toBe(409);
      expect((await request(app).post('/api/peripherals/simagic/mappings/suggest').send({ overwrite: false })).status).toBe(200);
      expect(fixture.plugin.selectPreset).not.toHaveBeenCalled();
      await fixture.host.configure({ enabled: false, automatic: true, wheel: null });
      expect((await request(app).get('/api/peripherals/simagic/presets')).status).toBe(409);
      expect((await request(app).get('/api/peripherals')).status).toBe(200);
    } finally { fixture.close(); }
  });
});
