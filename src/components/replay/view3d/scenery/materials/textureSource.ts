import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, NoColorSpace, type CompressedTexture, type Texture, type WebGLRenderer } from 'three';
import type { CachedKtx2Loader } from '../cachedKtx2Loader.js';
import { textureAsset, type SurfaceMap } from './surfaceConfig.js';
import { startStreaming } from './mipStreaming.js';

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
  // Once whole on the GPU the texture and the loader's cache let its levels go.
  startStreaming(texture, ktx2.detail(original), ktx2.file(original));
  texture.needsUpdate = true;
  return texture;
}

/**
 * The scenery's surface textures, one per file and colour role, shared by every chunk that uses them. Chunks stay loaded until the
 * scene goes, so the pool frees its textures all at once (`dispose`). `base` is the folder the chunks' `textures/...` URIs are
 * relative to.
 */
export function createSurfaceTexturePool(ktx2: CachedKtx2Loader, renderer: WebGLRenderer, base: string) {
  const entries = new Map<string, Promise<Texture>>();
  let disposed = false;
  return {
    /** The textures of one chunk, found through the images it declares (`uris`). */
    source(uris: ReadonlyMap<string, string>): SurfaceTextureSource {
      return {
        load(map) {
          if (disposed) return Promise.reject(Error('Scenery texture pool was disposed'));
          const uri = resolveMapUri(map, uris), key = `${uri}|${map.srgb}`;
          let pending = entries.get(key);
          if (!pending) {
            const created = pending = loadSurfaceTexture(ktx2, renderer, `${base}${uri}`, map.srgb);
            entries.set(key, created);
            void created.catch(() => { if (entries.get(key) === created) entries.delete(key); });
          }
          return pending;
        },
      };
    },
    dispose() {
      disposed = true;
      for (const pending of entries.values()) void pending.then(texture => texture.dispose(), () => undefined);
      entries.clear();
    },
  };
}
