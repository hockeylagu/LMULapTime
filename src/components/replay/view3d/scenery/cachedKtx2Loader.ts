import type { CompressedTexture, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/**
 * KTX2 loader that fetches each URL once. The package's KTX2 files hold the game's GPU blocks (BCn, R8, RGBA8), which the
 * loader uploads directly, so no Basis transcoder is configured: a Basis-compressed file would fail loudly.
 * Chunks and cars share textures; GLTFLoader clones what it gets, so the cached original is only the source of mip data.
 */
export class CachedKtx2Loader extends KTX2Loader {
  private readonly cache = new Map<string, Promise<CompressedTexture>>();

  constructor(renderer: WebGLRenderer) {
    super();
    this.detectSupport(renderer);
  }

  override load(url: string, onLoad: (texture: CompressedTexture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = new Promise<CompressedTexture>((resolve, reject) => { super.load(url, resolve, onProgress, reject); });
      this.cache.set(url, pending);
      pending.catch(() => { if (this.cache.get(url) === pending) this.cache.delete(url); });
    }
    void pending.then(onLoad, onError);
  }

  /** Forgets a URL and frees the cached original's mip data. */
  release(url: string): void {
    const pending = this.cache.get(url);
    if (!pending) return;
    this.cache.delete(url);
    pending.then(texture => texture.dispose(), () => undefined);
  }

  override dispose(): void {
    for (const url of this.cache.keys()) this.release(url);
    super.dispose();
  }
}
