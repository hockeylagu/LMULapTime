import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../../../server/core/serverContext.js';
import { createSystemRouter } from '../../../server/routes/systemRoutes.js';
import { readBrowserSettings, saveBrowserMonitor } from '../../../server/desktop/browserSettings.js';

vi.mock('../../../server/desktop/browserSettings.js', () => ({ readBrowserSettings: vi.fn(), saveBrowserMonitor: vi.fn() }));
const display = '\\\\.\\DISPLAY2';
const settings = { supported: true, monitor: '', monitors: [{ id: display, width: 2560, height: 1440, primary: false }] };

describe('desktop browser routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createSystemRouter({} as ServerContext));
  beforeEach(() => {
    vi.mocked(readBrowserSettings).mockReset().mockResolvedValue(settings);
    vi.mocked(saveBrowserMonitor).mockReset().mockResolvedValue(undefined);
  });

  it('reads the current preference and connected monitors', async () => {
    const response = await request(app).get('/api/desktop/browser');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(settings);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([display, ''])('saves monitor %s', async monitor => {
    const response = await request(app).post('/api/desktop/browser').send({ monitor });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('monitor', monitor);
    expect(saveBrowserMonitor).toHaveBeenCalledWith(monitor);
  });

  it.each([{}, { monitor: 2 }, { monitor: 'unknown' }])('rejects invalid preference %j', async body => {
    expect((await request(app).post('/api/desktop/browser').send(body)).status).toBe(400);
    expect(saveBrowserMonitor).not.toHaveBeenCalled();
  });

  it('reports helper failures without exposing internal process details', async () => {
    vi.mocked(readBrowserSettings).mockRejectedValue(new Error('private helper path'));
    const response = await request(app).get('/api/desktop/browser');
    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('error', expect.stringContaining('Rebuild the tray helper'));
    expect(response.body).not.toHaveProperty('error', expect.stringContaining('private'));
  });
});
