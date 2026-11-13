import { BatchedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, type BufferGeometry, type Material } from 'three';

export interface CarBatches {
  /** Follows the parts' current pose and visibility (wheels, steering, cockpit variants, distance levels); call once per frame before drawing. */
  sync(): void;
  dispose(): void;
}

interface Part { proxy: Mesh; batch: BatchedMesh; instance: number; matrix: Matrix4; visible: boolean }

function layoutOf(geometry: BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`);
  return [geometry.index ? 'indexed' : 'plain', ...attributes.sort()].join('|');
}

/** An opaque lit car part whose material and geometry a batch can draw: lamps, glass and decals keep their own draws (sorted, or switched per frame). */
function batchable(mesh: Mesh<BufferGeometry, Material | Material[]>): mesh is Mesh<BufferGeometry, MeshStandardMaterial> {
  const material = mesh.material;
  return !Array.isArray(material) && material instanceof MeshStandardMaterial && !material.transparent && material.visible
    && !mesh.customDepthMaterial && mesh.onBeforeRender === Object3D.prototype.onBeforeRender;
}

/**
 * Draws a car's opaque parts that share a material as one multi-draw, in place of a draw per part: a draw costs the main thread about
 * the same whatever its size, and a car has about a hundred parts but a third as many materials once identical ones are shared
 * (carMaterialKey). The parts stay in the model as invisible stand-ins (no camera layer), so wheel animation, cockpit variants and
 * distance levels keep moving and switching them; `sync` copies their pose relative to `envelope` and their visibility to the batch.
 * A material with a single part keeps its own draw.
 */
export function batchCarParts(envelope: Object3D): CarBatches {
  envelope.updateWorldMatrix(true, true);
  const groups = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>[]>();
  envelope.traverse(object => {
    if (!(object instanceof Mesh) || object instanceof BatchedMesh) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    if (!batchable(mesh)) return;
    const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layoutOf(mesh.geometry)}`;
    groups.set(key, [...groups.get(key) ?? [], mesh]);
  });
  const parts: Part[] = [], batches: BatchedMesh[] = [], relative = new Matrix4();
  /** The part's pose in the envelope's frame, from the local matrices (exact, wherever the car is). */
  const poseOf = (part: Object3D, out: Matrix4) => {
    out.copy(part.matrix);
    for (let at = part.parent; at && at !== envelope; at = at.parent) out.premultiply(at.matrix);
    return out;
  };
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = [...new Set(meshes.map(mesh => mesh.geometry))];
    const vertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
    const indices = geometries.reduce((sum, geometry) => sum + (geometry.index?.count ?? 0), 0);
    const first = meshes[0], batch = new BatchedMesh(meshes.length, vertices, indices, first.material);
    batch.perObjectFrustumCulled = false; batch.sortObjects = false;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.name = `car batch ${first.material.name}`;
    const ids = new Map(geometries.map(geometry => [geometry, batch.addGeometry(geometry)]));
    for (const mesh of meshes) {
      const instance = batch.addInstance(ids.get(mesh.geometry)!), matrix = poseOf(mesh, new Matrix4());
      batch.setMatrixAt(instance, matrix);
      parts.push({proxy: mesh, batch, instance, matrix, visible: true});
      // The stand-in keeps its place and visibility for the batch, and draws in no camera.
      mesh.layers.disableAll(); mesh.castShadow = false; mesh.receiveShadow = false;
    }
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    envelope.add(batch); batches.push(batch);
  }
  /** Whether the part shows: it and every node up to the envelope are visible. */
  const shown = (part: Object3D) => { for (let at: Object3D | null = part; at && at !== envelope; at = at.parent) if (!at.visible) return false; return true; };
  return {
    sync() {
      if (!parts.length) return;
      envelope.updateWorldMatrix(false, true);
      for (const part of parts) {
        const visible = shown(part.proxy);
        if (visible !== part.visible) { part.visible = visible; part.batch.setVisibleAt(part.instance, visible); }
        if (!visible) continue;
        poseOf(part.proxy, relative);
        if (!relative.equals(part.matrix)) { part.matrix.copy(relative); part.batch.setMatrixAt(part.instance, relative); }
      }
    },
    dispose() { for (const batch of batches) batch.dispose(); },
  };
}
