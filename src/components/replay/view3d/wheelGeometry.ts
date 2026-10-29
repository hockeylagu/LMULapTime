import { Box3, BufferAttribute, BufferGeometry, Group, InterleavedBufferAttribute, Mesh, Sphere, Vector3, type Material } from 'three';

export interface WheelRig { corner: number; pivot: Group; hub: Vector3; radiusM: number }
interface WheelPart {
  mesh: Mesh<BufferGeometry, Material>;
  position: BufferAttribute | InterleavedBufferAttribute;
  normal: BufferAttribute | InterleavedBufferAttribute | null;
  indices: number[][];
  bounds: Box3[];
}
const CORNERS = ['FL', 'FR', 'RL', 'RR'];
const cornerAt = (x: number, z: number) => (z < 0 ? 0 : 2) + (x > 0 ? 0 : 1);

/** Split the validated, vehicle-coordinate static tyre/rim parts without changing source vertices. */
export function attachWheelRigs(envelope: Group): WheelRig[] {
  const parts: WheelPart[] = [], tyreBounds = CORNERS.map(() => new Box3()), vertex = new Vector3();
  for (const object of envelope.children) {
    if (!(object instanceof Mesh) || !['tyres', 'rims'].includes(object.name)) continue;
    // This package subset bakes native transforms into vertices. Unknown arrangements stay static.
    if (!(object.geometry instanceof BufferGeometry) || Array.isArray(object.material)
      || object.position.lengthSq() !== 0 || object.quaternion.x !== 0 || object.quaternion.y !== 0 || object.quaternion.z !== 0
      || object.scale.x !== 1 || object.scale.y !== 1 || object.scale.z !== 1) return [];
    const position: unknown = object.geometry.getAttribute('position'), normal: unknown = object.geometry.getAttribute('normal');
    if (!(position instanceof BufferAttribute) && !(position instanceof InterleavedBufferAttribute)) return [];
    const indices = CORNERS.map(() => [] as number[]), bounds = CORNERS.map(() => new Box3());
    const index = object.geometry.index, count = index?.count ?? position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const triangle = [index?.getX(i) ?? i, index?.getX(i + 1) ?? i + 1, index?.getX(i + 2) ?? i + 2];
      const corner = cornerAt(position.getX(triangle[0]), position.getZ(triangle[0]));
      if (triangle.some(v => cornerAt(position.getX(v), position.getZ(v)) !== corner)) return [];
      for (const v of triangle) bounds[corner].expandByPoint(vertex.fromBufferAttribute(position, v));
      indices[corner].push(...triangle);
    }
    const tyre = object.name === 'tyres';
    if (tyre) bounds.forEach((box, corner) => tyreBounds[corner].union(box));
    parts.push({mesh: object as Mesh<BufferGeometry, Material>, position,
      normal: normal instanceof BufferAttribute || normal instanceof InterleavedBufferAttribute ? normal : null,
      indices, bounds});
  }
  const rigs: WheelRig[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const box = tyreBounds[corner], size = box.getSize(new Vector3());
    const radiusM = (size.y + size.z) / 4;
    if (box.isEmpty() || radiusM < 0.15 || radiusM > 0.6 || size.x > radiusM * 2 || size.y / size.z < 0.75 || size.y / size.z > 1.33) return [];
    const hub = box.getCenter(new Vector3()), pivot = new Group();
    pivot.name = `wheel-${CORNERS[corner]}`; pivot.position.copy(hub);
    rigs.push({corner, pivot, hub, radiusM});
  }
  for (const part of parts) {
    for (const rig of rigs) {
      if (!part.indices[rig.corner].length) continue;
      const geometry = new BufferGeometry(); geometry.setAttribute('position', part.position);
      if (part.normal) geometry.setAttribute('normal', part.normal);
      geometry.setIndex(part.indices[rig.corner]);
      geometry.boundingBox = part.bounds[rig.corner]; geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
      const mesh = new Mesh(geometry, part.mesh.material); mesh.name = `${part.mesh.name}-${CORNERS[rig.corner]}`;
      mesh.position.copy(rig.hub).negate(); rig.pivot.add(mesh);
    }
    envelope.remove(part.mesh);
  }
  envelope.add(...rigs.map(rig => rig.pivot));
  return rigs;
}
