import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { carsUnder, envelopeBounds, envelopeParts, insideHull, pickHeights, placeOnRoad } from '../../../../../src/components/replay/view3d/race/carPick.js';
import { CONTACT_SHADOW_NAME } from '../../../../../src/components/replay/view3d/car/underCarBake.js';

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

  it("picks a car by its model's bounds: a low car from its underside to its roof, none above it", () => {
    // A low prototype 5 m ahead, its pose level with the ground under the camera's 0.6 m: its body 0.4 m below the pose to 0.45 m above.
    const low = {...at(2, 5), box: new Box3(new Vector3(-0.95, -0.4, -2.2), new Vector3(0.95, 0.45, 2.3))};
    // On screen it spans 51 to 68 px down (10 px round its centre, 56, reach 46): the fixed box (0 to 1.2 m) reached up to 38 px.
    expect(slots([low], camera(), origin, 100, 100, 50, 56)).toEqual([2]);
    expect(slots([low], camera(), origin, 100, 100, 50, 41)).toEqual([]);
    expect(slots([at(2, 5)], camera(), origin, 100, 100, 50, 41)).toEqual([2]);
    expect(pickHeights(low)).toEqual([expect.closeTo(0.025), expect.closeTo(0.365)]);
    expect(pickHeights(at(2, 5))).toEqual([expect.closeTo(0.6), expect.closeTo(1.08)]);
  });

  it("reads a model's body bounds from its envelope's parts where they hang, without its contact shadow", () => {
    const car = new Group(), envelope = new Group(), wing = new Mesh(new BoxGeometry(1.6, 0.2, 0.4)), shadow = new Mesh(new BoxGeometry(5.6, 0, 5.6));
    envelope.name = 'body-envelope'; shadow.name = CONTACT_SHADOW_NAME;
    wing.position.set(0, 0.8, -2.2);
    envelope.add(new Mesh(new BoxGeometry(2, 1, 4)), wing, shadow);
    envelope.position.y = 0.3;
    car.add(envelope);
    car.position.set(50, 2, 50); car.rotation.y = 1;
    const box = envelopeBounds(car);
    for (const [value, expected] of [...box.min.toArray(), ...box.max.toArray()].map((v, i) => [v, [-1, -0.5, -2.4, 1, 0.9, 2][i]])) expect(value).toBeCloseTo(expected);
    expect(envelopeBounds(new Group()).isEmpty()).toBe(false);
  });

  it("puts a body on the road under the pose: its bottom on the road, as tall as it is", () => {
    // A pose 0.35 m above the road, the body's lowest point 0.07 m under the pose.
    const body = new Box3(new Vector3(-1, -0.07, -2.4), new Vector3(1, 1.2, 2.4));
    const box = placeOnRoad(body, 10.35, 10);
    expect([box.min.y, box.max.y]).toEqual([expect.closeTo(-0.35), expect.closeTo(0.92)]);
    expect(placeOnRoad(body, 10.35, null)).toEqual(body);
  });

  it("picks the followed car by its parts: an aerial over the roof does not widen it", () => {
    // A 1.2 m tall body 6 m ahead and a thin aerial 0.4 m over its roof at its front; the box over both is 1.6 m tall.
    const body = new Box3(new Vector3(-1, -0.6, -2.3), new Vector3(1, 0.6, 2.3)), aerial = new Box3(new Vector3(-0.02, 0.6, -2), new Vector3(0.02, 1, -1.9));
    const car = {...at(2, 6), box: body.clone().union(aerial), parts: [body, aerial]};
    // Drawn 1000 px square: the body's roof at the eye's height (the middle row), the box's top 54 px over it at its near end (3.7 m),
    // the aerial 5 px wide in the middle column. Over the roof beside the aerial: in the box, on no part.
    expect(slots([car], camera(), origin, 1000, 1000, 550, 470)).toEqual([]);
    expect(slots([{...car, parts: undefined}], camera(), origin, 1000, 1000, 550, 470)).toEqual([2]);
    // On the body, and on the aerial.
    expect(slots([car], camera(), origin, 1000, 1000, 550, 520)).toEqual([2]);
    expect(slots([car], camera(), origin, 1000, 1000, 500, 470)).toEqual([2]);
  });

  it("draws a box's outline, not the rectangle round it", () => {
    const diamond = [[50, 0], [100, 50], [50, 100], [0, 50], [50, 50]] as const;
    expect(insideHull(diamond, 50, 50)).toBe(true);
    expect(insideHull(diamond, 74, 74)).toBe(true);
    expect(insideHull(diamond, 90, 90)).toBe(false);
    expect(insideHull(diamond, 101, 50)).toBe(false);
    expect(insideHull([[0, 0], [10, 10], [20, 20]], 10, 10)).toBe(false);
  });

  it("keeps a model's parts once: one inside another (the cockpit in the shell, a detail level's copy) goes", () => {
    const car = new Group(), envelope = new Group(), aerial = new Mesh(new BoxGeometry(0.04, 0.4, 0.1));
    envelope.name = 'body-envelope';
    aerial.position.set(0, 0.7, -2);
    envelope.add(new Mesh(new BoxGeometry(2, 1, 4)), new Mesh(new BoxGeometry(1, 0.5, 1)), new Mesh(new BoxGeometry(2, 1, 4)), aerial);
    car.add(envelope);
    const parts = envelopeParts(car);
    expect(parts.map(part => part.max.y)).toEqual([expect.closeTo(0.5), expect.closeTo(0.9)]);
    expect(envelopeBounds(car).max.y).toBeCloseTo(0.9);
  });

  it('finds a car off the centre where the camera draws it', () => {
    // 10 m left of a point 20 m ahead: a quarter of the width left of the centre (native x is the scene's).
    expect(slots([at(2, 20, -10)], camera(), origin, 100, 100, 25, 50)).toEqual([2]);
    expect(slots([at(2, 20, -10)], camera(), origin, 100, 100, 75, 50)).toEqual([]);
  });
});
