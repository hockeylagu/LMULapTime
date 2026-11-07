import {BufferAttribute, BufferGeometry, DoubleSide, Mesh, Ray, Vector3, type Object3D} from 'three';
import type {MeshBVH} from 'three-mesh-bvh';
import {GenerateMeshBVHWorker} from 'three-mesh-bvh/worker';

interface NativePosition { x: number; y: number; z: number }
/** Highest surface from 0.15 m above `point.y` down to `reach` metres below it (native coordinates). */
export type SurfaceHeight = (point: NativePosition, reach?: number) => number | null;

/** Scenery nodes are named `<material>__<kind>`; the filler ground is the generic estimate under the scanned surfaces. */
const isFillerGround = (name: string) => name.startsWith('FILLER_GROUND');
/** Opaque scanned surfaces (road, kerb, terrain, walls) can hold a wheel; masks, blends and decals cannot. */
const isOpaqueSurface = (name: string) => !isFillerGround(name) && /__OPAQUE(?:__|$)/.test(name);
const GROUND_NAMES = ['terrain', 'road', 'kerb', 'panorama', 'grass'];

export function isSceneryGround(name: string): boolean {
  const lowerName = name.toLowerCase();
  return GROUND_NAMES.some(ground => lowerName.includes(ground));
}

/** What a triangle is used for: wheel and racing-line contact, camera ground and obstruction checks, or both. */
const WHEEL = 1, CAMERA = 2;
const roleOf = (name: string) => (isOpaqueSurface(name) ? WHEEL : 0) | (isFillerGround(name) || (isOpaqueSurface(name) && isSceneryGround(name)) ? CAMERA : 0);
const GROUND_CLEARANCE_M = 1.2, OBSTRUCTION_CLEARANCE_M = 0.6, SURFACE_ABOVE_M = 0.15;
/** BVH workers: one job each at a time, so several chunks build at once (the parallel builder needs cross-origin isolation). */
const WORKER_COUNT = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));

/**
 * The chunk's ground meshes as one position-only geometry in the root's world frame, with each triangle's role. Rays need
 * nothing else, so this tight copy replaces the generic geometry merge, which cost a frame's worth of main-thread time per chunk.
 */
