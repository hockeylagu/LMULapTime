import {DoubleSide, Mesh, Ray, Vector3, type BufferGeometry, type Object3D} from 'three';
import {MeshBVH, StaticGeometryGenerator} from 'three-mesh-bvh';
import {GenerateMeshBVHWorker} from 'three-mesh-bvh/worker';
import {isSceneryGround} from './sceneryHeights.js';

const GROUND_CLEARANCE_M = 1.2, OBSTRUCTION_CLEARANCE_M = 0.6;

export function createCameraCollision() {
  const worker = new GenerateMeshBVHWorker();
  type Chunk = {geometry: BufferGeometry; tree: MeshBVH | null; cancel: () => void};
  const chunks = new Map<string, Chunk>();
  const ray = new Ray(), nativeEye = new Vector3(), nativeLook = new Vector3(), direction = new Vector3();
  let disposed = false;
  const firstHit = (near: number, far: number) => {
    let nearest = far, found = false;
    for (const chunk of chunks.values()) {
      if (!chunk.tree || !chunk.geometry.boundingBox || !ray.intersectsBox(chunk.geometry.boundingBox)) continue;
      const hit = chunk.tree.raycastFirst(ray, DoubleSide, near, nearest);
      if (hit) { nearest = hit.distance; found = true; }
    }
    return found ? nearest : null;
  };
  const aboveGround = (position: Vector3) => {
    ray.origin.set(position.x, position.y + 60, position.z); ray.direction.set(0, -1, 0);
    const distance = firstHit(0, 400);
    if (distance !== null) position.y = Math.max(position.y, ray.origin.y - distance + GROUND_CLEARANCE_M);
  };
  const remove = (id: string) => {
    const chunk = chunks.get(id);
    if (!chunk) return;
    chunks.delete(id); chunk.cancel(); chunk.geometry.dispose();
  };
  return {
    async add(id: string, root: Object3D): Promise<void> {
      if (disposed) throw new DOMException('Camera collision disposed', 'AbortError');
      remove(id);
      const meshes: Mesh[] = [];
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (!(object instanceof Mesh) || !object.visible) return;
        if (object.name.startsWith('FILLER_GROUND') || (/__OPAQUE(?:__|$)/.test(object.name) && isSceneryGround(object.name))) meshes.push(object as Mesh);
      });
      if (!meshes.length) return;
      const generator = new StaticGeometryGenerator(meshes);
      generator.attributes = ['position']; generator.useGroups = false;
      const geometry = generator.generate();
      const chunk: Chunk = {geometry, tree: null, cancel: () => {}};
      const canceled = new Promise<never>((_resolve, reject) => { chunk.cancel = () => reject(new DOMException('Camera collision removed', 'AbortError')); });
      chunks.set(id, chunk);
      try { chunk.tree = await Promise.race([worker.generate(geometry, {indirect: true}), canceled]); }
      catch (error) { if (chunks.get(id) === chunk) chunks.delete(id); geometry.dispose(); throw error; }
      finally { chunk.cancel = () => {}; }
    },
    remove,
    resolve(eye: Vector3, look: Vector3, origin: Vector3, result: Vector3): Vector3 {
      nativeEye.set(eye.x + origin.x, eye.y + origin.y, origin.z - eye.z);
      nativeLook.set(look.x + origin.x, look.y + origin.y + 0.1, origin.z - look.z);
      aboveGround(nativeEye);
      direction.subVectors(nativeEye, nativeLook);
      const length = direction.length();
      if (length > 0) {
        direction.divideScalar(length); ray.set(nativeLook, direction);
        const distance = firstHit(0.05, length);
        if (distance !== null) {
          nativeEye.copy(nativeLook).addScaledVector(direction, Math.max(0, distance - OBSTRUCTION_CLEARANCE_M));
          aboveGround(nativeEye);
        }
      }
      return result.set(nativeEye.x - origin.x, nativeEye.y - origin.y, origin.z - nativeEye.z);
    },
    dispose() { disposed = true; for (const id of chunks.keys()) remove(id); worker.dispose(); },
  };
}