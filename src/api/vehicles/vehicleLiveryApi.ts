import type { VehicleLiveryResource } from '../../../shared/types/scenes/vehicleLivery.js';
import { ApiError, fetchBinary, fetchJson } from '../apiClient.js';

export interface LoadedVehicleLivery {
  metadata: VehicleLiveryResource;
  image: HTMLImageElement;
}

export async function fetchVehicleLivery(
  identity: string,
  packageRevision: string | undefined,
  signal: AbortSignal
): Promise<LoadedVehicleLivery | null> {
  const base = `/api/data-plugin/vehicle-liveries/${encodeURIComponent(identity)}`;
  let metadata: VehicleLiveryResource;
  try {
    metadata = await fetchJson<VehicleLiveryResource>(base, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  if (packageRevision && metadata.packageRevision !== packageRevision) {
    throw Error('Vehicle livery package revision differs from the selected lap');
  }
  const bytes = await fetchBinary(
    `/api/data-plugin/vehicle-liveries/${encodeURIComponent(metadata.liveryKey)}/${encodeURIComponent(metadata.revision)}/asset`,
    { signal }
  );
  if (bytes.byteLength !== metadata.byteLength) throw Error('Incomplete vehicle livery');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (signal.aborted) throw new DOMException('Vehicle livery request aborted', 'AbortError');
    if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) {
      throw Error('Vehicle livery dimensions mismatch');
    }
    return { metadata, image };
  } finally {
    URL.revokeObjectURL(url);
  }
}