function mergePositions(meshes: Mesh[], meshRoles: number[]): {geometry: BufferGeometry; roles: Uint8Array} {
  let vertices = 0, indices = 0;
  for (const {geometry} of meshes) {
    const count = geometry.getAttribute('position').count;
    vertices += count; indices += geometry.index?.count ?? count;
  }
  const positions = new Float32Array(vertices * 3), index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const roles = new Uint8Array(indices / 3), point = new Vector3();
  let vertex = 0, at = 0;
  meshes.forEach((mesh, i) => {
    const source = mesh.geometry, position = source.getAttribute('position'), start = at;
    for (let v = 0; v < position.count; v++) {
      point.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld).toArray(positions, (vertex + v) * 3);
    }
    if (source.index) for (let k = 0; k < source.index.count; k++) index[at++] = vertex + source.index.getX(k);
    else for (let k = 0; k < position.count; k++) index[at++] = vertex + k;
    roles.fill(meshRoles[i], start / 3, at / 3);
    vertex += position.count;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  return {geometry, roles};
}

export interface SceneryGround {
  /** Highest resident opaque scanned surface under a point, excluding the filler ground; null outside the resident chunks. */
  surfaceHeight: SurfaceHeight;
  /**
   * Builds a chunk's ray tree (in the BVH worker) while the chunk root is still in native coordinates. A coarse chunk (the
   * horizon's far copy of the venue) serves the camera checks only: its road sits off the detailed road, and a wheel or line
   * height found on it would be kept after the detailed chunk loads.
   */
  add(id: string, root: Object3D, coarse?: boolean): Promise<void>;
  /** Drops a chunk's tree; with `root`, only if that root's load owns it (a newer load of the same chunk may have replaced it). */
  remove(id: string, root?: Object3D): void;
  /** Moves a camera eye (display frame) above the ground and in front of anything between it and `look`. */
  resolve(eye: Vector3, look: Vector3, origin: Vector3, result: Vector3): Vector3;
  dispose(): void;
}

/**
 * One ray tree per resident chunk, over its opaque surfaces and filler ground, answers both the wheel/line contact heights and
 * the camera checks. Each triangle keeps its role, so a query only accepts the surfaces it used to. Chunks build concurrently,
 * one per worker.
 */
export function createSceneryGround(): SceneryGround {
  const workers = Array.from({length: WORKER_COUNT}, () => new GenerateMeshBVHWorker()), idle = [...workers];
  const waiting: ((worker: GenerateMeshBVHWorker) => void)[] = [];
  const acquire = () => new Promise<GenerateMeshBVHWorker>(resolve => { const worker = idle.pop(); if (worker) resolve(worker); else waiting.push(resolve); });
  const release = (worker: GenerateMeshBVHWorker) => { const next = waiting.shift(); if (next) next(worker); else idle.push(worker); };
  type Chunk = {root: Object3D; geometry: BufferGeometry; roles: Uint8Array; tree: MeshBVH | null; cancel: () => void};
  const chunks = new Map<string, Chunk>();
  const cameraRay = new Ray(), heightRay = new Ray(), nativeEye = new Vector3(), nativeLook = new Vector3(), direction = new Vector3();
  let disposed = false;
  /** Distance to the nearest triangle with `role` along `ray`, or null. */
  const nearestHit = (ray: Ray, role: number, near: number, far: number) => {
    let nearest = far, found = false;
    for (const chunk of chunks.values()) {
      if (!chunk.tree || !chunk.geometry.boundingBox || !ray.intersectsBox(chunk.geometry.boundingBox)) continue;
      for (const hit of chunk.tree.raycast(ray, DoubleSide, near, nearest)) {
        if (hit.distance < nearest && hit.faceIndex != null && chunk.roles[hit.faceIndex] & role) { nearest = hit.distance; found = true; }
      }
    }
    return found ? nearest : null;
  };
  const aboveGround = (position: Vector3) => {
    cameraRay.origin.set(position.x, position.y + 60, position.z); cameraRay.direction.set(0, -1, 0);
    const distance = nearestHit(cameraRay, CAMERA, 0, 400);
    if (distance !== null) position.y = Math.max(position.y, cameraRay.origin.y - distance + GROUND_CLEARANCE_M);
  };
  const remove = (id: string, root?: Object3D) => {
    const chunk = chunks.get(id);
    if (!chunk || (root && chunk.root !== root)) return;
    chunks.delete(id); chunk.cancel(); chunk.geometry.dispose();
  };
  heightRay.direction.set(0, -1, 0);
  return {
    surfaceHeight(point, reach = 1.5) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return null;
      heightRay.origin.set(point.x, point.y + SURFACE_ABOVE_M, point.z);
      const distance = nearestHit(heightRay, WHEEL, 0, SURFACE_ABOVE_M + reach);
      return distance === null ? null : heightRay.origin.y - distance;
    },
    async add(id, root, coarse = false) {
      if (disposed) throw new DOMException('Scenery ground disposed', 'AbortError');
      remove(id);
      const meshes: Mesh[] = [], meshRoles: number[] = [];
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (!(object instanceof Mesh) || !object.visible) return;
        const role = roleOf(object.name) & (coarse ? CAMERA : WHEEL | CAMERA);
        if (role) { meshes.push(object as Mesh); meshRoles.push(role); }
      });
      if (!meshes.length) return;
      const {geometry, roles} = mergePositions(meshes, meshRoles);
      geometry.computeBoundingBox();
      const chunk: Chunk = {root, geometry, roles, tree: null, cancel: () => {}};
      const canceled = new Promise<never>((_resolve, reject) => { chunk.cancel = () => reject(new DOMException('Scenery ground removed', 'AbortError')); });
      chunks.set(id, chunk);
      const build = (async () => {
        const worker = await acquire();
        try {
          if (chunks.get(id) !== chunk) throw new DOMException('Scenery ground removed', 'AbortError');
          // At the depth cap a node just becomes a larger leaf (dense props stacked in one spot): rays stay exact, so no warning.
          return await worker.generate(geometry, {indirect: true, verbose: false});
        } finally { release(worker); }
      })();
      build.catch(() => {}); // A removed chunk's build may finish or fail after the race settled.
      try { chunk.tree = await Promise.race([build, canceled]); }
      catch (error) { if (chunks.get(id) === chunk) chunks.delete(id); geometry.dispose(); throw error; }
      finally { chunk.cancel = () => {}; }
    },
    remove,
    resolve(eye, look, origin, result) {
      nativeEye.set(eye.x + origin.x, eye.y + origin.y, origin.z - eye.z);
      nativeLook.set(look.x + origin.x, look.y + origin.y + 0.1, origin.z - look.z);
      aboveGround(nativeEye);
      direction.subVectors(nativeEye, nativeLook);
      const length = direction.length();
      if (length > 0) {
        direction.divideScalar(length); cameraRay.set(nativeLook, direction);
        const distance = nearestHit(cameraRay, CAMERA, 0.05, length);
        if (distance !== null) {
          nativeEye.copy(nativeLook).addScaledVector(direction, Math.max(0, distance - OBSTRUCTION_CLEARANCE_M));
          aboveGround(nativeEye);
        }
      }
      return result.set(nativeEye.x - origin.x, nativeEye.y - origin.y, origin.z - nativeEye.z);
    },
    dispose() { disposed = true; for (const id of chunks.keys()) remove(id); for (const worker of workers) worker.dispose(); },
  };
}
