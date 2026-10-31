import type { VehicleWheelResource } from '../../../shared/types/scenes/vehicleWheel.js';
import { ApiError, fetchBinary, fetchJson } from '../apiClient.js';

export interface LoadedWheelTexture {
  sha256: string;
  image: HTMLImageElement;
}

export interface LoadedVehicleWheels {
  metadata: VehicleWheelResource;
  rim: LoadedWheelTexture;
  tyre: LoadedWheelTexture;
}

const textureCache = new Map<string, Promise<LoadedWheelTexture>>();

export function clearCachedWheelTextures(): void {
  textureCache.clear();
}

async function loadTexture(sha256: string, byteLength: number, width: number, height: number, signal: AbortSignal): Promise<LoadedWheelTexture> {
  signal.throwIfAborted();
  let pending = textureCache.get(sha256);
  if (!pending) {
    pending = (async () => {
      // Shared loads outlive individual scenes; cancellation only stops the caller's wait.
      const bytes = await fetchBinary(`/api/data-plugin/vehicle-wheels/${encodeURIComponent(sha256)}/asset`);
      if (bytes.byteLength !== byteLength) throw Error('Incomplete vehicle wheel texture');
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth !== width || image.naturalHeight !== height) {
          throw Error('Vehicle wheel texture dimensions mismatch');
        }
        return { sha256, image };
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    textureCache.set(sha256, pending);
    pending.catch(() => {
      if (textureCache.get(sha256) === pending) {
        textureCache.delete(sha256);
      }
    });
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Vehicle wheel texture request aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      texture => {
        signal.removeEventListener('abort', onAbort);
        resolve(texture);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : Error('Unable to load vehicle wheel texture', { cause: error }));
      },
    );
  });
}

export async function fetchVehicleWheels(
  identity: string,
  packageRevision: string | undefined,
  signal: AbortSignal
): Promise<LoadedVehicleWheels | null> {
  const base = `/api/data-plugin/vehicle-wheels/${encodeURIComponent(identity)}`;
  let metadata: VehicleWheelResource;
  try {
    metadata = await fetchJson<VehicleWheelResource>(base, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  if (packageRevision && metadata.packageRevision !== packageRevision) {
    throw Error('Vehicle wheels package revision differs from the selected lap');
  }
  const [rim, tyre] = await Promise.all([
    loadTexture(metadata.rim.sha256, metadata.rim.byteLength, metadata.rim.width, metadata.rim.height, signal),
    loadTexture(metadata.tyre.sha256, metadata.tyre.byteLength, metadata.tyre.width, metadata.tyre.height, signal),
  ]);
  return { metadata, rim, tyre };
}
