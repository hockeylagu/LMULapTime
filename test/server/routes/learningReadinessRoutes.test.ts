import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import type { ServerContext } from '../../../server/core/serverContext.js';
import { createLiveRouter } from '../../../server/routes/liveRoutes.js';
import { LiveService } from '../../../server/live/liveService.js';
import { learningReadiness } from '../../../server/live/learning/readiness.js';
import { LearningReadinessError } from '../../../server/live/learning/readinessReader.js';
import type { ReadLearningReadiness } from '../../../server/live/learning/readinessReader.js';

const databases: SessionDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.restoreAllMocks(); });

function setup(read?: ReadLearningReadiness) {
  const db = new SessionDatabase(':memory:'); databases.push(db);
  const context = { sessionDb: db } as unknown as ServerContext;
  const live = new LiveService();
  const reader = vi.fn(read ?? (async () => learningReadiness(db.getDb())));
  const capture = { directory: 'unused', hasOpenRecordingHandle: false,
    status: () => ({ state: 'idle' as const, recordingId: null, samples: 0, droppedSamples: 0, pendingBatches: 0, error: null }) };
  const app = express(); app.use('/api', createLiveRouter(context, live, capture, reader));
  return { app, live, reader, capture };
}

describe('learning readiness status API', () => {
  it('serves only compact status without caching or input knobs', async () => {
    const { app, reader } = setup();
    const response = await request(app).get('/api/live/learning');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ state: 'evaluated', historicalCorrectionsEnabled: false, dataset: { eligible: 0 } });
    expect(response.body).not.toHaveProperty('calibration');
    expect(response.body).not.toHaveProperty('examples');
    expect(reader).toHaveBeenCalledOnce();
    expect((await request(app).get('/api/live/learning?train=1')).status).toBe(400);
  });

  it('defers without starting evaluation while a game session is loaded', async () => {
    const { app, live, reader, capture } = setup(); const loaded = vi.spyOn(live, 'isSessionLoaded').mockReturnValue(true);
    expect((await request(app).get('/api/live/learning')).body.state).toBe('deferred');
    expect(reader).not.toHaveBeenCalled();
    loaded.mockReturnValue(false); capture.hasOpenRecordingHandle = true;
    expect((await request(app).get('/api/live/learning')).body.state).toBe('deferred');
    expect(reader).not.toHaveBeenCalled();
  });

  it('cancels an in-flight check when driving starts and returns a deferred status', async () => {
    let live: LiveService;
    const { app, live: instance, reader } = setup(async (_file, signal) => {
      vi.spyOn(live, 'isSessionLoaded').mockReturnValue(true);
      live.events.emit('session-loaded', true);
      expect(signal.aborted).toBe(true);
      throw new DOMException('Aborted', 'AbortError');
    });
    live = instance;
    const response = await request(app).get('/api/live/learning');
    expect(response.body.state).toBe('deferred'); expect(reader).toHaveBeenCalledOnce();
  });

  it('returns a retryable worker-busy error rather than a success with no evidence', async () => {
    const { app } = setup(async () => { throw new LearningReadinessError(503, 'Check already running.'); });
    const response = await request(app).get('/api/live/learning');
    expect(response.status).toBe(503); expect(response.body.error).toBe('Check already running.');
  });
});
