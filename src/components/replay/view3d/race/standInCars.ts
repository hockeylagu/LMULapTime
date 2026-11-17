import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Group, type Object3D } from 'three';
import { hazeProgram } from '../atmosphere/haze.js';
import { createBlobShadows } from './blobShadows.js';

/** A stand-in's colour: plain grey, no livery, so it does not pass for the car it stands in for. */
const STAND_IN_GREY = '#9aa0a6';

/**
 * Grey stand-ins for the race's cars still loading: per car class, the far model of the first body of that class to load, one
 * instance per car waiting. A class with none yet borrows the first stand-in compiled; before any, a waiting car draws nothing. Each frame the scene places the cars
 * waiting (`begin`, `place`, `end`); a stand-in draws only the instances placed, none once every car has its own model. Each casts no
 * sun shadow: a contact shadow lies on the road under it (`blobShadows`).
 */
export interface StandInCars {
  /** Gives `carClass` a stand-in shaped like `car` (a far model's car group, its body under `body-envelope`) unless it has one. */
  offer(carClass: string, car: Group): void;
  /** Starts a frame: no car placed yet. */
  begin(): void;
  /** Draws a car of `carClass` at `matrix` (its lowest point: on the road under its pose) this frame; false while no stand-in is drawable yet. */
  place(carClass: string, matrix: Matrix4): boolean;
  /** Ends the frame: each stand-in draws the cars placed on it. */
  end(): void;
  dispose(): void;
}

/**
 * One geometry of a car's body in the car's frame, its lowest point at the car's origin (placed on the road): positions and
 * indices only, read through each attribute (quantized and interleaved ones included), with normals worked out again.
 */
export function standInGeometry(car: Group): BufferGeometry {
  const body = car.getObjectByName('body-envelope') ?? car, meshes: Mesh[] = [];
  body.traverse(object => { if (object instanceof Mesh) meshes.push(object as Mesh); });
  car.updateMatrixWorld(true);
  const toCar = new Matrix4().copy(car.matrixWorld).invert(), local = new Matrix4(), point = new Vector3();
  const positions: number[] = [], indices: number[] = [];
  for (const mesh of meshes) {
    const geometry = mesh.geometry, position = geometry.getAttribute('position');
    if (!position) continue;
    local.multiplyMatrices(toCar, mesh.matrixWorld);
    const base = positions.length / 3;
    for (let i = 0; i < position.count; i++) positions.push(...point.fromBufferAttribute(position, i).applyMatrix4(local).toArray());
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i++) indices.push(base + i);
  }
  let bottom = Infinity;
  for (let i = 1; i < positions.length; i += 3) bottom = Math.min(bottom, positions[i]);
  if (Number.isFinite(bottom)) for (let i = 1; i < positions.length; i += 3) positions[i] -= bottom;
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  merged.setIndex(positions.length / 3 > 65535 ? new BufferAttribute(new Uint32Array(indices), 1) : new BufferAttribute(new Uint16Array(indices), 1));
  merged.computeVertexNormals();
  return merged;
}

/** `capacity` is the field's car count (every car could wait at once); `warm` compiles a stand-in before it joins `root`. */
export function createStandInCars(root: Object3D, capacity: number, warm: (object: Object3D) => Promise<void>): StandInCars {
  const material = new MeshStandardMaterial({color: STAND_IN_GREY, roughness: 0.6, metalness: 0.1});
  hazeProgram(material);
  const blobs = createBlobShadows(root, capacity, warm);
  const byClass = new Map<string, {mesh: InstancedMesh; ready: boolean}>();
  /** The first stand-in compiled: a class without its own yet borrows it. */
  let first: {mesh: InstancedMesh; ready: boolean} | null = null, disposed = false;
  return {
    offer(carClass, car) {
      if (disposed || byClass.has(carClass)) return;
      const geometry = standInGeometry(car);
      geometry.computeBoundingBox();
      const mesh = new InstancedMesh(geometry, material, capacity);
      // Its instances move every frame and only the placed ones draw: their bounds are not kept.
      mesh.name = 'race-stand-in'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0;
      const entry = {mesh, ready: false};
      byClass.set(carClass, entry);
      warm(mesh).then(() => { if (disposed) return; root.add(mesh); entry.ready = true; first ??= entry; }, () => { byClass.delete(carClass); mesh.geometry.dispose(); });
    },
    begin() { for (const {mesh} of byClass.values()) mesh.count = 0; blobs.begin(); },
    place(carClass, matrix) {
      const own = byClass.get(carClass), entry = own?.ready ? own : first;
      if (!entry) return false;
      entry.mesh.setMatrixAt(entry.mesh.count++, matrix);
      blobs.place(matrix, 0, entry.mesh.geometry.boundingBox!);
      return true;
    },
    end() {
      for (const {mesh} of byClass.values()) { mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = mesh.count > 0; }
      blobs.end();
    },
    dispose() {
      disposed = true;
      for (const {mesh} of byClass.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      byClass.clear(); first = null; material.dispose(); blobs.dispose();
    },
  };
}
