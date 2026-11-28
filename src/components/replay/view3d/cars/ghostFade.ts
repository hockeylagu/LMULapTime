import { Mesh, Vector3, type Box3, type Camera, type Material, type Object3D } from 'three';
import { modelBox } from './carParts.js';

/** How far outside the ghost's body the camera starts to fade it (m): gone with the camera at or inside its body. */
export const GHOST_FADE_M = 1;

/**
 * The lap's ghost fades out as the camera comes near its body, and is gone with the camera inside it: a cockpit, hood
 * or roof camera on a car the ghost overlaps sees its own car, not the ghost's shell drawn over it. The body is the
 * ghost's own box (its parts in the car's frame), so a ghost beside or ahead stays as it is.
 */
export function ghostFader(ghost: Object3D): (camera: Camera) => void {
  let box: Box3 | null = null, shown = -1;
  const base = new Map<Material, number>(), eye = new Vector3();
  return camera => {
    if (!box) {
      box = modelBox(ghost);
      ghost.traverse(object => {
        if (object instanceof Mesh) for (const material of [object.material as Material | Material[]].flat()) base.set(material, material.opacity);
      });
    }
    if (box.isEmpty()) return;
    ghost.updateWorldMatrix(true, false);
    const inCar = ghost.worldToLocal(camera.getWorldPosition(eye));
    const share = Math.min(1, box.distanceToPoint(inCar) / GHOST_FADE_M);
    if (share === shown) return;
    shown = share;
    for (const [material, opacity] of base) {
      material.opacity = opacity * share;
      material.visible = share > 0;
    }
  };
}
