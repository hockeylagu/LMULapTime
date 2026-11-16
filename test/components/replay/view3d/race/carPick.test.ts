import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { carsUnder } from '../../../../../src/components/replay/view3d/race/carPick.js';

const origin = {x: 100, y: 0, z: 100};

/** A 90° camera at the origin, 0.6 m up (the middle of a car's box), looking along native +z (scene -z), drawing 100 by 100 pixels. */
function camera() {
  const view = new PerspectiveCamera(90, 1, 0.1, 2000);
  view.position.set(0, 0.6, 0);
  view.updateMatrixWorld();
  return view;
}

/** A car `ahead` metres along native z and `left` along native x, heading along z, or across the view with `rotY` a quarter turn. */
const at = (slot: number, ahead: number, left = 0, rotY = 0) => ({slot, x: origin.x + left, y: origin.y, z: origin.z + ahead, rotX: 0, rotY, rotZ: 0});
const slots = (...args: Parameters<typeof carsUnder>) => carsUnder(...args).map(car => car.slot);

describe('carsUnder', () => {
  it('lists the cars whose box the point falls in on screen, nearest first', () => {
    const view = camera();
    expect(slots([at(4, 40), at(2, 20)], view, origin, 100, 100, 50, 50)).toEqual([2, 4]);
    // Seen from behind, 20 m away, a car's back is 1 m by 20 m of the half width: 2.5 px, its front 2.2 px; 10 px at least.
    expect(slots([at(2, 20)], view, origin, 100, 100, 59, 50)).toEqual([2]);
    expect(slots([at(2, 20)], view, origin, 100, 100, 61, 50)).toEqual([]);
    // Across the view, its 2.5 m half length shows: 6.25 px at its middle, more at its near corners, still within 10 px.
    expect(slots([at(2, 20, 0, Math.PI / 2)], view, origin, 100, 100, 59, 50)).toEqual([2]);
    // 5 m away, its back is 2.5 m from the camera: 20 px each side, the ground 0.6 m below the eye 12 px below the centre.
    expect(slots([at(2, 5)], view, origin, 100, 100, 69, 50)).toEqual([2]);
    expect(slots([at(2, 5)], view, origin, 100, 100, 71, 50)).toEqual([]);
    expect(slots([at(2, 5)], view, origin, 100, 100, 50, 61)).toEqual([2]);
    expect(slots([at(2, 5)], view, origin, 100, 100, 50, 63)).toEqual([]);
  });

  it('leaves out cars behind the camera and around it (the followed car from its cockpit)', () => {
    const view = camera();
    expect(slots([at(2, -20)], view, origin, 100, 100, 50, 50)).toEqual([]);
    expect(slots([at(2, 1), at(3, 30)], view, origin, 100, 100, 50, 50)).toEqual([3]);
  });

  it('finds a car off the centre where the camera draws it', () => {
    // 10 m left of a point 20 m ahead: a quarter of the width left of the centre (native x is the scene's).
    expect(slots([at(2, 20, -10)], camera(), origin, 100, 100, 25, 50)).toEqual([2]);
    expect(slots([at(2, 20, -10)], camera(), origin, 100, 100, 75, 50)).toEqual([]);
  });
});
