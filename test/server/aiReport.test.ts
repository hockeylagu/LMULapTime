import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeLap, clearSessionApiKey, parseAiJsonContent, setSessionApiKey, setSessionModel } from '../../server/aiReport.js';
import { AiLapEvidence } from '../../server/types.js';

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));
vi.mock('@google/genai', () => ({
  ThinkingLevel: { LOW: 'LOW' },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

const evidence: AiLapEvidence = {
  lap: { replayName: 'primary.Vcr', lapNumber: 5, lapTimeSec: 100, isValid: true },
  baseline: { replayName: 'baseline.Vcr', lapNumber: 5, lapTimeSec: 99 },
  segments: [{ segmentIndex: 1, type: 'corner', cornerNumber: 3, timeDeltaSec: 1, minSpeedDeltaKmh: -5 }],
  consistency: { lapCount: 3, stats: [] },
  trackLimits: { available: false, incidents: [] },
};

const responsePayload = {
  text: JSON.stringify({
    overallSummary: 'One second remains in the lap.',
    improvements: [{ title: 'Corner 3', action: 'Brake 3 m later and keep the car rolling to the apex.', why: 'Minimum speed is 5 km/h lower.', executionCue: 'Use the 100 m board as your reference and release the brake smoothly.', verify: 'Check for at least +3 km/h at minimum speed without losing exit speed.', evidence: ['Minimum speed is 5 km/h lower.'], estimatedGainSec: 0.4 }],
  }),
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
};

describe('Gemini AI adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearSessionApiKey();
    setSessionApiKey('test-key');
    setSessionModel('gemini-3.7-flash');
    generateContentMock.mockReset();
  });

  it('returns a validated structured report and usage', async () => {
    generateContentMock.mockResolvedValue(responsePayload);
    const result = await analyzeLap({ evidence });
    expect(result.report.overallSummary).toContain('second');
    expect(result.tokensUsed?.total).toBe(150);
    expect(generateContentMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.7-flash',
      config: expect.objectContaining({ responseMimeType: 'application/json', responseJsonSchema: expect.any(Object) }),
    }));
  });

  it('accepts only strict JSON content', () => {
    const report = { overallSummary: 'Okay', improvements: [] };
    expect(parseAiJsonContent(JSON.stringify(report))).toEqual(report);
    expect(() => parseAiJsonContent('Here is the report: {"overallSummary":"Okay"}')).toThrow(SyntaxError);
  });

  it('accepts a null optional gain as no gain estimate', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        overallSummary: 'No baseline gain estimate.',
        improvements: [{ title: 'Corner 3', action: 'Repeat the brake marker.', why: 'The entry varied.', executionCue: 'Use the same board next lap.', verify: 'Check the marker remains consistent.', evidence: [], estimatedGainSec: null }],
      }),
    });
    const result = await analyzeLap({ evidence, forceRegenerate: true });
    expect(result.report.improvements[0].estimatedGainSec).toBeUndefined();
  });

  it('reports when Gemini returns no text', async () => {
    generateContentMock.mockResolvedValue({ candidates: [{ finishReason: 'MAX_TOKENS' }] });
    await expect(analyzeLap({ evidence, forceRegenerate: true })).rejects.toMatchObject({
      code: 'malformed_model_response',
      message: expect.stringContaining('finish reason: MAX_TOKENS'),
    });
  });

  it('rejects malformed improvement structure', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ overallSummary: 'Bad', improvements: [{ title: 'Bad', action: 42, why: 'Bad', executionCue: 'Bad', verify: 'Bad', evidence: [] }] }) });
    await expect(analyzeLap({ evidence, forceRegenerate: true })).rejects.toMatchObject({ code: 'malformed_model_response' });
  });

  it('maps a final 503 to upstream_unavailable with provider detail', async () => {
    generateContentMock.mockRejectedValue(new (class extends Error { status = 503; })('model overloaded'));
    await expect(analyzeLap({ evidence, forceRegenerate: true })).rejects.toMatchObject({
      code: 'upstream_unavailable',
      message: expect.stringContaining('model overloaded'),
    });
  });
});
