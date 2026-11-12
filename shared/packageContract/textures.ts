// Copied from LMUTrackPipeline/shared/contract/textures.ts, do not edit: change it there and run npm run package -- sync-contract.
/** Texture start files (docs/PACKAGE_FORMAT.md, Textures), the same row in the scenery texture table and in a vehicle body's texture rows. */
import {exactKeys, positiveCount, record, sha256} from './strict.js';

/** A texture's start file: the same texture from its third level down (a quarter of the width and height), a complete content-named KTX2 of its own. */
export interface TextureStart {sha256: string; byteLength: number; width: number; height: number; levels: number; gpuBytes: number}

export const TEXTURE_START_KEYS = ['sha256', 'byteLength', 'width', 'height', 'levels', 'gpuBytes'] as const;

/**
 * A texture row's `start`: exactly its keys, all counts positive. Where the row states its own size (`full`, the scenery table), the start must be that texture
 * from its third level down, and only a texture of more than two levels with a smaller side of at least 512 px has one.
 */
export function parseTextureStart(value: unknown, what: string, full: {width: number; height: number; levels: number} | null = null): TextureStart {
  const start = record(value, what);
  exactKeys(start, TEXTURE_START_KEYS, what);
  sha256(start.sha256, `${what}.sha256`);
  for (const key of TEXTURE_START_KEYS.slice(1)) positiveCount(start[key], `${what}.${key}`);
  if (full) {
    if (full.levels <= 2 || Math.min(full.width, full.height) < 512) throw Error(`${what}: the texture is too small for a start file`);
    if (start.width !== full.width >> 2 || start.height !== full.height >> 2 || start.levels !== full.levels - 2) throw Error(`${what}: not the texture from its third level down`);
  }
  return value as TextureStart;
}
