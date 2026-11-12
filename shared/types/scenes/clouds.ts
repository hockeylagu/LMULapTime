/** The package's cloud field and sun visibility rule (rendering/index.json, `sky.clouds` and `shading.sunVisibility`). All values come from the package. */
import type { SceneryClouds as PackageClouds } from '../../packageContract/index.js';

export type { CloudMapFile, SceneryCloudLayer, SceneryCloudLight, SceneryCloudMaterial, SceneryCloudMesh, SceneryCloudType, ScenerySunVisibility } from '../../packageContract/index.js';

/** The cloud field as the package states it: each map names the file `rendering/<sha256>.bin` that holds its mips. */
export type SceneryCloudsFile = PackageClouds;

/** A cloud map's decoded mip levels, largest first: 8-bit, row-major, channels interleaved; level `i` is max(1, width >> i) by max(1, height >> i). */
export interface CloudMapLevels { width: number; height: number; mips: Uint8Array[] }

/** The cloud field as the viewer uses it: the maps hold their decoded mip bytes (`loadClouds`). */
export type SceneryClouds = Omit<PackageClouds, 'maps' | 'lightMaps'> & {
  /** Opacity maps (one channel). */
  maps: Record<string, CloudMapLevels>;
  /** Maps that light a cloud: `channels` values per texel (1 density, 3 a side or end map). */
  lightMaps: Record<string, CloudMapLevels & { channels: 1 | 3 }>;
};
