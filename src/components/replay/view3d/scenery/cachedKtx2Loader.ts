import type { CompressedTexture, Texture, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { fetchBinary } from '../../../../api/apiClient.js';
import { fetchBinaryInBackground } from '../../../../api/backgroundBinary.js';
import type { DetailLoader, MipLevel } from './materials/mipStreaming.js';

/** KTX2 layout: the header's size and level count, then one index entry per level (offset, length, uncompressed length), largest level first. */
const WIDTH = 20, HEIGHT = 24, LEVEL_COUNT = 40, INDEX = 80, ENTRY = 24;

/**
 * How much of each texture a loader reads. `maxPx` is the largest size worth loading for a file (its longer side; undefined =
 * its full size). `start` gives a file's start file where the package has one: the same texture from `skip` levels down (the
 * row's levels less the start's), as a small file of its own at `url`. The texture loads from that, and the scene fetches the
 * levels above when it sharpens the texture (`detail`).
 */
export interface TextureDetail { maxPx?: (url: string) => number | undefined; start?: (url: string) => TextureStartFile | undefined }

/** A texture's start file and how many of the texture's largest levels it leaves out. */
export interface TextureStartFile { url: string; skip: number }

/**
 * A KTX2 file without its levels larger than `maxPx`, as a complete, smaller texture. The file stores its levels smallest
 * first, so that is its start, with the header and level index rewritten; a file not laid out that way stays whole.
 */
export function withoutLevelsAbove(file: ArrayBuffer, maxPx: number | undefined): ArrayBuffer {
  const view = new DataView(file), levels = view.getUint32(LEVEL_COUNT, true), longest = Math.max(view.getUint32(WIDTH, true), view.getUint32(HEIGHT, true));
  let skip = 0;
  if (maxPx !== undefined) while (longest >> skip > maxPx && skip < levels - 1) skip++;
  if (!skip) return file;
  const offset = (index: number) => Number(view.getBigUint64(INDEX + index * ENTRY, true));
  for (let index = 1; index < levels; index++) if (offset(index) >= offset(index - 1)) return file;
  const reduced = new Uint8Array(file.slice(0, offset(skip - 1))), header = new DataView(reduced.buffer);
  header.setUint32(WIDTH, view.getUint32(WIDTH, true) >> skip, true);
  header.setUint32(HEIGHT, view.getUint32(HEIGHT, true) >> skip, true);
  header.setUint32(LEVEL_COUNT, levels - skip, true);
  reduced.copyWithin(INDEX, INDEX + skip * ENTRY, INDEX + levels * ENTRY);
  reduced.fill(0, INDEX + (levels - skip) * ENTRY, INDEX + levels * ENTRY);
  return reduced.buffer;
}

/**
 * KTX2 loader that fetches each URL once. The package's KTX2 files hold GPU blocks (BCn, R8, RGBA8), which the
 * loader uploads directly, so no Basis transcoder is configured: a Basis-compressed file would fail loudly. Each file is
 * compressed as a whole (`.ktx2.zst`, served with `Content-Encoding: zstd`), so the browser decompresses it while downloading
 * and the KTX2 itself has no supercompression to decode on the main thread.
 * The cached original is only the source of mip data: every user draws its own clone.
 * A texture with a start file loads from it; the levels above come from the full file, read off the main thread when the
 * scene sharpens the texture (`detail()`).
 */
export class CachedKtx2Loader extends KTX2Loader {
  private readonly cache = new Map<string, Promise<CompressedTexture>>();
  private readonly details = new WeakMap<Texture, DetailLoader>();

  constructor(renderer: WebGLRenderer, private readonly textureDetail?: TextureDetail) {
    super();
    this.detectSupport(renderer);
  }

  override load(url: string, onLoad: (texture: CompressedTexture) => void, _onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    let pending = this.cache.get(url);
    if (!pending) {
      const file = this.manager.resolveURL(this.path + url), maxPx = this.textureDetail?.maxPx?.(url), start = this.textureDetail?.start?.(url);
      const parse = (buffer: ArrayBuffer) => new Promise<CompressedTexture>((resolve, reject) => { this.parse(withoutLevelsAbove(buffer, maxPx), resolve, reject); });
      pending = start === undefined ? fetchBinary(file).then(parse) : fetchBinary(this.manager.resolveURL(this.path + start.url)).then(parse).then(texture => {
        // The levels the start file leaves out, as far as `maxPx` allows: they are the full file's largest ones.
        const top = texture.mipmaps[0], longest = Math.max(top.width, top.height);
        const missing = Array.from({length: start.skip}, (_, level) => longest << (start.skip - level)).filter(px => maxPx === undefined || px <= maxPx).length;
        let levels: Promise<MipLevel[]> | undefined;
        if (missing) this.details.set(texture, {missing, load: () => levels ??= fetchBinaryInBackground(file).then(parse).then(full => (full.mipmaps as MipLevel[]).slice(0, missing))});
        return texture;
      });
      this.cache.set(url, pending);
      pending.catch(() => { if (this.cache.get(url) === pending) this.cache.delete(url); });
    }
    void pending.then(onLoad, onError);
  }

  /** How to read the levels above those of a texture this loader read from its start file; undefined for a texture it read whole. */
  detail(texture: Texture): DetailLoader | undefined {
    return this.details.get(texture);
  }

  /** Frees every cached original's mip data. */
  override dispose(): void {
    for (const pending of this.cache.values()) pending.then(texture => texture.dispose(), () => undefined);
    this.cache.clear();
    super.dispose();
  }
}
