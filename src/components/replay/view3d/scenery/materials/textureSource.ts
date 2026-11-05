import { RepeatWrapping, SRGBColorSpace, NoColorSpace, type CompressedTexture, type Texture, type WebGLRenderer } from 'three';
import type { CachedKtx2Loader } from '../cachedKtx2Loader.js';
import { textureAsset, type SurfaceMap } from './surfaceConfig.js';

const MAX_ANISOTROPY = 8;

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

/** Loads the textures of the surface maps of one chunk. Each texture is a chunk-owned clone; the compressed data is cached by URL. */
export interface SurfaceTextureSource {
  load(map: SurfaceMap): Promise<Texture>;
}

/** `base` is the folder the chunk's `textures/...` URIs are relative to. */
export function createTextureSource(uris: ReadonlyMap<string, string>, ktx2: CachedKtx2Loader, renderer: WebGLRenderer, base: string): SurfaceTextureSource {
  const loaded = new Map<string, Promise<Texture>>();
  const anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  return {
    load(map) {
      const uri = resolveMapUri(map, uris), key = `${uri}|${map.srgb}`;
      let pending = loaded.get(key);
      if (!pending) {
        pending = ktx2.loadAsync(`${base}${uri}`).then((original: CompressedTexture) => {
          // The loader shares one object per URL; colour interpretation is local to this role.
          const texture = original.clone();
          texture.flipY = false;
          texture.colorSpace = map.srgb ? SRGBColorSpace : NoColorSpace;
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.anisotropy = anisotropy;
          texture.needsUpdate = true;
          return texture;
        });
        loaded.set(key, pending);
      }
      return pending;
    },
  };
}

export function createSurfaceTexturePool(ktx2: CachedKtx2Loader, renderer: WebGLRenderer, base: string) {
  type Entry = {pending: Promise<Texture>; owners: number};
  const entries = new Map<string, Entry>();
  let disposed = false;
  const release = (key: string, entry: Entry) => {
    if (entry.owners <= 0) return;
    entry.owners--;
    if (entry.owners) return;
    if (entries.get(key) === entry) entries.delete(key);
    void entry.pending.then(texture => texture.dispose(), () => undefined);
  };
  return {
    source(uris: ReadonlyMap<string, string>): SurfaceTextureSource & {dispose(): void} {
      const local = createTextureSource(uris, ktx2, renderer, base), owned = new Map<string, Entry>();
      let released = false;
      return {
        load(map) {
          if (disposed || released) return Promise.reject(Error('Scenery texture source was disposed'));
          const key = `${resolveMapUri(map, uris)}|${map.srgb}`;
          let entry = owned.get(key);
          if (entry) return entry.pending;
          entry = entries.get(key);
          if (entry) entry.owners++;
          else {
            entry = {pending: local.load(map), owners: 1};
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
