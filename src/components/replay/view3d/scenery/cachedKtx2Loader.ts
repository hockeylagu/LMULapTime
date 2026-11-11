import type { CompressedTexture, Texture, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { fetchBinary, fetchBinaryStart } from '../../../../api/apiClient.js';
import { fetchBinaryInBackground } from '../../../../api/backgroundBinary.js';
import { STREAMED_LEVELS, STREAMED_MIN_PX, type DetailLoader, type MipLevel } from './materials/mipStreaming.js';

/** KTX2 layout: the header's size and level count, then one index entry per level (offset, length, uncompressed length), largest level first. */
const WIDTH = 20, HEIGHT = 24, LEVEL_COUNT = 40, INDEX = 80, ENTRY = 24;

/**
 * How much of each texture a loader reads. `maxPx` is the largest size worth loading for a file (its longer side; undefined =
 * its full size): larger levels are never read. With `streamed`, a texture that is still large after that starts on its
 * reduced levels, and the scene fetches the levels in between when it sharpens the texture (`detail`).
 */
export interface TextureDetail { maxPx?: (url: string) => number | undefined; streamed?: boolean }

/** The file's largest levels a first read leaves out: `dropped` for good (above `maxPx`), then `later` to come when the texture sharpens. */
export function skippedLevels(width: number, height: number, levels: number, maxPx: number | undefined, streamed: boolean): {dropped: number; later: number} {
  let dropped = 0;
  if (maxPx !== undefined) while (Math.max(width, height) >> dropped > maxPx && dropped < levels - 1) dropped++;
  const large = levels - dropped > STREAMED_LEVELS && Math.min(width, height) >> dropped >= STREAMED_MIN_PX;
  return {dropped, later: streamed && large ? STREAMED_LEVELS : 0};
}

/**
 * Where a KTX2 file's level `level` ends, which is where the next larger one begins: the file stores its levels smallest
 * first. Undefined until the level index has arrived; Infinity when the file is not laid out that way and so is read whole.
 */
function levelEnd(received: Uint8Array, level: number): number | undefined {
  if (received.length < INDEX) return undefined;
  const view = new DataView(received.buffer, received.byteOffset, received.byteLength), levels = view.getUint32(LEVEL_COUNT, true);
  if (received.length < INDEX + levels * ENTRY) return undefined;
  const offset = (index: number) => Number(view.getBigUint64(INDEX + index * ENTRY, true));
  for (let index = 1; index < levels; index++) if (offset(index) >= offset(index - 1)) return Infinity;
  return offset(level - 1);
}

/** The levels a read of `received` leaves out, once its header has arrived. */
function skippedOf(received: Uint8Array, maxPx: number | undefined, streamed: boolean) {
  if (received.length < INDEX) return undefined;
  const view = new DataView(received.buffer, received.byteOffset, received.byteLength);
  return skippedLevels(view.getUint32(WIDTH, true), view.getUint32(HEIGHT, true), view.getUint32(LEVEL_COUNT, true), maxPx, streamed);
}

/**
 * How many bytes of a KTX2 file its first read needs: everything but the levels it leaves out. Undefined until the level
 * index has arrived; Infinity for a file that is read whole.
 */
export function firstReadEnd(received: Uint8Array, maxPx: number | undefined, streamed: boolean): number | undefined {
  const skipped = skippedOf(received, maxPx, streamed);
  if (!skipped) return undefined;
  return skipped.dropped + skipped.later ? levelEnd(received, skipped.dropped + skipped.later) : Infinity;
}

/** The start of a KTX2 file up to `end` as a complete, smaller texture: without its `skip` largest levels and their index entries. */
function withoutLargestLevels(start: Uint8Array, end: number, skip: number): ArrayBuffer {
  const reduced = start.slice(0, end), view = new DataView(reduced.buffer), levels = view.getUint32(LEVEL_COUNT, true);
  view.setUint32(WIDTH, view.getUint32(WIDTH, true) >> skip, true);
  view.setUint32(HEIGHT, view.getUint32(HEIGHT, true) >> skip, true);
  view.setUint32(LEVEL_COUNT, levels - skip, true);
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
 * With `detail`, a texture is read only as far as the levels it starts on, which is a small part of the file. The levels to
 * come later are read off the main thread, again only as far as needed, when the scene sharpens the texture (`detail()`).
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
      const file = this.manager.resolveURL(this.path + url), maxPx = this.textureDetail?.maxPx?.(url), streamed = this.textureDetail?.streamed === true;
      const parse = (buffer: ArrayBuffer) => new Promise<CompressedTexture>((resolve, reject) => { this.parse(buffer, resolve, reject); });
      pending = maxPx === undefined && !streamed ? fetchBinary(file).then(parse) : fetchBinaryStart(file, received => firstReadEnd(received, maxPx, streamed)).then(async start => {
        const end = firstReadEnd(start, maxPx, streamed), skipped = skippedOf(start, maxPx, streamed);
        if (end === undefined || !skipped || end > start.length) return parse(start.slice().buffer);
        const texture = await parse(withoutLargestLevels(start, end, skipped.dropped + skipped.later));
        if (!skipped.later) return texture;
        // The levels in between: the file as far as its largest kept level, read on a worker.
        const keptEnd = skipped.dropped ? levelEnd(start, skipped.dropped) : undefined;
        let levels: Promise<MipLevel[]> | undefined;
        this.details.set(texture, () => levels ??= fetchBinaryInBackground(file, keptEnd)
          .then(bytes => parse(keptEnd === undefined ? bytes : withoutLargestLevels(new Uint8Array(bytes), keptEnd, skipped.dropped)))
          .then(kept => (kept.mipmaps as MipLevel[]).slice(0, skipped.later)));
        return texture;
      });
      this.cache.set(url, pending);
      pending.catch(() => { if (this.cache.get(url) === pending) this.cache.delete(url); });
    }
    void pending.then(onLoad, onError);
  }

  /** How to read the levels of a texture this loader returned on its reduced levels, to come later; undefined otherwise. */
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
