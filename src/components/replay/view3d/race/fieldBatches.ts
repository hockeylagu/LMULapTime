import { BatchedMesh, Group, Matrix4, Mesh, type BufferAttribute, type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D, type TypedArray } from 'three';
import { batchable, layoutOf } from '../car/carBatches.js';
import { geometryBuffers, releaseOnUpload } from '../laps/lapLayer.js';

/** One car of the field, its opaque parts drawn by its body's batches. */
export interface FieldCar {
  /**
   * Shows the car's parts at their current pose, distance level and visibility (call after its matrices are updated), or hides
   * them all (a car out of view or off the track).
   */
  show(visible: boolean): void;
  dispose(): void;
}

interface Part { proxy: Mesh; batch: BatchedMesh; instance: number; matrix: Matrix4; visible: boolean }

/**
 * Draws a field of cars from batches shared by the cars of one body: one multi-draw per material for all of them, where a car
 * alone draws about a draw per material. The cars of a body share their materials (the loader's `shareMaterials`), so only the
 * livery's own materials (paint, livery files) split a body's batches. A body's batches hold one copy of its geometry, every
 * distance level and option part its cars show; its cars' instances follow their parts, which stay in each model as invisible
 * stand-ins that the wheel animation and distance levels keep moving and switching.
 *
 * `addBody` takes every car of a body at once, so each batch is built at its exact size: the parsed body's copy of each batched
 * geometry is then dropped, and each batch drops its own CPU copy once uploaded. Nothing adds to a batch afterwards. It returns
 * the body's batches in a group for the caller to warm up, add beside the cars (the cars' parent, whose frame they draw in), and
 * then call `ready`.
 */
export function createFieldBatches(): {addBody(cars: readonly Group[]): {cars: FieldCar[]; batches: Group; ready: () => void}; dispose(): void} {
  const batches: BatchedMesh[] = [];
  /** Each batch's shown instances: a batch with none is left out of every pass (main view, shadow cascades, reflection). */
  const shown = new Map<BatchedMesh, number>();
  const count = (batch: BatchedMesh, change: number) => {
    const next = (shown.get(batch) ?? 0) + change;
    shown.set(batch, next); batch.visible = next > 0;
  };
  return {
    addBody(cars) {
      const groups = new Map<string, Array<{car: number; mesh: Mesh<BufferGeometry, MeshStandardMaterial>}>>();
      /** Geometries some car draws on its own (glass, lamps, decals): their parsed copy stays until uploaded. */
      const unbatched = new Set<BufferGeometry>();
      cars.forEach((car, index) => car.traverse(object => {
        if (!(object instanceof Mesh) || object instanceof BatchedMesh) return;
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
        if (!batchable(mesh)) { unbatched.add(mesh.geometry); return; }
        const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layoutOf(mesh.geometry)}`;
        groups.set(key, [...groups.get(key) ?? [], {car: index, mesh}]);
      }));
      const parts: Part[][] = cars.map(() => []), added = new Group(), copied = new Set<BufferGeometry>();
      for (const members of groups.values()) {
        const geometries = [...new Set(members.map(({mesh}) => mesh.geometry))];
        const vertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
        const indices = geometries.reduce((sum, geometry) => sum + (geometry.index?.count ?? 0), 0);
        const first = members[0].mesh, batch = new BatchedMesh(members.length, vertices, indices, first.material);
        // The field spreads round the lap: the batch draws in each pass (main view, each shadow cascade) the parts inside it.
        batch.frustumCulled = false; batch.perObjectFrustumCulled = true; batch.sortObjects = false;
        batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.name = `field batch ${first.material.name}`;
        const ids = new Map(geometries.map(geometry => [geometry, batch.addGeometry(geometry)]));
        for (const {car, mesh} of members) {
          const instance = batch.addInstance(ids.get(mesh.geometry)!);
          batch.setVisibleAt(instance, false);
          parts[car].push({proxy: mesh, batch, instance, matrix: new Matrix4(), visible: false});
          mesh.layers.disableAll(); mesh.castShadow = false; mesh.receiveShadow = false;
        }
        for (const geometry of geometries) copied.add(geometry);
        // Bounds first (the batch's, each geometry's within it, and its geometry's): the renderer measures what it sorts after
        // uploading it, when the vertices are gone.
        batch.computeBoundingBox(); batch.computeBoundingSphere();
        batch.geometry.computeBoundingBox(); batch.geometry.computeBoundingSphere();
        releaseOnUpload(batch.geometry);
        batch.geometry.index?.onUpload(emptyIndex);
        added.add(batch); batches.push(batch);
      }
      // The batches hold the vertices now: the parsed body keeps only the bounds and footprints its stand-ins are measured by.
      // A buffer can hold several geometries' vertices (interleaved): it stays while a part drawn on its own still reads it.
      const kept = new Set([...unbatched].flatMap(geometryBuffers));
      for (const geometry of copied) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        for (const buffer of geometryBuffers(geometry)) if (!kept.has(buffer)) (buffer as {array: unknown}).array = null;
      }
      return {
        batches: added,
        /** Once warmed up (every batch uploaded, its vertices gone from the CPU): a batch draws only while a car shows in it. */
        ready: () => { for (const batch of added.children as BatchedMesh[]) batch.visible = (shown.get(batch) ?? 0) > 0; },
        cars: cars.map((car, index) => fieldCar(car, parts[index], count)),
      };
    },
    dispose() { for (const batch of batches) batch.dispose(); },
  };
}

/** A batch reads its index's element size at each draw: once uploaded, the index keeps an empty array of its type. */
function emptyIndex(this: BufferAttribute): void {
  this.array = new (this.array.constructor as new (length: number) => TypedArray)(0);
}

function fieldCar(car: Object3D, parts: Part[], count: (batch: BatchedMesh, change: number) => void): FieldCar {
  const relative = new Matrix4();
  /** Whether the part shows: it and every node up to the car are visible (the car's own flag is the caller's `show`). */
  const shown = (part: Object3D) => { for (let at: Object3D | null = part; at && at !== car; at = at.parent) if (!at.visible) return false; return true; };
  /** The part's pose in the field's frame (the car's parent), from the local matrices. */
  const poseOf = (part: Object3D, out: Matrix4) => {
    out.copy(part.matrix);
    for (let at = part.parent; at; at = at.parent) { out.premultiply(at.matrix); if (at === car) break; }
    return out;
  };
  let hidden = true;
  return {
    show(visible) {
      if (!visible && hidden) return;
      hidden = !visible;
      for (const part of parts) {
        const next = visible && shown(part.proxy);
        if (next !== part.visible) { part.visible = next; part.batch.setVisibleAt(part.instance, next); count(part.batch, next ? 1 : -1); }
        if (!next) continue;
        poseOf(part.proxy, relative);
        if (!relative.equals(part.matrix)) { part.matrix.copy(relative); part.batch.setMatrixAt(part.instance, relative); }
      }
    },
    dispose() {
      for (const part of parts) { if (part.visible) count(part.batch, -1); part.batch.deleteInstance(part.instance); }
      parts.length = 0;
    },
  };
}
