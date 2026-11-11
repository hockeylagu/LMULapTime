import { CompressedTexture, TextureSource, WebGLUtils, type Texture, type TypedArray, type WebGLRenderer } from 'three';

/**
 * Mip streaming, the standard way engines sharpen large textures without a stall: a large scenery texture allocates its whole
 * mip chain once, fills only the levels from `STREAMED_LEVELS` down and samples from there (`TEXTURE_BASE_LEVEL`). The scene
 * then copies the missing top levels into that same GPU texture, a band of rows at a time within a per-frame byte budget, and
 * lowers the base level as each level completes. No second allocation and no upload bigger than the budget, whatever the size.
 * Small textures load whole.
 */
export const STREAMED_LEVELS = 2;
const STREAMED_MIN_PX = 512;
/** Every compressed format the package holds (BCn) is in 4×4 blocks: a band starts and ends on a block row. */
const BLOCK_ROWS = 4;

interface MipLevel { data: TypedArray; width: number; height: number }
/** `level` is the level being filled (counting down to 0) and `row` its next pixel row. */
interface Stream { levels: MipLevel[]; level: number; row: number }
const streams = new WeakMap<Texture, Stream>();
const formats = new WeakMap<WebGLRenderer, WebGLUtils>();

/** Makes a large texture start on its reduced levels; three allocates the full chain on its first upload. */
export function startStreaming(texture: Texture, renderer: WebGLRenderer): void {
  const levels = texture.mipmaps as MipLevel[];
  if (levels.length <= STREAMED_LEVELS || Math.min(levels[0].width, levels[0].height) < STREAMED_MIN_PX) return;
  // Its own source: the texture is a clone sharing the loader's cached original, whose data other chunks still upload from.
  // Without data, three only allocates storage for every level in `mipmaps`.
  const source = new TextureSource({width: levels[0].width, height: levels[0].height});
  source.dataReady = false;
  texture.source = source;
  const stream: Stream = {levels, level: STREAMED_LEVELS - 1, row: 0};
  streams.set(texture, stream);
  // Runs right after each allocation, with the texture bound: refill the reduced levels and sample only those, or every level
  // once the texture had finished streaming (a later allocation would otherwise leave its storage empty).
  texture.onUpdate = () => {
    const from = streams.has(texture) ? STREAMED_LEVELS : 0;
    stream.level = STREAMED_LEVELS - 1; stream.row = 0;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    for (let level = from; level < levels.length; level++) uploadRows(texture, renderer, levels[level], level, 0, levels[level].height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, from);
  };
}

/** True while a texture still samples from a reduced level. */
export function isStreaming(texture: Texture): boolean {
  return streams.has(texture);
}

/** Forgets a texture's missing levels and stops refilling it (its chunks released it). */
export function stopStreaming(texture: Texture): void {
  streams.delete(texture);
  texture.onUpdate = null;
}

/**
 * Copies up to `budgetBytes` of a texture's missing levels (at least one band) and returns the bytes copied: 0 when it is
 * full, released or not on the GPU yet. A level joins the sampled range when its last band lands.
 */
export function streamTexture(texture: Texture, renderer: WebGLRenderer, budgetBytes: number): number {
  const stream = streams.get(texture), gpu = renderer.properties.has(texture) ? (renderer.properties.get(texture) as {__webglTexture?: WebGLTexture}).__webglTexture : undefined;
  if (!stream || !gpu) return 0;
  const gl = renderer.getContext() as WebGL2RenderingContext, unit = texture instanceof CompressedTexture ? BLOCK_ROWS : 1;
  renderer.state.bindTexture(gl.TEXTURE_2D, gpu);
  let copied = 0;
  do {
    const level = stream.levels[stream.level], bytesPerUnit = level.data.byteLength / Math.ceil(level.height / unit);
    const units = Math.max(1, Math.floor((budgetBytes - copied) / bytesPerUnit)), rows = Math.min(level.height - stream.row, units * unit);
    copied += uploadRows(texture, renderer, level, stream.level, stream.row, rows);
    stream.row += rows;
    if (stream.row < level.height) continue;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, stream.level);
    stream.level--; stream.row = 0;
  } while (copied < budgetBytes && stream.level >= 0);
  if (stream.level < 0) streams.delete(texture);
  return copied;
}

/** Copies rows `row..row+rows` of one level into the bound texture; returns the bytes copied. */
function uploadRows(texture: Texture, renderer: WebGLRenderer, level: MipLevel, index: number, row: number, rows: number): number {
  const gl = renderer.getContext() as WebGL2RenderingContext, {state} = renderer;
  let utils = formats.get(renderer);
  if (!utils) { utils = new WebGLUtils(gl, renderer.extensions); formats.set(renderer, utils); }
  // The same format three allocated with (sRGB variants included), so the sub-image matches the storage.
  const format = utils.convert(texture.format, texture.colorSpace);
  if (format === null) throw Error(`Scenery texture format ${texture.format} is not supported by this GPU`);
  const unit = texture instanceof CompressedTexture ? BLOCK_ROWS : 1, perUnit = level.data.length / Math.ceil(level.height / unit);
  const end = Math.min(level.height, row + rows), band = level.data.subarray(row / unit * perUnit, Math.ceil(end / unit) * perUnit);
  if (texture instanceof CompressedTexture) state.compressedTexSubImage2D(gl.TEXTURE_2D, index, 0, row, level.width, end - row, format, band);
  else {
    const type = utils.convert(texture.type);
    if (type === null) throw Error(`Scenery texture type ${texture.type} is not supported by this GPU`);
    // Unpack state is shared: another upload may have left a flip or premultiply on, which would corrupt raw rows.
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); state.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    state.texSubImage2D(gl.TEXTURE_2D, index, 0, row, level.width, end - row, format, type, band);
  }
  return band.byteLength;
}
