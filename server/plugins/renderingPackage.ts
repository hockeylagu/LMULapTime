import { parseRenderingIndex, renderingCloudMapFiles, type RenderingProfiles } from '../../shared/packageContract/index.js';
import { readPackageFile, registerPackageFile } from './packageFiles.js';

const MAX_MAP_BYTES = 16_000_000;

/**
 * The rendering profiles (`rendering/index.json`) for the package's layouts. Every cloud map file the sky names (`rendering/<sha256>.bin`) is registered
 * and read once to check its hash: they are small (a few MB in all) and the client slices their mips (`shared/domain/scenery/cloudMaps.ts`).
 */
export function loadRenderingPackage(root: string, index: unknown, layoutKeys: readonly string[]): RenderingProfiles {
  const rendering = parseRenderingIndex(index, { layoutKeys });
  for (const { path, sha256, byteLength } of renderingCloudMapFiles(rendering)) readPackageFile(root, registerPackageFile(root, path, sha256, byteLength, MAX_MAP_BYTES));
  return rendering;
}
