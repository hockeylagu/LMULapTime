import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Mesh, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneryChunk } from '../../../../../shared/types/scenes/scenery.js';
import { fetchSceneryChunk, SCENERY_FILES } from '../../../../api/sceneryApi.js';
import { disposeObjects } from '../laps/disposeObjects.js';
import { CachedKtx2Loader } from './cachedKtx2Loader.js';
import { configureSurfaceMaterial } from './materials/configureSurfaceMaterial.js';
import { createSurfaceTexturePool, imageUriMap } from './materials/textureSource.js';

export interface ChunkLoader {
  load(chunk: SceneryChunk, signal: AbortSignal): Promise<Object3D>;
  releaseChunk(root: Object3D): void;
  /** Frees the cached texture file of a package-relative KTX2 path (its last chunk unloaded). */
  releaseTexture(asset: string): void;
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

export function createChunkLoader(renderer: WebGLRenderer): ChunkLoader {
  startDecoderWorkers();
  const ktx2 = new CachedKtx2Loader(renderer), gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const textures = createSurfaceTexturePool(ktx2, renderer, SCENERY_FILES);
  const sources = new WeakMap<Object3D, ReturnType<typeof textures.source>>();
  const releaseChunk = (root: Object3D) => {
    disposeObjects(root, true, false);
    sources.get(root)?.dispose();
    sources.delete(root);
  };
  return {
    async load(chunk, signal) {
      const bytes = await fetchSceneryChunk(chunk, signal);
      signal.throwIfAborted();
      const parsed = await gltf.parseAsync(bytes, SCENERY_FILES), root = parsed.scene;
      try {
        const source = textures.source(imageUriMap(parsed.parser.json as Parameters<typeof imageUriMap>[0]));
        sources.set(root, source);
        const meshes: Mesh[] = [];
        root.traverse(object => { if (object instanceof Mesh) { const mesh = object as Mesh; prepareSceneryMesh(mesh); meshes.push(mesh); } });
        await Promise.all(meshes.map(mesh => configureSurfaceMaterial(mesh, source, false)));
        signal.throwIfAborted();
      } catch (error) { releaseChunk(root); throw error; }
      return root;
    },
    releaseChunk,
    releaseTexture: asset => ktx2.release(`${SCENERY_FILES}${asset.replace(/^scenery\//, '')}`),
    dispose: () => { textures.dispose(); ktx2.dispose(); },
  };
}
