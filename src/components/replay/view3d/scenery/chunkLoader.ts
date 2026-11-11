import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Mesh, type Material, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneryChunk, SceneryTexture } from '../../../../../shared/types/scenes/scenery.js';
import { fetchSceneryChunk, SCENERY_FILES } from '../../../../api/sceneryApi.js';
import { disposeObjects } from '../laps/disposeObjects.js';
import { CachedKtx2Loader } from './cachedKtx2Loader.js';
import { configureSurfaceMaterial, createSharedSurfaceMaterials } from './materials/configureSurfaceMaterial.js';
import { createSurfaceTexturePool, imageUriMap } from './materials/textureSource.js';

export interface ChunkLoader {
  /** `onParsed` gets the root once its meshes exist, before their textures load: work that needs only geometry starts there. */
  load(chunk: SceneryChunk, signal: AbortSignal, onParsed?: (root: Object3D) => void): Promise<Object3D>;
  releaseChunk(root: Object3D): void;
  dispose(): void;
}

/**
 * Per-mesh rules: the virtual screen framebuffer never draws; a mesh casts shadow when the package's flag says so (the
 * node's `extras.lmuCastShadow`, the scene's ShadowCaster: road, terrain and ground never cast). Everything receives.
 */
export function prepareSceneryMesh(mesh: Mesh): void {
  mesh.receiveShadow = true;
  if (mesh.name.toLowerCase().includes('screenframebuffer')) mesh.visible = false;
  mesh.castShadow = mesh.userData.lmuCastShadow === true;
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
  const maxPx = new Map(textures.map(texture => [`${SCENERY_FILES}textures/${texture.sha256}.ktx2.zst`, texture.maxPx]));
  const ktx2 = new CachedKtx2Loader(renderer, {maxPx: url => maxPx.get(url), streamed: true});
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).register(skipSurfaceTextures);
  const pool = createSurfaceTexturePool(ktx2, renderer, SCENERY_FILES);
  const sources = new WeakMap<Object3D, ReturnType<typeof pool.source>>(), materials = createSharedSurfaceMaterials();
  const releaseChunk = (root: Object3D) => {
    // Each mesh gives back its use of a shared material; the registry disposes one when no chunk uses it.
    root.traverse(object => { if (object instanceof Mesh) materials.release(object.material as Material); });
    disposeObjects(root, true, false, material => materials.owns(material));
    sources.get(root)?.dispose();
    sources.delete(root);
  };
  return {
    async load(chunk, signal, onParsed) {
      const bytes = await fetchSceneryChunk(chunk, signal);
      signal.throwIfAborted();
      const parsed = await gltf.parseAsync(bytes, SCENERY_FILES), root = parsed.scene;
      try {
        const source = pool.source(imageUriMap(parsed.parser.json as Parameters<typeof imageUriMap>[0]));
        sources.set(root, source);
        const meshes: Mesh[] = [];
        root.traverse(object => { if (object instanceof Mesh) { const mesh = object as Mesh; prepareSceneryMesh(mesh); meshes.push(mesh); } });
        onParsed?.(root);
        await Promise.all(meshes.map(mesh => configureSurfaceMaterial(mesh, source, false, materials)));
        signal.throwIfAborted();
      } catch (error) { releaseChunk(root); throw error; }
      return root;
    },
    releaseChunk,
    dispose: () => { pool.dispose(); ktx2.dispose(); },
  };
}
