import { Box3, BufferAttribute, BufferGeometry, Group, InterleavedBufferAttribute, Mesh, Sphere, Vector3, type Material } from 'three';

export interface WheelRig { corner: number; pivot: Group; hub: Vector3; radiusM: number }
interface WheelPart {
  mesh: Mesh<BufferGeometry, Material>;
  position: BufferAttribute | InterleavedBufferAttribute;
  normal: BufferAttribute | InterleavedBufferAttribute | null;
  indices: number[][];
  bounds: Box3[];
  assigned: number | null;
}
const CORNERS = ['FL', 'FR', 'RL', 'RR'];
const cornerAt = (x: number, z: number) => (z < 0 ? 0 : 2) + (x > 0 ? 0 : 1);

/** Split the validated, vehicle-coordinate static tyre/rim parts without changing source vertices. */
export function attachWheelRigs(envelope: Group): WheelRig[] {
  const parts: WheelPart[] = [], tyreBounds = CORNERS.map(() => new Box3()), vertex = new Vector3();
  const hubs: Array<Vector3 | undefined> = CORNERS.map(() => undefined);
  const namedParts = new Set<string>();
  for (const object of envelope.children) {
    if (!(object instanceof Mesh)) continue;
    const named = /^(tyres|rims)-(FL|FR|RL|RR)$/.exec(object.name);
    if (!named && !['tyres', 'rims'].includes(object.name)) continue;
    const kind = named?.[1] ?? object.name, assigned = named ? CORNERS.indexOf(named[2]) : null;
    if (named && assigned !== null) {
      const pivot: unknown = object.userData.wheelPivot;
      if (namedParts.has(object.name) || !Array.isArray(pivot) || pivot.length !== 3
        || !pivot.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 4)) return [];
      const hub = new Vector3(pivot[0] as number, pivot[1] as number, pivot[2] as number);
      if (cornerAt(hub.x, hub.z) !== assigned || (hubs[assigned] && hubs[assigned].distanceTo(hub) > 0.0001)) return [];
      hubs[assigned] = hub; namedParts.add(object.name);
    }
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
      const corner = assigned ?? cornerAt(position.getX(triangle[0]), position.getZ(triangle[0]));
      if (triangle.some(v => cornerAt(position.getX(v), position.getZ(v)) !== corner)) return [];
      for (const v of triangle) bounds[corner].expandByPoint(vertex.fromBufferAttribute(position, v));
      indices[corner].push(...triangle);
    }
    const tyre = kind === 'tyres';
    if (tyre) bounds.forEach((box, corner) => tyreBounds[corner].union(box));
    parts.push({mesh: object as Mesh<BufferGeometry, Material>, position,
      normal: normal instanceof BufferAttribute || normal instanceof InterleavedBufferAttribute ? normal : null,
      indices, bounds, assigned});
  }
  if (namedParts.size && namedParts.size !== 8) return [];
  const rigs: WheelRig[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const box = tyreBounds[corner], size = box.getSize(new Vector3());
    const radiusM = (size.y + size.z) / 4;
    if (box.isEmpty() || radiusM < 0.15 || radiusM > 0.6 || size.x > radiusM * 2 || size.y / size.z < 0.75 || size.y / size.z > 1.33) return [];
    const center = box.getCenter(new Vector3()), hub = hubs[corner] ?? center, pivot = new Group();
    // Named exports carry the source rolling hub; reject metadata detached from the tyre.
    if (Math.abs(hub.x - center.x) > 0.05 || Math.abs(hub.y - center.y) > 0.03 || Math.abs(hub.z - center.z) > 0.03) return [];
    pivot.name = `wheel-${CORNERS[corner]}`; pivot.position.copy(hub);
    rigs.push({corner, pivot, hub, radiusM});
  }
  for (const part of parts) {
    for (const rig of rigs) {
      if (!part.indices[rig.corner].length) continue;
      let geometry: BufferGeometry;
      if (part.assigned !== null) {
        geometry = part.mesh.geometry;
        geometry.boundingBox = part.bounds[rig.corner];
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
      } else {
        geometry = new BufferGeometry(); geometry.setAttribute('position', part.position);
        if (part.normal) geometry.setAttribute('normal', part.normal);
        geometry.setIndex(part.indices[rig.corner]);
        geometry.boundingBox = part.bounds[rig.corner]; geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
      }
      const mesh = new Mesh(geometry, part.mesh.material); mesh.name = part.mesh.name.endsWith(`-${CORNERS[rig.corner]}`) ? part.mesh.name : `${part.mesh.name}-${CORNERS[rig.corner]}`;
      mesh.renderOrder = part.mesh.renderOrder;
      mesh.position.copy(rig.hub).negate(); rig.pivot.add(mesh);
    }
    envelope.remove(part.mesh);
  }
  envelope.add(...rigs.map(rig => rig.pivot));
  return rigs;
}
