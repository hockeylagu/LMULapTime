import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiRouter } from '../../../server/routes/aiRoutes.js';
import { SessionDatabase } from '../../../server/core/db.js';
import * as aiReport from '../../../server/ai/aiReport.js';
import { AiAnalyzeResponse, AiLapEvidence } from '../../../server/core/types.js';

const evidence: AiLapEvidence = {
  lap: { replayName: 'Route_Test_P1.Vcr', lapNumber: 2, lapTimeSec: 100 },
  baseline: { replayName: 'Baseline_P1.Vcr', lapNumber: 2, lapTimeSec: 101 },
  segments: [],
};

const generatedResponse: AiAnalyzeResponse = {
  report: { overallSummary: 'A measured lap review.', improvements: [] },
  cached: false,
  modelUsed: 'gemini-3.7-flash',
  generatedAt: '2026-09-14T00:00:00.000Z',
};

describe('AI routes', () => {
  let db: SessionDatabase;
  let app: express.Express;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    app = express();
    app.use(express.json());
    app.use('/api/ai', createAiRouter(db));
    aiReport.clearSessionApiKey();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    aiReport.clearSessionApiKey();
    delete process.env.GEMINI_API_KEY;
    db.close();
    vi.restoreAllMocks();
  });

  it('reads and updates settings while validating input', async () => {
    const initial = await request(app).get('/api/ai/settings');
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ configured: false, keySource: null });

    const invalidModel = await request(app).post('/api/ai/settings').send({ model: 'invalid' });
    expect(invalidModel.status).toBe(400);
    expect(invalidModel.body.errorCode).toBe('invalid_model');

    const invalidKey = await request(app).post('/api/ai/settings').send({ apiKey: 42 });
    expect(invalidKey.status).toBe(400);
    expect(invalidKey.body.errorCode).toBe('invalid_request');

    const configured = await request(app).post('/api/ai/settings').send({ apiKey: 'session-key', model: 'gemini-3.8-flash' });
    expect(configured.status).toBe(200);
    expect(configured.body).toMatchObject({ configured: true, keySource: 'session', model: 'gemini-3.8-flash' });

    const cleared = await request(app).post('/api/ai/settings').send({ apiKey: '' });
    expect(cleared.body).toMatchObject({ configured: false, keySource: null });
  });

  it('rejects missing, oversized, and unconfigured analysis requests', async () => {
    const missing = await request(app).post('/api/ai/analyze-lap').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.errorCode).toBe('invalid_request');

    const oversized = await request(app).post('/api/ai/analyze-lap').send({ evidence: 'x'.repeat(64 * 1024 + 1) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.errorCode).toBe('payload_too_large');

    const unconfigured = await request(app).post('/api/ai/analyze-lap').send({ evidence });
    expect(unconfigured.status).toBe(400);
    expect(unconfigured.body.errorCode).toBe('not_configured');
  });

  it('returns cached reports and saves generated reports', async () => {
    aiReport.setSessionApiKey('session-key');
    const analyze = vi.spyOn(aiReport, 'analyzeLap').mockResolvedValue(generatedResponse);

    const generated = await request(app).post('/api/ai/analyze-lap').send({ evidence });
    expect(generated.status).toBe(200);
    expect(generated.body).toMatchObject({ cached: false, report: generatedResponse.report });
    expect(analyze).toHaveBeenCalledTimes(1);

    const cached = await request(app).post('/api/ai/analyze-lap').send({ evidence });
    expect(cached.status).toBe(200);
    expect(cached.body.cached).toBe(true);
    expect(cached.body.tokensUsed).toBeUndefined();
    expect(analyze).toHaveBeenCalledTimes(1);

    const forced = await request(app).post('/api/ai/analyze-lap').send({ evidence, forceRegenerate: true });
    expect(forced.status).toBe(200);
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['invalid_key', 401],
    ['rate_limited', 429],
    ['upstream_unavailable', 503],
    ['upstream_error', 502],
  ] as const)('maps %s analysis failures to HTTP %i', async (code, status) => {
    aiReport.setSessionApiKey('session-key');
    vi.spyOn(aiReport, 'analyzeLap').mockRejectedValue(Object.assign(new Error('provider failure'), { code }));

    const response = await request(app).post('/api/ai/analyze-lap').send({ evidence, forceRegenerate: true });
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ errorCode: code, requestId: expect.any(String) });
  });

  it('logs raw model response when malformed_model_response includes rawResponse', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    aiReport.setSessionApiKey('session-key');
    vi.spyOn(aiReport, 'analyzeLap').mockRejectedValue(
      Object.assign(new Error('SyntaxError: Unterminated string in JSON'), {
        code: 'malformed_model_response',
        rawResponse: '{"incomplete": true',
      })
    );
    const response = await request(app).post('/api/ai/analyze-lap').send({ evidence, forceRegenerate: true });
    expect(response.status).toBe(502);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Raw invalid AI response (19 chars)'));
    consoleWarnSpy.mockRestore();
  });

  it('returns report history and maps database failures', async () => {
    const history = await request(app).get('/api/ai/reports?limit=5');
    expect(history.status).toBe(200);
    expect(history.body).toEqual([]);

    vi.spyOn(db, 'getAiReportsList').mockImplementation(() => { throw new Error('database unavailable'); });
    const failed = await request(app).get('/api/ai/reports');
    expect(failed.status).toBe(500);
    expect(failed.body.error).toBe('database unavailable');
  });
});
