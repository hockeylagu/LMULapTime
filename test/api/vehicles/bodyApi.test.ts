import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../src/api/apiClient.js', () => ({ fetchJson: vi.fn(), fetchBinary: vi.fn() }));

import { fetchBinary, fetchJson } from '../../../src/api/apiClient.js';
import { fetchBody } from '../../../src/api/vehicles/bodyApi.js';

const json = vi.mocked(fetchJson), binary = vi.mocked(fetchBinary), signal = new AbortController().signal;
const body = { packageRevision: 'r', folder: 'Car', sha256: 'aa', byteLength: 4, interior: null as { sha256: string; byteLength: number } | null,
  volumes: [] as { sha256: string; byteLength: number }[] };

beforeEach(() => {
  json.mockReset(); binary.mockReset();
  json.mockImplementation(async path => path.endsWith('/body') ? body : { vehicleFolder: 'Car' });
  binary.mockImplementation(async path => new ArrayBuffer(path.includes('bb.glb') ? 2 : path.includes('volumes/') ? 8 : 4));
  body.volumes = [];
});

it('holds no GLB bytes: it reads the files only when asked, for the parse', async () => {
  body.interior = null;
  const loaded = await fetchBody('car.veh', 'r', signal);
  expect(binary).not.toHaveBeenCalled();
  expect(Object.values(loaded).some(value => value instanceof ArrayBuffer)).toBe(false);
  expect([(await loaded.file()).byteLength, await loaded.interiorFile(), binary.mock.calls.map(call => call[0])]).toEqual([4, null, ['/api/data-plugin/vehicles/files/aa.glb']]);
});

it('reads the interior file only when asked, and rejects one of the wrong size', async () => {
  body.interior = { sha256: 'bb', byteLength: 2 };
  const loaded = await fetchBody('car.veh', 'r', signal);
  await loaded.file();
  expect(binary.mock.calls.map(call => call[0])).toEqual(['/api/data-plugin/vehicles/files/aa.glb']);
  expect((await loaded.interiorFile())?.byteLength).toBe(2);
  expect(binary.mock.calls.map(call => call[0])).toEqual(['/api/data-plugin/vehicles/files/aa.glb', '/api/data-plugin/vehicles/files/bb.glb']);
  body.interior = { sha256: 'bb', byteLength: 3 };
  await expect((await fetchBody('car.veh', 'r', signal)).interiorFile()).rejects.toThrow('Incomplete 3D body');
});

it('loads the cabin volumes of the body by their descriptor path and rejects one of the wrong size', async () => {
  body.interior = null; body.volumes = [{ sha256: 'cc', byteLength: 8 }];
  const loaded = await fetchBody('car.veh', 'r', signal);
  expect([...loaded.volumes].map(([path, bytes]) => [path, bytes.byteLength])).toEqual([['volumes/cc.bin', 8]]);
  expect(binary.mock.calls.map(call => call[0])).toContain('/api/data-plugin/vehicles/files/volumes/cc.bin');
  body.volumes = [{ sha256: 'cc', byteLength: 9 }];
  await expect(fetchBody('car.veh', 'r', signal)).rejects.toThrow('Incomplete 3D body');
});

it('reads the descriptor and volumes once for the liveries of a body, and again after a failed read', async () => {
  body.interior = null; body.volumes = [{ sha256: 'cc', byteLength: 8 }];
  const folders = new Map(), reads = () => json.mock.calls.filter(call => call[0].endsWith('/Car.json')).length;
  const [a, b] = await Promise.all([fetchBody('a.veh', 'r', signal, folders), fetchBody('b.veh', 'r', signal, folders)]);
  expect([a.vehicleId, b.vehicleId, a.descriptor === b.descriptor, a.volumes === b.volumes, reads()]).toEqual(['a.veh', 'b.veh', true, true, 1]);
  const other = new Map();
  binary.mockRejectedValueOnce(Error('offline'));
  await expect(fetchBody('a.veh', 'r', signal, other)).rejects.toThrow('offline');
  await fetchBody('a.veh', 'r', signal, other);
  expect(reads()).toBe(3);
});
