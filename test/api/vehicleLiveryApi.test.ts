// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchVehicleLivery } from '../../src/api/vehicleLiveryApi.js';
import type { VehicleLiveryResource } from '../../shared/types/scenes/vehicleLivery.js';

afterEach(() => vi.restoreAllMocks());

const metadata: VehicleLiveryResource = {
  liveryKey: 'test_livery',
  vehicleRecordId: 'rec_1',
  vehicleIds: ['car_1'],
  revision: 'livery-1234',
  sha256: '1234',
  width: 2048,
  height: 2048,
  byteLength: 16,
  packageRevision: 'pkg-1',
};

beforeEach(() => {
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 2048;
    naturalHeight = 2048;
    async decode() {}
  });
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

it('fetches livery metadata and asset binary', async () => {
  const bytes = new Uint8Array(16);
  const network = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(metadata))
    .mockResolvedValueOnce(new Response(bytes));

  const result = await fetchVehicleLivery('test_livery', 'pkg-1', new AbortController().signal);
  expect(result?.metadata.liveryKey).toBe('test_livery');
  expect(result?.image.naturalWidth).toBe(2048);
  expect(network).toHaveBeenCalledTimes(2);
  expect(network.mock.calls[1][0]).toBe('/api/data-plugin/vehicle-liveries/test_livery/livery-1234/asset');
});

it('returns null for a 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 404 }));
  const result = await fetchVehicleLivery('unknown', 'pkg-1', new AbortController().signal);
  expect(result).toBeNull();
});

it('rejects mismatched package revisions', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(metadata));
  await expect(fetchVehicleLivery('test_livery', 'other-pkg', new AbortController().signal))
    .rejects.toThrow('revision');
});
