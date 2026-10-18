import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lmuGet } from '../../../../server/live/lmuPitRest.js';
import { lmuHttpGet } from '../../../../server/live/lmuHttp.js';

vi.mock('../../../../server/live/lmuHttp.js', () => ({ lmuHttpGet: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('REST transport diagnostic metadata', () => {
  it('retains non-200 statuses and a bounded error body', async () => {
    vi.mocked(lmuHttpGet).mockResolvedValue({ status: 'ok', statusCode: 503, body: 'x'.repeat(9000) });
    const answer = await lmuGet('/test');
    expect(answer).toMatchObject({ ok: false, reason: 'status', diagnostic: {
      outcome: 'http-error', statusCode: 503, bodyTruncated: true,
    } });
    expect(answer.diagnostic?.bodyExcerpt).toHaveLength(8192);
  });

  it('distinguishes malformed JSON from HTTP and transport errors', async () => {
    vi.mocked(lmuHttpGet).mockResolvedValue({ status: 'ok', statusCode: 200, body: '{unfinished' });
    expect(await lmuGet('/test')).toMatchObject({ ok: false, diagnostic: {
      outcome: 'invalid-json', statusCode: 200, bodyExcerpt: '{unfinished', bodyTruncated: false,
    } });
    vi.mocked(lmuHttpGet).mockResolvedValue({ status: 'aborted', diagnostic: {
      statusCode: 200, bodyExcerpt: '{partial', bodyTruncated: false, errorCode: 'ECONNRESET',
    } });
    expect(await lmuGet('/test')).toMatchObject({ ok: false, diagnostic: {
      outcome: 'aborted', bodyExcerpt: '{partial', errorCode: 'ECONNRESET',
    } });
  });

  it('preserves valid bodies and explicitly identifies timeouts', async () => {
    vi.mocked(lmuHttpGet).mockResolvedValue({ status: 'ok', statusCode: 200, body: '{"value":1}' });
    expect(await lmuGet('/test')).toEqual({ ok: true, body: { value: 1 }, diagnostic: { outcome: 'ok', statusCode: 200 } });
    vi.mocked(lmuHttpGet).mockResolvedValue({ status: 'timeout' });
    expect(await lmuGet('/test')).toEqual({ ok: false, reason: 'timeout', diagnostic: { outcome: 'timeout' } });
  });
});
