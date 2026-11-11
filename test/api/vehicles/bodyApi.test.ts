import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../src/api/apiClient.js', () => ({ fetchJson: vi.fn(), fetchBinary: vi.fn() }));

import { fetchBinary, fetchJson } from '../../../src/api/apiClient.js';
import { fetchBody } from '../../../src/api/vehicles/bodyApi.js';

const json = vi.mocked(fetchJson), binary = vi.mocked(fetchBinary), signal = new AbortController().signal;
const body = { packageRevision: 'r', folder: 'Car', sha256: 'aa', byteLength: 4, interior: null as { sha256: string; byteLength: number } | null };

beforeEach(() => {
  json.mockReset(); binary.mockReset();
  json.mockImplementation(async path => path.endsWith('/body') ? body : { vehicleFolder: 'Car' });
  binary.mockImplementation(async path => new ArrayBuffer(path.includes('bb.glb') ? 2 : 4));
});

it('loads a body without an interior file as one model', async () => {
  body.interior = null;
  const loaded = await fetchBody('car.veh', 'r', signal);
  expect([loaded.bytes.byteLength, loaded.interiorBytes, binary.mock.calls.map(call => call[0])]).toEqual([4, null, ['/api/data-plugin/vehicles/files/aa.glb']]);
});

it('loads the interior file with the body and rejects one of the wrong size', async () => {
  body.interior = { sha256: 'bb', byteLength: 2 };
  const loaded = await fetchBody('car.veh', 'r', signal);
  expect(loaded.interiorBytes?.byteLength).toBe(2);
  expect(binary.mock.calls.map(call => call[0])).toEqual(['/api/data-plugin/vehicles/files/aa.glb', '/api/data-plugin/vehicles/files/bb.glb']);
  body.interior = { sha256: 'bb', byteLength: 3 };
  await expect(fetchBody('car.veh', 'r', signal)).rejects.toThrow('Incomplete 3D body');
});
