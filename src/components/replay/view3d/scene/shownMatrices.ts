import type { Object3D } from 'three';

/**
 * Updates the world matrices of what a frame can draw, by the rules of three's `updateMatrixWorld`, without walking hidden subtrees
 * or ones that place their own: three walks every node each frame, shown or not, and a race start holds about 7,500 (the hidden cars'
 * parts and the venue's frozen chunks; ~1 ms of the frame). A hidden child under a matrix that changed is marked, so it takes its
 * world matrix again once shown. A child with `matrixWorldAutoUpdate` off is left with its whole subtree: a frozen scenery chunk,
 * whose matrices never change, or a car with a part table, whose `sync` sets every drawn node's world matrix itself
 * (`cars/carParts.ts`).
 */
export function updateShownMatrices(object: Object3D, force = false): void {
  if (object.matrixAutoUpdate) object.updateMatrix();
  if (object.matrixWorldNeedsUpdate || force) {
    if (object.matrixWorldAutoUpdate) {
      if (object.parent === null) object.matrixWorld.copy(object.matrix);
      else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
    }
    object.matrixWorldNeedsUpdate = false;
    force = true;
  }
  for (const child of object.children) {
    if (!child.visible) { if (force) child.matrixWorldNeedsUpdate = true; }
    else if (child.matrixWorldAutoUpdate) updateShownMatrices(child, force);
  }
}
