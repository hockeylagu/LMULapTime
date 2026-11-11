import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, NoColorSpace, type CompressedTexture, type Texture, type WebGLRenderer } from 'three';
import type { CachedKtx2Loader } from '../cachedKtx2Loader.js';
import { textureAsset, type SurfaceMap } from './surfaceConfig.js';
import { startStreaming, stopStreaming } from './mipStreaming.js';

/** Anisotropic filtering of scenery and car textures (three caps it at the GPU's maximum): sharp markings and liveries at grazing angles. */
export const MAX_ANISOTROPY = 16;

interface GlbImage { name?: string; uri?: string }

/**
 * The chunk GLB's declared images by name. The exporter names each image `<stem>__srgb.ktx2.zst` or `<stem>__linear.ktx2.zst` (the surface
 * map's `textureAsset`) and gives it the content-named `textures/<sha256>.ktx2.zst` URI, which is how a surface map finds its file.
 */
export function imageUriMap(json: { images?: GlbImage[] }): Map<string, string> {
  const uris = new Map<string, string>();
  for (const image of json.images ?? []) if (image.name && image.uri) uris.set(image.name, image.uri);
  return uris;
}

/** The package-relative URI of a surface map's KTX2 file; a map the chunk does not declare is an error, never a substitute. */
export function resolveMapUri(map: SurfaceMap, uris: ReadonlyMap<string, string>): string {
  const name = textureAsset(map.texture, map.srgb);
  const uri = uris.get(name);
  if (uri === undefined) throw Error(`Surface texture ${name} is not declared by the scenery chunk`);
  return uri;
}

/** Loads the textures of the surface maps of one chunk. Each texture is a pool-owned clone; the compressed data is cached by URL. */
export interface SurfaceTextureSource {
  load(map: SurfaceMap): Promise<Texture>;
}

/** A pool-owned clone of a cached KTX2 file, set up for one colour role and started on its reduced levels. */
async function loadSurfaceTexture(ktx2: CachedKtx2Loader, renderer: WebGLRenderer, url: string, srgb: boolean): Promise<Texture> {
  const original: CompressedTexture = await ktx2.loadAsync(url);
  // The loader shares one object per URL; colour interpretation is local to this role.
  const texture = original.clone();
  texture.flipY = false;
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  // Trilinear: three's KTX2 loader gives raw (RGBA8, R8) textures nearest filtering, which shows texels.
  texture.minFilter = texture.mipmaps.length > 1 ? LinearMipmapLinearFilter : LinearFilter;
  texture.magFilter = LinearFilter;
  startStreaming(texture, renderer);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The scenery's surface textures, one per file and colour role, counted by the chunks that use them. `base` is the folder the
 * chunks' `textures/...` URIs are relative to.
 */
export function createSurfaceTexturePool(ktx2: CachedKtx2Loader, renderer: WebGLRenderer, base: string) {
  type Entry = {pending: Promise<Texture>; owners: number};
  const entries = new Map<string, Entry>();
  let disposed = false;
  const release = (key: string, entry: Entry) => {
    if (entry.owners <= 0) return;
    entry.owners--;
    if (entry.owners) return;
    if (entries.get(key) === entry) entries.delete(key);
    void entry.pending.then(texture => { stopStreaming(texture); texture.dispose(); }, () => undefined);
  };
  return {
    source(uris: ReadonlyMap<string, string>): SurfaceTextureSource & {dispose(): void} {
      const owned = new Map<string, Entry>();
      let released = false;
      return {
        load(map) {
          if (disposed || released) return Promise.reject(Error('Scenery texture source was disposed'));
          const uri = resolveMapUri(map, uris), key = `${uri}|${map.srgb}`;
          let entry = owned.get(key);
          if (entry) return entry.pending;
          entry = entries.get(key);
          if (entry) entry.owners++;
          else {
            entry = {pending: loadSurfaceTexture(ktx2, renderer, `${base}${uri}`, map.srgb), owners: 1};
            entries.set(key, entry);
            const created = entry;
            void entry.pending.catch(() => { if (entries.get(key) === created) entries.delete(key); });
          }
          owned.set(key, entry);
          return entry.pending;
        },
        dispose() {
          if (released) return;
          released = true;
          owned.forEach((entry, key) => release(key, entry));
          owned.clear();
        },
      };
    },
    dispose() {
      disposed = true;
      entries.forEach((entry, key) => { entry.owners = 1; release(key, entry); });
      entries.clear();
    },
  };
}
