// Copied from LMUTrackPipeline/shared/contract/textures.ts, do not edit: change it there and run npm run package -- sync-contract.
/** Texture start files (docs/PACKAGE_FORMAT.md, Textures), the same row in the scenery texture table and in a vehicle body's texture rows. */
import {exactKeys, positiveCount, record, sha256} from './strict.js';

/**
 * A texture's start file: the same texture from a lower level down (at least two levels, at most `START_FILE_MAX_PX` on its longer side, or
 * `START_FILE_MAX_PX_BC5` for BC5 normal maps), a complete content-named KTX2 of its own.
 */
export interface TextureStart {sha256: string; byteLength: number; width: number; height: number; levels: number; gpuBytes: number}

export const TEXTURE_START_KEYS = ['sha256', 'byteLength', 'width', 'height', 'levels', 'gpuBytes'] as const;

/** The longest side of a start file, and of a BC5 (two-channel normal map) start file. */
export const START_FILE_MAX_PX = 256;
export const START_FILE_MAX_PX_BC5 = 128;
/** Levels a start file leaves out at least. */
export const START_FILE_MIN_DROP = 2;

/** A texture's size and level count, and its KTX format name (`BC5_UNORM_BLOCK`, ...) when known. */
export interface TextureSize {width: number; height: number; levels: number; format?: string}

/**
 * The levels a texture's start file leaves out, or null when the texture is too small for one (two levels or fewer, or a smaller side below 512 px):
 * the first level at least `START_FILE_MIN_DROP` down whose longer side is at most `START_FILE_MAX_PX` (`START_FILE_MAX_PX_BC5` for BC5), never the
 * last level. Without a format, the BC5 limit cannot be told apart and the colour limit is used.
 */
export function textureStartDrop(full: TextureSize): number | null {
  if (full.levels <= START_FILE_MIN_DROP || Math.min(full.width, full.height) < 512) return null;
  const limit = full.format?.startsWith('BC5') ? START_FILE_MAX_PX_BC5 : START_FILE_MAX_PX, longer = Math.max(full.width, full.height);
  let drop = START_FILE_MIN_DROP;
  while ((longer >> drop) > limit && drop + 1 < full.levels) drop++;
  return drop;
}

/**
 * A texture row's `start`: exactly its keys, all counts positive. Where the row states its own size and format (`full`, the scenery table), only a
 * texture of more than two levels with a smaller side of at least 512 px has one, and it must be that texture from `textureStartDrop` levels down.
 */
export function parseTextureStart(value: unknown, what: string, full: TextureSize | null = null): TextureStart {
  const start = record(value, what);
  exactKeys(start, TEXTURE_START_KEYS, what);
  sha256(start.sha256, `${what}.sha256`);
  for (const key of TEXTURE_START_KEYS.slice(1)) positiveCount(start[key], `${what}.${key}`);
  if (full) {
    const drop = textureStartDrop(full);
    if (drop === null) throw Error(`${what}: the texture is too small for a start file`);
    if (start.width !== full.width >> drop || start.height !== full.height >> drop || start.levels !== full.levels - drop) throw Error(`${what}: not the texture from level ${drop} down`);
  }
  return value as TextureStart;
}
