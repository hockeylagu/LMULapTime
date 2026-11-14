import type { Object3D } from 'three';

/**
 * Updates the world matrices of what a frame can draw, by the rules of three's `updateMatrixWorld`, without walking hidden subtrees
 * or `frozen` ones: three walks every node each frame, shown or not, and a race start holds about 7,500 (the hidden cars' parts and
 * the venue's frozen chunks; ~1 ms of the frame). A hidden child under a matrix that changed is marked, so it takes its world matrix
 * again once shown. A frozen subtree is one whose nodes never update their own matrices (`matrixAutoUpdate` and
 * `matrixWorldAutoUpdate` both off throughout): three's walk changes nothing in it either.
 */
export function updateShownMatrices(object: Object3D, frozen: (object: Object3D) => boolean, force = false): void {
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
    else if (!frozen(child)) updateShownMatrices(child, frozen, force);
  }
}
