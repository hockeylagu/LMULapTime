import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBatch } from '../../../helpers/liveCaptureBatch.js';
import type { LiveCaptureBatch } from '../../../../shared/types/liveCapture.js';

const harness = vi.hoisted(() => ({
  listener: (_message: unknown): void => {},
  hasPort: true,
  data: { directory: 'test-captures' } as { directory?: unknown },
  post: vi.fn<(message: unknown) => void>(),
  disconnect: vi.fn(),
  write: vi.fn<(batch: LiveCaptureBatch) => Promise<{ manifest: LiveCaptureBatch['manifest']; bytes: number }>>(),
  link: vi.fn<() => Promise<void>>(),
  catalog: vi.fn<() => Promise<{ recordings: []; errors: [] }>>(),
  close: vi.fn<() => Promise<void>>(),
}));

vi.mock('node:worker_threads', async importOriginal => ({
  ...await importOriginal<typeof import('node:worker_threads')>(),
  get parentPort() {
    return harness.hasPort ? {
      on: (_event: string, listener: (message: unknown) => void) => { harness.listener = listener; },
      postMessage: harness.post,
      close: harness.disconnect,
    } : null;
  },
  get workerData() { return harness.data; },
}));
vi.mock('../../../../server/live/capture/recordingStore.js', () => ({
  LiveCaptureRecordingStore: class {
    write = harness.write;
    link = harness.link;
    catalog = harness.catalog;
    close = harness.close;
  },
}));

const start = () => import('../../../../server/live/capture/recordingWorker.js');
const finish = async () => {
  harness.listener({ type: 'close' });
  await vi.waitFor(() => expect(harness.disconnect).toHaveBeenCalledOnce());
};
const linkMessage = () => {
  const { filename, recordingId } = makeBatch().manifest;
  return { type: 'link', filename, recordingId, sessionId: 'xml-session', gameVersion: '2.0' };
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  harness.hasPort = true;
  harness.data = { directory: 'test-captures' };
  harness.write.mockImplementation(async batch => ({ manifest: batch.manifest, bytes: 100 }));
  harness.link.mockResolvedValue();
  harness.catalog.mockResolvedValue({ recordings: [], errors: [] });
  harness.close.mockResolvedValue();
});

describe('recording worker in process', () => {
  it('ignores loader messages and serializes writes, links, catalog and close', async () => {
    await start();
    harness.listener(null);
    harness.listener({ 'watch:import': ['loader.mjs'] });
    harness.listener({ type: 'unknown' });
    const batch = makeBatch();
    harness.listener(batch);
    harness.listener(linkMessage());
    harness.listener({ type: 'catalog' });
    await finish();
    expect(harness.write).toHaveBeenCalledExactlyOnceWith(batch);
    expect(harness.link).toHaveBeenCalledExactlyOnceWith(batch.manifest.filename, batch.manifest.recordingId, 'xml-session', '2.0');
    expect(harness.post.mock.calls.map(([message]) => message)).toEqual([
      { type: 'persisted', sequence: 0, manifest: batch.manifest, bytes: 100 },
      { type: 'linked', recordingId: batch.manifest.recordingId },
      { type: 'catalogued', recordings: [], errors: [] }, { type: 'closed' },
    ]);
  });

  it('bounds batches at six, preserves accepted work and reopens capacity after completion', async () => {
    let release = (_result: { manifest: LiveCaptureBatch['manifest']; bytes: number }): void => {};
    const blocked = new Promise<{ manifest: LiveCaptureBatch['manifest']; bytes: number }>(resolve => { release = resolve; });
    harness.write.mockReturnValueOnce(blocked);
    await start();
    for (let sequence = 0; sequence < 7; sequence++) harness.listener(makeBatch(sequence));
    expect(harness.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed', sequence: 6, error: 'Live capture worker queue is full (limit 6)' }));
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalledTimes(1));
    release({ manifest: makeBatch().manifest, bytes: 100 });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalledTimes(6));
    harness.listener(makeBatch(7));
    await finish();
    expect(harness.write.mock.calls.map(([batch]) => batch.sequence)).toEqual([0, 1, 2, 3, 4, 5, 7]);
  });

  it.each(['link', 'catalog'] as const)('shares the two control slots and restores them after a %s failure', async operation => {
    if (operation === 'link') harness.link.mockRejectedValueOnce(new Error('link failed'));
    else harness.catalog.mockRejectedValueOnce('catalog failed');
    await start();
    harness.listener(operation === 'link' ? linkMessage() : { type: 'catalog' });
    harness.listener({ type: 'catalog' });
    harness.listener(linkMessage());
    expect(harness.post).toHaveBeenCalledWith(expect.objectContaining({ operation: 'link', error: 'Live capture worker control queue is full (limit 2)' }));
    await vi.waitFor(() => expect(harness.post).toHaveBeenCalledWith(expect.objectContaining({ operation, error: `${operation} failed` })));
    harness.listener(linkMessage());
    await finish();
    expect(harness.post).toHaveBeenCalledWith({ type: 'linked', recordingId: makeBatch().manifest.recordingId });
  });

  it('reports write failures with their sequence and keeps processing the queue', async () => {
    harness.write.mockRejectedValueOnce(new Error('disk full'));
    await start();
    harness.listener(makeBatch(0));
    harness.listener(makeBatch(1));
    await finish();
    expect(harness.post).toHaveBeenCalledWith({ type: 'failed', operation: 'batch', sequence: 0,
      recordingId: makeBatch().manifest.recordingId, error: 'disk full' });
    expect(harness.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'persisted', sequence: 1 }));
  });

  it('rejects new operations after close and closes the port even when the store fails to close', async () => {
    harness.close.mockRejectedValueOnce(new Error('checkpoint failed'));
    await start();
    harness.listener({ type: 'close' });
    harness.listener({ type: 'close' });
    harness.listener(makeBatch());
    harness.listener(linkMessage());
    harness.listener({ type: 'catalog' });
    await vi.waitFor(() => expect(harness.disconnect).toHaveBeenCalledOnce());
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.post).toHaveBeenCalledWith({ type: 'failed', error: 'checkpoint failed' });
    for (const operation of ['batch', 'link', 'catalog']) {
      expect(harness.post).toHaveBeenCalledWith(expect.objectContaining({ operation, error: 'Live capture recording worker is closing' }));
    }
    expect(harness.write).not.toHaveBeenCalled();
    expect(harness.link).not.toHaveBeenCalled();
    expect(harness.catalog).not.toHaveBeenCalled();
  });

  it('requires a parent port and a recording directory', async () => {
    harness.hasPort = false;
    await expect(start()).rejects.toThrow('requires a parent port');
    vi.resetModules();
    harness.hasPort = true;
    harness.data = { directory: '' };
    await expect(start()).rejects.toThrow('requires a recording directory');
  });
});
