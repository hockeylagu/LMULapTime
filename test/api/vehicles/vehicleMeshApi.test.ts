import { afterEach, expect, it, vi } from 'vitest';
import { fetchVehicleMesh } from '../../../src/api/vehicles/vehicleMeshApi.js';
import type { VehicleMeshResource } from '../../../shared/types/scenes/vehicleMesh.js';

afterEach(() => vi.restoreAllMocks());
const metadata: VehicleMeshResource = {schemaVersion: 1, vehicleRecordId: 'car-a', coordinates: 'vehicle-local-xyz-metres-forward-minus-z', representation: 'render', originCalibration: 'unverified', parts: ['body', 'tyres'],
  revision: 'mesh-123', sha256: '123', byteLength: 4, triangles: 1, bounds: {min: [-1, 0, -2], max: [1, 1, 2]}, packageRevision: 'package-a'};
it('requests its own record and revision through the API client', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
  const result = await fetchVehicleMesh('car-a', 'package-a', new AbortController().signal);
  expect(result?.bytes.byteLength).toBe(4); expect(network.mock.calls[1][0]).toBe('/api/data-plugin/vehicle-meshes/car-a/mesh-123/asset');
});
it('uses generic fallback only for a missing model and rejects mismatched identities before loading bytes', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({error: 'Unavailable'}, {status: 404}));
  expect(await fetchVehicleMesh('car-a', 'package-a', new AbortController().signal)).toBeNull();
  network.mockResolvedValueOnce(Response.json({...metadata, vehicleRecordId: 'car-b'}));
  await expect(fetchVehicleMesh('car-a', 'package-a', new AbortController().signal)).rejects.toThrow('identity');
  network.mockResolvedValueOnce(Response.json(metadata));
  await expect(fetchVehicleMesh('car-a', 'other-package', new AbortController().signal)).rejects.toThrow('revision');
  expect(network).toHaveBeenCalledTimes(3);
});
