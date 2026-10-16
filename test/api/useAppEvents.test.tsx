import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppData } from '../../src/api/useAppData.js';
import { FakeEventSource } from '../helpers/fakeEventSource.js';

const idleScan = {
  running: false, processed: 0, total: 0, currentFile: null, startedAt: null, finishedAt: null, result: null, error: null,
  dataRevision: 'server:0', sessionScan: { running: false, startedAt: null, finishedAt: null, result: null, error: null },
  referenceLaptimes: { started: true, running: false, checked: true, completedAt: null, refreshed: false, diff: null, error: null },
};
const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('app event stream', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path).length;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.install();
    fetchMock = vi.fn((url: string) => reply(url === '/api/scan/status' ? idleScan : { sessionsCount: 0 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('restarts the idle scan polling when the server starts a scan, and reloads data when it finishes', async () => {
    const { unmount } = renderHook(() => useAppData());
    await act(async () => {});
    expect(FakeEventSource.instances.map((s) => s.url)).toEqual(['/api/events']);
    const idlePolls = calls('/api/scan/status');
    const idleLoads = calls('/api/status');
    expect(idlePolls).toBe(1);

    await act(async () => { FakeEventSource.byUrl('/api/events').emit('scan-started', { at: 1 }); });
    expect(calls('/api/scan/status')).toBe(idlePolls + 1);
    expect(calls('/api/status')).toBe(idleLoads);

    await act(async () => { FakeEventSource.byUrl('/api/events').emit('scan-finished', { at: 2 }); });
    expect(calls('/api/scan/status')).toBe(idlePolls + 2);
    expect(calls('/api/status')).toBe(idleLoads + 1);

    unmount();
    expect(FakeEventSource.byUrl('/api/events').closed).toBe(true);
  });
});
