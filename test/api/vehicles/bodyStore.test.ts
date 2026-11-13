import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedBody } from '../../../src/api/vehicles/bodyApi.js';

const fetchBody = vi.fn<(vehicleId: string, revision: string | undefined, signal: AbortSignal) => Promise<unknown>>();
vi.mock('../../../src/api/vehicles/bodyApi.js', () => ({fetchBody: (...args: unknown[]) => fetchBody(...(args as Parameters<typeof fetchBody>)) as Promise<LoadedBody>}));
const { createBodyStore } = await import('../../../src/api/vehicles/bodyStore.js');

beforeEach(() => {
  fetchBody.mockReset();
  fetchBody.mockImplementation(async (vehicleId: string) => ({vehicleId}));
});

describe('createBodyStore', () => {
  it('fetches each body once per id and package revision, checked against the revision', async () => {
    const store = createBodyStore();
    const [a, again] = await Promise.all([store.body('A', 'r1'), store.body('A', 'r1')]);
    expect(a).toBe(again);
    await store.body('A', 'r2');
    expect(fetchBody.mock.calls.map(([id, revision]) => [id, revision])).toEqual([['A', 'r1'], ['A', 'r2']]);
  });

  it('keeps only the most recently requested bodies past its limit', async () => {
    const store = createBodyStore(2);
    await store.body('A', undefined); await store.body('B', undefined); await store.body('A', undefined); await store.body('C', undefined);
    await store.body('A', undefined); await store.body('B', undefined);
    // A stayed (requested again before C), B left for C and comes back.
    expect(fetchBody.mock.calls.map(([id]) => id)).toEqual(['A', 'B', 'C', 'B']);
  });

  it('forgets a failed fetch, and stops the fetches in flight when disposed', async () => {
    fetchBody.mockRejectedValueOnce(Error('offline'));
    const store = createBodyStore();
    await expect(store.body('A', undefined)).rejects.toThrow('offline');
    await store.body('A', undefined);
    expect(fetchBody).toHaveBeenCalledTimes(2);
    const signal = fetchBody.mock.calls[1][2];
    store.dispose();
    expect(signal.aborted).toBe(true);
  });
});
