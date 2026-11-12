import { renderingBinPath, type CloudMapFile } from '../../packageContract/index.js';
import type { SceneryClouds, SceneryCloudsFile } from '../../types/scenes/clouds.js';

/** The mip levels of a cloud map from its file: level `i` starts after the `mipByteLengths` before it (docs/PACKAGE_FORMAT.md, Rendering). */
export function cloudMapLevels(map: CloudMapFile, bytes: Uint8Array): Uint8Array[] {
  if (bytes.byteLength !== map.byteLength) throw Error(`Cloud map file ${map.sha256}: ${bytes.byteLength} bytes, expected ${map.byteLength}`);
  let at = 0;
  return map.mipByteLengths.map(length => { const level = bytes.slice(at, at + length); at += length; return level; });
}

/** Every distinct file the cloud field's maps name, by `rendering/<sha256>.bin` path. */
export function cloudMapFiles(clouds: SceneryCloudsFile): Map<string, CloudMapFile> {
  const files = new Map<string, CloudMapFile>();
  for (const map of [...Object.values(clouds.maps), ...Object.values(clouds.lightMaps)]) files.set(renderingBinPath(map.sha256), map);
  return files;
}

/** The cloud field with its maps' mip bytes read from `files` (the content of each `cloudMapFiles` path). */
export function loadClouds(clouds: SceneryCloudsFile, files: ReadonlyMap<string, Uint8Array>): SceneryClouds {
  const levels = (map: CloudMapFile) => {
    const bytes = files.get(renderingBinPath(map.sha256));
    if (!bytes) throw Error(`Cloud map file ${map.sha256} was not loaded`);
    return cloudMapLevels(map, bytes);
  };
  return {
    ...clouds,
    maps: Object.fromEntries(Object.entries(clouds.maps).map(([key, map]) => [key, { width: map.width, height: map.height, mips: levels(map) }])),
    lightMaps: Object.fromEntries(Object.entries(clouds.lightMaps).map(([key, map]) => [key, { width: map.width, height: map.height, channels: map.channels, mips: levels(map) }])),
  };
}
