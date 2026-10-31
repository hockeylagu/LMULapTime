import type { VehicleMeshResource } from '../../../shared/types/scenes/vehicleMesh.js';
import { ApiError, fetchBinary, fetchJson } from '../apiClient.js';

export interface LoadedVehicleMesh { metadata: VehicleMeshResource; bytes: ArrayBuffer }

export async function fetchVehicleMesh(recordId: string, packageRevision: string | undefined, signal: AbortSignal): Promise<LoadedVehicleMesh | null> {
  const base = `/api/data-plugin/vehicle-meshes/${encodeURIComponent(recordId)}`;
  let metadata: VehicleMeshResource;
  try { metadata = await fetchJson<VehicleMeshResource>(base, {signal}); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
  if (metadata.vehicleRecordId !== recordId || (packageRevision && metadata.packageRevision !== packageRevision)) throw Error('Vehicle mesh identity or package revision differs from the selected lap');
  const bytes = await fetchBinary(`${base}/${encodeURIComponent(metadata.revision)}/asset`, {signal});
  if (bytes.byteLength !== metadata.byteLength) throw Error('Incomplete vehicle mesh');
  return {metadata, bytes};
}
