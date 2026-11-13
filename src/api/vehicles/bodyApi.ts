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
  /** The body's cabin volumes by their descriptor path (`volumes/<sha256>.bin`), for the cockpit reflection occlusion. */
  volumes: Map<string, ArrayBuffer>;
  /** The lap's installed VEH id, selecting the appearance (livery) of the shared model. */
  vehicleId: string;
}

/** The 3D body serving a VEH id. A vehicle without one is an error: the package covers every catalogued vehicle. */
export async function fetchBody(vehicleId: string, packageRevision: string | undefined, signal: AbortSignal): Promise<LoadedBody> {
  const resource = await fetchJson<BodyResource>(`/api/data-plugin/vehicles/${encodeURIComponent(vehicleId)}/body`, { signal });
  if (packageRevision && resource.packageRevision !== packageRevision) throw Error('Body package revision differs from the selected lap');
  const {interior} = resource;
  const [bytes, interiorBytes, descriptor, volumes] = await Promise.all([
    fetchBinary(`${VEHICLE_FILES}${resource.sha256}.glb`, { signal, cache: 'default' }),
    interior ? fetchBinary(`${VEHICLE_FILES}${interior.sha256}.glb`, { signal, cache: 'default' }) : null,
    fetchJson<BodyDescriptor>(`${VEHICLE_FILES}bodies/${resource.folder}.json`, { signal }),
    Promise.all(resource.volumes.map(async row => {
      const volume = await fetchBinary(`${VEHICLE_FILES}volumes/${row.sha256}.bin`, { signal, cache: 'default' });
      if (volume.byteLength !== row.byteLength) throw Error('Incomplete 3D body');
      return [`volumes/${row.sha256}.bin`, volume] as const;
    })),
  ]);
  if (bytes.byteLength !== resource.byteLength || (interior && interiorBytes?.byteLength !== interior.byteLength)) throw Error('Incomplete 3D body');
  return { resource, bytes, interiorBytes, descriptor, volumes: new Map(volumes), vehicleId };
}
