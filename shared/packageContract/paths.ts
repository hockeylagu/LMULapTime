// Copied from LMUTrackPipeline/shared/contract/paths.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * Where the files of a package are (docs/PACKAGE_FORMAT.md): the schema, the five fixed catalog paths and every path the catalogs do not state because
 * it is derived from a hash or a folder name. The one place these rules are written.
 */

/** The only package schema the tools and the app read. */
export const PACKAGE_SCHEMA = 11;

/** The catalog files of every package, release or debug. These paths are constants of the schema: the manifest names none. */
export const PACKAGE_FILES = {tracks: 'tracks/index.json', vehicles: 'vehicles/index.json', logos: 'vehicles/logos.json', scenery: 'scenery/index.json', rendering: 'rendering/index.json'} as const;
export const MANIFEST_FILE = 'manifest.json';

/** `tracks/<layoutKey>.json` */
export const trackLayoutPath = (layoutKey: string): string => `tracks/${layoutKey}.json`;

/** Scenery chunk GLB and texture (or start) file of a content hash. */
export const sceneryChunkPath = (sha256: string): string => `scenery/${sha256}.glb`;
export const sceneryTexturePath = (sha256: string): string => `scenery/textures/${sha256}.ktx2.zst`;

/** Vehicle body GLB (exterior or interior), texture (or start) file and descriptor. */
export const bodyGlbPath = (sha256: string): string => `vehicles/${sha256}.glb`;
export const bodyTexturePath = (sha256: string): string => `vehicles/textures/${sha256}.ktx2.zst`;
export const bodyDescriptorPath = (folder: string): string => `vehicles/bodies/${folder}.json`;
/** A texture path as the body descriptor writes it: relative to `vehicles/`. */
export const descriptorTexturePath = (sha256: string): string => `textures/${sha256}.ktx2.zst`;
/** Matches a descriptor-relative texture path. */
export const DESCRIPTOR_TEXTURE_PATH = /^textures\/[0-9a-f]{64}\.ktx2\.zst$/;

/** One cloud map's decoded mips of the rendering profiles. */
export const RENDERING_FOLDER = 'rendering';
export const renderingBinPath = (sha256: string): string => `${RENDERING_FOLDER}/${sha256}.bin`;

/** Characters a layout key, a body folder name and a vehicle id may have. */
export const LAYOUT_KEY = /^[a-z0-9_]+$/;
export const BODY_FOLDER = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
