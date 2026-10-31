import type { TrackTextureResource } from '../../../shared/types/scenes/trackTexture.js';
import { ApiError, fetchBinary, fetchJson } from '../apiClient.js';

export interface LoadedTrackTexture {
  metadata: TrackTextureResource;
  image: HTMLImageElement;
}

export async function fetchTrackTextures(
  layoutKey: string,
  packageRevision: string | undefined,
  signal: AbortSignal
): Promise<LoadedTrackTexture[]> {
  const base = `/api/data-plugin/track-textures/${encodeURIComponent(layoutKey)}`;
  let rows: TrackTextureResource[];
  try {
    rows = await fetchJson<TrackTextureResource[]>(base, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
  if (!rows || !rows.length) return [];

  const images = new Map<string, Promise<HTMLImageElement>>();
  return Promise.all(
    rows.map(async metadata => {
      if (packageRevision && metadata.packageRevision !== packageRevision) {
        throw Error('Track texture package revision differs from the selected lap');
      }
      let pending = images.get(metadata.revision);
      if (!pending) {
        pending = (async () => {
          const assetUrl = `/api/data-plugin/track-textures/${encodeURIComponent(metadata.layoutKey)}/${encodeURIComponent(metadata.textureKey)}/${encodeURIComponent(metadata.revision)}/asset`;
          const bytes = await fetchBinary(assetUrl, { signal });
          if (bytes.byteLength !== metadata.byteLength) throw Error('Incomplete track texture');
          const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
          try {
            const image = new Image();
            image.src = blobUrl;
            await image.decode();
            if (signal.aborted) throw new DOMException('Track texture request aborted', 'AbortError');
            if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) {
              throw Error('Track texture dimensions mismatch');
            }
            return image;
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        })();
        images.set(metadata.revision, pending);
      }
      return { metadata, image: await pending };
    })
  );
}
