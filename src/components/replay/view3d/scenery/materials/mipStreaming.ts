import { TextureSource, type Texture, type TypedArray, type WebGLRenderer } from 'three';
import { startFocus } from '../textureFocus.js';

/**
 * Mip streaming: a large texture first draws from its reduced levels (the levels of its start file, which the package gives every
 * large texture) and sharpens later in one step: the texture gets a new source sized to the full image and every level in
 * `mipmaps`, and three, which keys a texture's GPU storage by its source, allocates and uploads the whole chain. The programs that
 * read it then bring it into focus over a moment (`textureFocus.ts`). A texture without a start file loads whole.
 *
 * Once a texture is whole on the GPU its levels are let go (size-only placeholders in `mipmaps`, and the loader's cached copy):
 * the GPU holds them now. A texture is never uploaded again; a lost context ends the scene.
 */
export interface MipLevel { data: TypedArray; width: number; height: number }
/** A texture's file in the loader: `drop` frees the loader's own copy of its levels. */
export interface LevelFile { drop: () => void }
/** The `missing` levels above those a texture was read with; `load` fetches them, largest first. */
export interface DetailLoader extends LevelFile { missing: number; load(): Promise<MipLevel[]> }
/**
 * `reduced` are the levels the texture draws from first, `above` the `missing` levels over them (empty until `detail` has
 * loaded them). `detail` is set until the missing levels are requested, `waiting` until they arrive, `failed` when they could not
 * be read. `onGpu` is set at the first upload, and `uploaded` runs then. `swapping` marks the dispose that frees the reduced storage.
 */
interface Stream { reduced: MipLevel[]; above: MipLevel[]; missing: number; onGpu: boolean; swapping: boolean; detail?: DetailLoader; waiting?: boolean; failed?: boolean; uploaded?: () => void }
/** Detail requests in flight at once: enough to keep the per-frame budget fed without holding every file in memory ahead of its turn. */
const DETAIL_REQUESTS = 8;
let detailRequests = 0;
const streams = new WeakMap<Texture, Stream>();

/**
 * Makes a texture read from its start file sharpen later: with `detail`, it holds only the start file's levels and the ones above
 * are fetched when it sharpens. `file` (the detail's by default) is what is let go once the texture is whole; a texture read whole
 * (no `detail`) streams nothing but is let go the same (`releaseOnUpload`).
 */
export function startStreaming(texture: Texture, detail?: DetailLoader, file: LevelFile | undefined = detail): void {
  if (detail) install(texture, detail.missing, file, detail);
  else if (file) releaseOnUpload(texture, file);
}

/**
 * A texture read whole: its levels go to the GPU at its first upload and are let go right after, so neither the texture nor the
 * loader's cache keeps a copy.
 */
export function releaseOnUpload(texture: Texture, file: LevelFile): void {
  install(texture, 0, file);
}

/** A source sized to the top of `levels`. */
function sourceOf(levels: MipLevel[]): TextureSource<unknown> {
  return new TextureSource({width: levels[0].width, height: levels[0].height});
}

/**
 * Gives the texture its own source (it is a clone sharing the loader's cached original, whose data other chunks still upload
 * from; and three skips the upload of a second texture on a shared source) and lets the levels go in `onUpdate`, which three
 * runs after each upload. `missing` top levels stream in later.
 */
function install(texture: Texture, missing: number, file?: LevelFile, detail?: DetailLoader): void {
  const reduced = texture.mipmaps as MipLevel[];
  texture.source = sourceOf(reduced);
  // Only the file's `drop` is kept, not the detail loader (its closure holds the fetched levels).
  const drop = file?.drop, stream: Stream = {reduced, above: [], missing, onGpu: false, swapping: false, detail};
  let whole = false;
  if (missing) streams.set(texture, stream);
  const release = () => {
    if (stream.swapping) return;
    streams.delete(texture);
    texture.onUpdate = null;
    texture.removeEventListener('dispose', release);
  };
  texture.addEventListener('dispose', release);
  texture.onUpdate = () => {
    if (whole) throw Error('A texture let its levels go and was uploaded again');
    if (streams.has(texture)) {
      stream.onGpu = true;
      const run = stream.uploaded;
      stream.uploaded = undefined;
      run?.();
      return;
    }
    // Whole on the GPU: placeholders keep the levels' sizes, and the loader's copy goes.
    whole = true;
    texture.mipmaps = (texture.mipmaps as MipLevel[]).map(({width, height}) => ({data: new Uint8Array(0), width, height}));
    drop?.();
  };
}

/**
 * Runs `run` once a streaming texture is on the GPU: now if it is, else right after its first upload. It can only sharpen from
 * then on, and a texture nothing draws is never uploaded.
 */
export function whenUploaded(texture: Texture, run: () => void): void {
  const stream = streams.get(texture);
  if (!stream) return;
  if (stream.onGpu) run(); else stream.uploaded = run;
}

/** True while a texture still draws from its reduced levels. */
export function isStreaming(texture: Texture): boolean {
  const stream = streams.get(texture);
  return stream !== undefined && !stream.failed;
}

/** The pixel count of a streaming texture's top level once sharp (0 for one that is not streaming). */
export function fullPixels(texture: Texture): number {
  const stream = streams.get(texture);
  return stream ? stream.reduced[0].width * stream.reduced[0].height * 4 ** stream.missing : 0;
}

/**
 * Sharpens a texture in one step if its full levels are in memory; returns the bytes uploaded: 0 when it is sharp, released, not
 * on the GPU yet or waiting for its missing levels (requested here, a few files at a time).
 */
export function streamTexture(texture: Texture, renderer: WebGLRenderer): number {
  const stream = streams.get(texture);
  if (!stream?.onGpu) return 0;
  if (stream.detail && detailRequests < DETAIL_REQUESTS) {
    const load = stream.detail;
    stream.detail = undefined; stream.waiting = true; detailRequests++;
    void load.load().then(detail => {
      if (streams.get(texture) !== stream) return;
      if (detail.length !== stream.missing || detail[0].width !== stream.reduced[0].width << stream.missing || detail[0].height !== stream.reduced[0].height << stream.missing) throw Error('A texture file does not hold the levels above its start file');
      stream.above = detail;
      stream.waiting = false;
    }).catch((error: unknown) => {
      if (streams.get(texture) !== stream) return;
      // The texture stays on its reduced levels; the failed read is reported, not hidden.
      stream.failed = true;
      reportError(error);
    }).finally(() => { detailRequests--; });
  }
  if (stream.detail || stream.waiting || stream.failed) return 0;
  const levels = [...stream.above, ...stream.reduced];
  // Three keys a texture's GPU storage by its source and parameters, not by its levels: dispose frees the reduced storage (the
  // texture stays usable), and the new source then makes three allocate and upload the full chain at the next use, here.
  stream.swapping = true;
  texture.dispose();
  stream.swapping = false;
  streams.delete(texture);
  stream.above = []; stream.reduced = [];
  texture.source = sourceOf(levels);
  texture.mipmaps = levels;
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  startFocus(texture, stream.missing);
  return levels.reduce((sum, level) => sum + level.data.byteLength, 0);
}
