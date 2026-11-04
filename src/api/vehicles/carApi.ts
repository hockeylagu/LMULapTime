import type { CarDescriptor, CarResource } from '../../../shared/types/scenes/car.js';
import { fetchBinary, fetchJson } from '../apiClient.js';

/** Content-named car files: the GLB at `<sha256>.glb`, the descriptor at `<vehicleFolder>.json`, textures at `textures/<sha256>.ktx2`. */
export const CAR_FILES = '/api/data-plugin/cars/files/';

export interface LoadedCar {
  resource: CarResource;
  bytes: ArrayBuffer;
  descriptor: CarDescriptor;
  /** The lap's installed VEH id, selecting the appearance (livery) of the shared model. */
  vehicleId: string;
}

/** The textured car serving a VEH id. A vehicle without one is an error: the package covers every catalogued vehicle. */
export async function fetchCar(vehicleId: string, packageRevision: string | undefined, signal: AbortSignal): Promise<LoadedCar> {
  const resource = await fetchJson<CarResource>(`/api/data-plugin/cars/${encodeURIComponent(vehicleId)}`, { signal });
  if (packageRevision && resource.packageRevision !== packageRevision) throw Error('Car package revision differs from the selected lap');
  const [bytes, descriptor] = await Promise.all([
    fetchBinary(`${CAR_FILES}${resource.sha256}.glb`, { signal, cache: 'default' }),
    fetchJson<CarDescriptor>(`${CAR_FILES}${resource.vehicleFolder}.json`, { signal }),
  ]);
  if (bytes.byteLength !== resource.byteLength) throw Error('Incomplete 3D car');
  if (descriptor.vehicleFolder !== resource.vehicleFolder) throw Error('3D car descriptor mismatch');
  return { resource, bytes, descriptor, vehicleId };
}

/** The key a VEH id is matched by: without a `.veh` suffix, upper-case (as the package catalogs it). */
export function normalizeVehicleId(id: string): string {
  return id.trim().replace(/\.veh$/i, '').toUpperCase();
}
