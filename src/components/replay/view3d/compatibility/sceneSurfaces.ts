import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three';
import { createSurfaceHeight } from '../surfaceProjection.js';

/** Older static scenes have no packaged filler and can contain downward-wound surface faces. */
export function prepareSurfaceLayers(root: Object3D) {
  const fillerGround = root.getObjectByName('ground');
  if (!fillerGround) root.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const index = object.geometry.index, position: unknown = object.geometry.getAttribute('position');
    if (!index || !(position instanceof BufferAttribute)) return;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      const ux = position.getX(b) - position.getX(a), uz = position.getZ(b) - position.getZ(a);
      const vx = position.getX(c) - position.getX(a), vz = position.getZ(c) - position.getZ(a);
      if (uz * vx - ux * vz < 0) { index.setX(i + 1, c); index.setX(i + 2, b); }
    }
    index.needsUpdate = true;
  });
  // Filler must never supply road heights for wheel contact, racing lines or braking boards.
  if (fillerGround) root.remove(fillerGround);
  const surfaceHeight = createSurfaceHeight(root);
  const groundHeight = fillerGround ? createSurfaceHeight(fillerGround) : surfaceHeight;
  if (fillerGround) root.add(fillerGround);
  return {fillerGround, surfaceHeight, groundHeight};
}
