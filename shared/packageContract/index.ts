// Copied from LMUTrackPipeline/shared/contract/index.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * The package contract (docs/PACKAGE_FORMAT.md as code): the schema, the derived file paths, the types of everything a package publishes and the strict
 * structural parsers that take already-parsed JSON. Dependency-free and environment-free; the app has a one-way copy (`npm run package -- sync-contract`).
 * File contents (hashes, GLB and KTX2 internals, budgets) are not part of it.
 */
export * from './paths.js';
export * from './strict.js';
export * from './manifest.js';
export * from './tracks.js';
export * from './textures.js';
export * from './vehicles.js';
export * from './bodyDescriptor.js';
export * from './scenery.js';
export * from './renderingTypes.js';
export {parseRenderingIndex, renderingCloudMapFiles, renderingLayoutKeyProblems, expectedMipByteLengths, RENDERING_KEYS} from './rendering.js';
export * from './shadows.js';
