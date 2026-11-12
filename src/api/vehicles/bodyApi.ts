import type { BodyDescriptor, BodyResource } from '../../../shared/types/scenes/car.js';
import { fetchBinary, fetchJson } from '../apiClient.js';

/** Content-named body files of the package's `vehicles/` folder: the GLB at `<sha256>.glb`, the descriptor at `bodies/<folder>.json`, textures at `textures/<sha256>.ktx2.zst`. */
export const VEHICLE_FILES = '/api/data-plugin/vehicles/files/';

export interface LoadedBody {
  resource: BodyResource;
  bytes: ArrayBuffer;
  /** The body's interior GLB (the parts only the driver cameras draw); null for a body without one. */
  interiorBytes: ArrayBuffer | null;
  descriptor: BodyDescriptor;
  /** The lap's installed VEH id, selecting the appearance (livery) of the shared model. */
  vehicleId: string;
}

/** The 3D body serving a VEH id. A vehicle without one is an error: the package covers every catalogued vehicle. */
export async function fetchBody(vehicleId: string, packageRevision: string | undefined, signal: AbortSignal): Promise<LoadedBody> {
  const resource = await fetchJson<BodyResource>(`/api/data-plugin/vehicles/${encodeURIComponent(vehicleId)}/body`, { signal });
  if (packageRevision && resource.packageRevision !== packageRevision) throw Error('Body package revision differs from the selected lap');
  const {interior} = resource;
  const [bytes, interiorBytes, descriptor] = await Promise.all([
    fetchBinary(`${VEHICLE_FILES}${resource.sha256}.glb`, { signal, cache: 'default' }),
    interior ? fetchBinary(`${VEHICLE_FILES}${interior.sha256}.glb`, { signal, cache: 'default' }) : null,
    fetchJson<BodyDescriptor>(`${VEHICLE_FILES}bodies/${resource.folder}.json`, { signal }),
  ]);
  if (bytes.byteLength !== resource.byteLength || (interior && interiorBytes?.byteLength !== interior.byteLength)) throw Error('Incomplete 3D body');
  return { resource, bytes, interiorBytes, descriptor, vehicleId };
}
