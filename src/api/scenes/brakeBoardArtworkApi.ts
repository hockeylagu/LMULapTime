import type { BrakeBoardArtworkResource } from '../../../shared/types/scenes/brakeBoardArtwork.js';
import { fetchBinary, fetchJson } from '../apiClient.js';

export interface LoadedBrakeBoardArtwork { metadata: BrakeBoardArtworkResource; image: HTMLImageElement }

export async function fetchBrakeBoardArtwork(layoutKey: string, geometryRevision: string, packageRevision: string, signal: AbortSignal): Promise<LoadedBrakeBoardArtwork[]> {
  const base = `/api/data-plugin/brake-board-artwork/${encodeURIComponent(layoutKey)}`;
  const rows = await fetchJson<BrakeBoardArtworkResource[]>(base, {signal});
  const images = new Map<string, Promise<HTMLImageElement>>();
  return Promise.all(rows.map(async metadata => {
    if (metadata.layoutKey !== layoutKey || metadata.sourceGeometryRevision !== geometryRevision || metadata.packageRevision !== packageRevision) throw Error('Brake-board artwork revision mismatch');
    let pending = images.get(metadata.revision);
    if (!pending) {
      pending = (async () => {
        const bytes = await fetchBinary(`${base}/${encodeURIComponent(metadata.revision)}/asset`, {signal});
        if (bytes.byteLength !== metadata.byteLength) throw Error('Incomplete brake-board image');
        const url = URL.createObjectURL(new Blob([bytes], {type: 'image/png'}));
        try {
          const image = new Image(); image.src = url; await image.decode();
          if (signal.aborted) throw new DOMException('Artwork request aborted', 'AbortError');
          if (image.naturalWidth !== metadata.widthPx || image.naturalHeight !== metadata.heightPx) throw Error('Brake-board image dimensions mismatch');
          return image;
        } finally { URL.revokeObjectURL(url); }
      })();
      images.set(metadata.revision, pending);
    }
    return {metadata, image: await pending};
  }));
}
