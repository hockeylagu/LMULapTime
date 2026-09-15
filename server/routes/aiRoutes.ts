import { Router } from 'express';
import {
  AI_MODELS,
  analyzeLap,
  clearSessionApiKey,
  createAiReportRecord,
  getAiCacheKey,
  getAiSettings,
  setSessionApiKey,
  setSessionModel,
  toAiError,
} from '../ai/aiReport.js';
import { SessionDatabase } from '../core/db.js';
import { AiAnalyzeRequest, AiAnalyzeResponse } from '../core/types.js';

export function createAiRouter(sessionDb: SessionDatabase): Router {
  const router = Router();

  router.get('/settings', (_req, res) => {
    res.json(getAiSettings());
  });

  router.post('/settings', (req, res) => {
    const { apiKey, model } = req.body as { apiKey?: unknown; model?: unknown };
    if (model !== undefined && (typeof model !== 'string' || !AI_MODELS.includes(model as typeof AI_MODELS[number]))) {
      return res.status(400).json({ error: 'Only the configured Gemini POC model is supported.', errorCode: 'invalid_model' });
    }
    if (apiKey !== undefined && typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'The Gemini API key must be a string.', errorCode: 'invalid_request' });
    }
    if (apiKey === '') clearSessionApiKey();
    else if (typeof apiKey === 'string') setSessionApiKey(apiKey);
    if (typeof model === 'string') setSessionModel(model);
    return res.json(getAiSettings());
  });

  router.post('/analyze-lap', async (req, res) => {
    const requestId = Math.random().toString(36).slice(2, 10);
    const body = req.body as AiAnalyzeRequest;
    if (!body || typeof body !== 'object' || !body.evidence) {
      return res.status(400).json({ error: 'Lap evidence is required.', errorCode: 'invalid_request' });
    }
    const serializedSize = Buffer.byteLength(JSON.stringify(body.evidence), 'utf8');
    if (serializedSize > 64 * 1024) {
      return res.status(413).json({ error: 'Lap evidence is too large.', errorCode: 'payload_too_large' });
    }
    const settings = getAiSettings();
    if (!settings.configured) {
      return res.status(400).json({ error: 'Configure a Gemini API key before generating a report.', errorCode: 'not_configured' });
    }
    const cacheKey = getAiCacheKey(body.evidence);
    if (!body.forceRegenerate) {
      const cached = sessionDb.getAiReport(cacheKey);
      if (cached) {
        const response: AiAnalyzeResponse = {
          report: cached.report,
          cached: true,
          modelUsed: cached.model,
          generatedAt: new Date(cached.generatedAt).toISOString(),
          tokensUsed: cached.totalTokens == null ? undefined : {
            prompt: cached.promptTokens ?? 0,
            completion: cached.completionTokens ?? 0,
            total: cached.totalTokens,
          },
        };
        return res.json(response);
      }
    }
    try {
      const result = await analyzeLap(body);
      sessionDb.saveAiReport(createAiReportRecord(body.evidence, result));
      return res.json(result);
    } catch (cause) {
      const mapped = toAiError(cause);
      const status = mapped.code === 'invalid_key' ? 401 : mapped.code === 'rate_limited' ? 429 : mapped.code === 'payload_too_large' ? 413 : mapped.code === 'invalid_request' || mapped.code === 'not_configured' || mapped.code === 'invalid_model' ? 400 : mapped.code === 'upstream_unavailable' ? 503 : 502;
      console.warn(`[AI ${requestId}] ${mapped.code}: ${mapped.message}`);
      return res.status(status).json({ error: mapped.message, errorCode: mapped.code, requestId });
    }
  });

  router.get('/reports', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      res.json(sessionDb.getAiReportsList(limit));
    } catch (err: unknown) {
      console.error('Failed to list AI report history:', err);
      const message = err instanceof Error ? err.message : 'Failed to list AI report history';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
