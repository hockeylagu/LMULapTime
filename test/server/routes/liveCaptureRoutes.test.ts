import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ServerContext } from '../../../server/core/serverContext.js';
import { TypedEmitter } from '../../../server/core/typedEmitter.js';
import { LiveService } from '../../../server/live/liveService.js';
import { createLiveRouter } from '../../../server/routes/liveRoutes.js';
import { LIVE_CAPTURE_CHANNELS } from '../../../server/live/capture/channels.js';
import { LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SCHEMA_VERSION } from '../../../shared/types/liveCapture.js';
import type { LiveCaptureStatus } from '../../../shared/types/liveCapture.js';

function makeApp(status: LiveCaptureStatus, statusRead = vi.fn(() => status)) {
  const sessionDb = { getMetadata: vi.fn(() => null), setMetadata: vi.fn() };
  const context = {
    events: new TypedEmitter<{ 'scan-started': []; 'scan-finished': [] }>(),
    sessionDb,
  } as unknown as ServerContext;
  const live = new LiveService();
  const capture = { directory: 'D:/LMU/live-captures', status: statusRead };
  const app = express();
  app.use('/api', createLiveRouter(context, live, capture));
  return { app, capture, context, sessionDb, statusRead };
}

describe('live capture status route', () => {
  it('returns schema metadata, channel availability, directory and unavailable quality counts without mutation', async () => {
    const status: LiveCaptureStatus = {
      state: 'unavailable', recordingId: null, samples: 14, droppedSamples: 3, pendingBatches: 0, error: 'writer disk full',
    };
    const statusRead = vi.fn(() => status);
    const { app, sessionDb } = makeApp(status, statusRead);
    const response = await request(app).get('/api/live/capture');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      source: 'live-capture', schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
      normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION, directory: 'D:/LMU/live-captures',
      ...status, channels: LIVE_CAPTURE_CHANNELS,
    });
    expect(statusRead).toHaveBeenCalledOnce();
    expect(sessionDb.setMetadata).not.toHaveBeenCalled();
  });

  it('provides an idle response when capture support is omitted', async () => {
    const context = {
      events: new TypedEmitter<{ 'scan-started': []; 'scan-finished': [] }>(),
      sessionDb: { getMetadata: vi.fn(() => null), setMetadata: vi.fn() },
    } as unknown as ServerContext;
    const app = express();
    app.use('/api', createLiveRouter(context, new LiveService()));

    const response = await request(app).get('/api/live/capture');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ source: 'live-capture', directory: null, state: 'idle',
      recordingId: null, samples: 0, droppedSamples: 0, pendingBatches: 0, error: null,
      channels: LIVE_CAPTURE_CHANNELS });
  });
});
