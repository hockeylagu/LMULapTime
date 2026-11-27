import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Mesh, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneryChunkFile, SceneryTexture } from '../../../../../shared/types/scenes/scenery.js';
import { fetchSceneryChunk, SCENERY_FILES } from '../../../../api/sceneryApi.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import { CachedKtx2Loader } from './cachedKtx2Loader.js';
import { configureSurfaceMaterial, createSharedSurfaceMaterials } from './materials/configureSurfaceMaterial.js';
import { createSurfaceTexturePool, imageUriMap } from './materials/textureSource.js';

export interface ChunkLoader {
  /** `onParsed` gets the root once its meshes exist, before their textures load: work that needs only geometry starts there. */
  load(chunk: SceneryChunkFile, signal: AbortSignal, onParsed?: (root: Object3D) => void): Promise<Object3D>;
  /** Frees every chunk it parsed with their materials and textures: chunks stay loaded until the scene goes. */
  dispose(): void;
}

/**
 * Per-mesh rules: the virtual screen framebuffer never draws; a mesh casts shadow when the package's flag says so (the
 * node's `extras.lmuCastShadow`, the scene's ShadowCaster: road, terrain and ground never cast). Everything receives but the
 * filler ground: it sits just under the road, so a car shadow on it would show through from below road level. The mesh keeps its
 * GLB material's package key (`extras.lmuMaterial`): materials that draw alike share one configured material, which keeps the key of
 * the first, and the batches go by each mesh's own key. A node the game switches (`extras.lmuVisibility`) stays visible here, in every
 * state, so the chunk's warm-up compiles and uploads it; the scene's night switch then shows only the current state's
 * (night/nightSwitch.ts), and switching later costs no upload.
 */
export function prepareSceneryMesh(mesh: Mesh): void {
  mesh.receiveShadow = !mesh.name.startsWith('FILLER_GROUND');
  if (mesh.name.toLowerCase().includes('screenframebuffer')) mesh.visible = false;
  mesh.castShadow = mesh.userData.lmuCastShadow === true;
  const packageKey: unknown = Array.isArray(mesh.material) ? undefined : mesh.material.userData.lmuMaterial;
  if (typeof packageKey === 'string') mesh.userData.lmuMaterial = packageKey;
}

/**
 * Streams scenery chunk GLBs; their `textures/<sha256>.ktx2.zst` image URIs resolve beside the chunk file. Every mesh's native
 * material is rebuilt from the GLB's surface description before the chunk is handed over.
 */
/** Meshopt decoding runs in workers (where the runtime has them): decoding a chunk's geometry on the main thread stalled playback. */
let decoderWorkers = false;
function startDecoderWorkers(): void {
  if (decoderWorkers || typeof Worker !== 'function') return;
  decoderWorkers = true;
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- meshopt's worker switch, not a React hook
  MeshoptDecoder.useWorkers(2);
}

interface GlbMaterial { extras?: { lmuSurface?: unknown }; pbrMetallicRoughness?: Record<string, unknown>; [slot: string]: unknown }
const TEXTURE_SLOTS = ['normalTexture', 'occlusionTexture', 'emissiveTexture'] as const;

/**
 * A material with a surface description samples the maps the surface program loads (configureSurfaceMaterial), never its glTF
 * texture slots: the loader skips those, so parsing a chunk does not wait for its albedo files and makes no unused clones.
 * Materials without one keep their glTF textures.
 */
export function skipSurfaceTextures(parser: GLTFParser): GLTFLoaderPlugin {
  return {
    name: 'lmu_surface_textures',
    beforeRoot() {
      for (const material of (parser.json as { materials?: GlbMaterial[] }).materials ?? []) {
        if (!material.extras?.lmuSurface) continue;
        for (const slot of TEXTURE_SLOTS) delete material[slot];
        delete material.pbrMetallicRoughness?.baseColorTexture; delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
      }
      return null;
    },
  };
}

/** `textures` is the layout's texture list: a texture loads no larger than the size the package gives it there (`maxPx`). */
export function createChunkLoader(renderer: WebGLRenderer, textures: readonly SceneryTexture[]): ChunkLoader {
  startDecoderWorkers();
  const file = (sha256: string) => `${SCENERY_FILES}textures/${sha256}.ktx2.zst`;
  const rows = new Map(textures.map(texture => [file(texture.sha256), texture]));
  const ktx2 = new CachedKtx2Loader(renderer, {maxPx: url => rows.get(url)?.maxPx, start: url => { const row = rows.get(url); return row?.start && {url: file(row.start.sha256), skip: row.levels - row.start.levels}; }});
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).register(skipSurfaceTextures);
  const pool = createSurfaceTexturePool(ktx2, renderer, SCENERY_FILES), materials = createSharedSurfaceMaterials();
  /** Every chunk parsed, joined to the scene or not: a chunk's own geometry and glTF materials go with the loader. */
  const roots = new Set<Object3D>();
  let disposed = false;
  const free = (root: Object3D) => disposeObjects(root, true, false, material => materials.owns(material));
  return {
    async load(chunk, signal, onParsed) {
      const bytes = await fetchSceneryChunk(chunk, signal);
      signal.throwIfAborted();
      const parsed = await gltf.parseAsync(bytes, SCENERY_FILES), root = parsed.scene;
      if (disposed) { free(root); throw new DOMException('Scenery chunk loader disposed', 'AbortError'); }
      roots.add(root);
      const source = pool.source(imageUriMap(parsed.parser.json as Parameters<typeof imageUriMap>[0]));
      const meshes: Mesh[] = [];
      root.traverse(object => { if (object instanceof Mesh) { const mesh = object as Mesh; prepareSceneryMesh(mesh); meshes.push(mesh); } });
      onParsed?.(root);
      await Promise.all(meshes.map(mesh => configureSurfaceMaterial(mesh, source, false, materials)));
      signal.throwIfAborted();
      return root;
    },
    dispose() {
      disposed = true;
      for (const root of roots) free(root);
      roots.clear(); materials.dispose(); pool.dispose(); ktx2.dispose();
    },
  };
}
