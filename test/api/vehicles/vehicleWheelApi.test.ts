// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearCachedWheelTextures, fetchVehicleWheels } from '../../../src/api/vehicles/vehicleWheelApi.js';
import type { VehicleWheelResource } from '../../../shared/types/scenes/vehicleWheel.js';

afterEach(() => {
  clearCachedWheelTextures();
  vi.restoreAllMocks();
});

const metadata: VehicleWheelResource = {
  vehicleRecordId: 'REC_CAR_1',
  rim: {
    revision: 'rim-sha-1234',
    sha256: 'a'.repeat(64),
    width: 1024,
    height: 1024,
    byteLength: 24,
  },
  tyre: {
    revision: 'tyre-sha-5678',
    sha256: 'b'.repeat(64),
    width: 1024,
    height: 1024,
    byteLength: 24,
  },
  packageRevision: 'pkg-rev-1',
};

beforeEach(() => {
  clearCachedWheelTextures();
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 1024;
    naturalHeight = 1024;
    async decode() {}
  });
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-wheel'),
    revokeObjectURL: vi.fn(),
  });
});

it('fetches vehicle wheel metadata and both rim and tyre texture assets', async () => {
  const rimBytes = new Uint8Array(24);
  const tyreBytes = new Uint8Array(24);
  const network = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(metadata))
    .mockResolvedValueOnce(new Response(rimBytes))
    .mockResolvedValueOnce(new Response(tyreBytes));

  const result = await fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', new AbortController().signal);
  expect(result?.metadata.vehicleRecordId).toBe('REC_CAR_1');
  expect(result?.rim.sha256).toBe('a'.repeat(64));
  expect(result?.tyre.sha256).toBe('b'.repeat(64));
  expect(result?.rim.image.naturalWidth).toBe(1024);
  expect(result?.tyre.image.naturalHeight).toBe(1024);
  expect(network).toHaveBeenCalledTimes(3);
  expect(network.mock.calls[0][0]).toBe('/api/data-plugin/vehicle-wheels/REC_CAR_1');
  expect(network.mock.calls[1][0]).toBe(`/api/data-plugin/vehicle-wheels/${'a'.repeat(64)}/asset`);
  expect(network.mock.calls[2][0]).toBe(`/api/data-plugin/vehicle-wheels/${'b'.repeat(64)}/asset`);
});

it('returns null when wheel metadata is 404', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 404 }));
  const result = await fetchVehicleWheels('unknown_car', 'pkg-rev-1', new AbortController().signal);
  expect(result).toBeNull();
});

it('rejects mismatched package revision', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(metadata));
  await expect(fetchVehicleWheels('REC_CAR_1', 'wrong-rev', new AbortController().signal))
    .rejects.toThrow('revision');
});

it.each(['first', 'second'])('cancels only the %s caller while shared textures are decoding', async caller => {
  const releases: (() => void)[] = [];
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 1024;
    naturalHeight = 1024;
    decode() {
      return new Promise<void>(resolve => { releases.push(resolve); });
    }
  });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
    typeof input === 'string' && input.endsWith('/asset') ? new Response(new Uint8Array(24)) : Response.json(metadata));
  const first = new AbortController();
  const second = new AbortController();
  const firstResult = fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', first.signal);
  await vi.waitFor(() => expect(releases).toHaveLength(2));
  const secondResult = fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', second.signal);
  await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(4));

  const cancelled = caller === 'first' ? firstResult : secondResult;
  const surviving = caller === 'first' ? secondResult : firstResult;
  const rejection = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  (caller === 'first' ? first : second).abort();
  await rejection;
  for (const release of releases) release();
  await expect(surviving).resolves.toMatchObject({ metadata });

  const cached = await fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', new AbortController().signal);
  expect(cached?.rim.sha256).toBe(metadata.rim.sha256);
  expect(network).toHaveBeenCalledTimes(5);
  expect(revokeObjectURL).toHaveBeenCalledTimes(2);
});

it('evicts failed shared texture loads so a later caller can retry', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
    typeof input === 'string' && input.endsWith('/asset') ? new Response(new Uint8Array(24)) : Response.json(metadata));
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 1024;
    naturalHeight = 1024;
    decode() {
      return Promise.reject(Error('Decode failed'));
    }
  });
  await expect(fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', new AbortController().signal))
    .rejects.toThrow('Decode failed');
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 1024;
    naturalHeight = 1024;
    async decode() {}
  });
  await expect(fetchVehicleWheels('REC_CAR_1', 'pkg-rev-1', new AbortController().signal))
    .resolves.toMatchObject({ metadata });
});
