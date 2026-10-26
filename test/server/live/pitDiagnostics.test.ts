import { afterEach, describe, expect, it, vi } from 'vitest';
import { LivePitPoller } from '../../../server/live/livePitPoller.js';
import type { DiagnosticEvent } from '../../../server/live/capture/diagnostics.js';
import type { RestAnswer } from '../../../server/live/lmuPitRest.js';

afterEach(() => vi.useRealTimers());

describe('REST diagnostic integration', () => {
  it('records stale requests before discarding them, using the sink bound at request start', async () => {
    vi.useFakeTimers();
    const first: DiagnosticEvent[] = [];
    const second: DiagnosticEvent[] = [];
    let current = first;
    let finish: ((answer: RestAnswer) => void) | undefined;
    const onUpdate = vi.fn();
    const poller = new LivePitPoller({
      get: () => new Promise(resolve => { finish = resolve; }),
      diagnosticSink: () => { const target = current; return event => target.push(event); },
      onUpdate, onReplay: vi.fn(),
    });
    poller.setMode('track', 'first');
    current = second;
    poller.setMode('garage', 'second');
    finish?.({ ok: false, reason: 'status', diagnostic: { outcome: 'http-error', statusCode: 503, bodyExcerpt: 'loading' } });
    await Promise.resolve();
    expect(first).toHaveLength(1);
    expect(first[0].data).toMatchObject({ sessionKey: 'first', disposition: 'stale-discarded', statusCode: 503, bodyExcerpt: 'loading' });
    expect(second).toHaveLength(0);
    expect(onUpdate).not.toHaveBeenCalled();
    poller.stop();
  });

  it('hands failed reads to the recording as failure evidence', async () => {
    vi.useFakeTimers();
    const evidence: unknown[] = [];
    const poller = new LivePitPoller({ get: async () => ({ ok: false, reason: 'timeout', diagnostic: { outcome: 'timeout' } }),
      onEvidence: observation => evidence.push(observation), onUpdate: vi.fn(), onReplay: vi.fn() });
    poller.setMode('track');
    await vi.advanceTimersByTimeAsync(10);
    expect(evidence[0]).toMatchObject({ source: 'rest', kind: 'failure', data: { path: '/navigation/state', outcome: 'timeout' } });
    poller.stop();
  });
});
