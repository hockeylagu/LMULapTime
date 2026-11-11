import type { CompressedTexture, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { fetchBinary } from '../../../../api/apiClient.js';

/**
 * KTX2 loader that fetches each URL once. The package's KTX2 files hold GPU blocks (BCn, R8, RGBA8), which the
 * loader uploads directly, so no Basis transcoder is configured: a Basis-compressed file would fail loudly. Each file is
 * compressed as a whole (`.ktx2.zst`, served with `Content-Encoding: zstd`), so the browser decompresses it while downloading
 * and the KTX2 itself has no supercompression to decode on the main thread.
 * The cached original is only the source of mip data: every user draws its own clone.
 * Files are read with `fetchBinary` straight into an ArrayBuffer: three's FileLoader re-streams every body chunk through script to
 * report progress, which kept the main thread busy for seconds after the last texture had arrived.
 */
export class CachedKtx2Loader extends KTX2Loader {
  private readonly cache = new Map<string, Promise<CompressedTexture>>();

  constructor(renderer: WebGLRenderer) {
    super();
    this.detectSupport(renderer);
  }

  override load(url: string, onLoad: (texture: CompressedTexture) => void, _onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = fetchBinary(this.manager.resolveURL(this.path + url))
        .then(buffer => new Promise<CompressedTexture>((resolve, reject) => { this.parse(buffer, resolve, reject); }));
      this.cache.set(url, pending);
      pending.catch(() => { if (this.cache.get(url) === pending) this.cache.delete(url); });
    }
    void pending.then(onLoad, onError);
  }

  /** Frees every cached original's mip data. */
  override dispose(): void {
    for (const pending of this.cache.values()) pending.then(texture => texture.dispose(), () => undefined);
    this.cache.clear();
    super.dispose();
  }
}
