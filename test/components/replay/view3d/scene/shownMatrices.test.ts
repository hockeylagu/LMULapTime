import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { updateShownMatrices } from '../../../../../src/components/replay/view3d/scene/shownMatrices.js';

const worldX = (object: Group) => new Vector3().setFromMatrixPosition(object.matrixWorld).x;

describe('updateShownMatrices', () => {
  it('updates shown nodes as three does, and a hidden one once it shows under a parent that moved meanwhile', () => {
    const root = new Group(), car = new Group(), wheel = new Group(), hidden = new Group();
    root.add(car); car.add(wheel); car.add(hidden);
    car.position.x = 10; wheel.position.x = 1; hidden.position.x = 2; hidden.visible = false;
    updateShownMatrices(root);
    expect([worldX(car), worldX(wheel), worldX(hidden)]).toEqual([10, 11, 0]);
    car.position.x = 20;
    updateShownMatrices(root);
    expect(worldX(wheel)).toBe(21);
    // Shown in a frame where its parent stays put: it still takes the parent's move it missed.
    hidden.visible = true;
    updateShownMatrices(root);
    expect(worldX(hidden)).toBe(22);
  });

  it('leaves a subtree whose root places its own world matrix (a frozen chunk, a car with a part table) as it is', () => {
    const root = new Group(), car = new Group(), part = new Group();
    root.add(car); car.add(part);
    car.position.x = 10; part.position.x = 5;
    car.matrixWorldAutoUpdate = false;
    updateShownMatrices(root);
    // Not even the car's own matrix: its table composes it (`placeCarFrame`).
    expect([car.matrix.elements[12], worldX(car), worldX(part)]).toEqual([0, 0, 0]);
    car.matrixWorldAutoUpdate = true;
    updateShownMatrices(root);
    expect([worldX(car), worldX(part)]).toEqual([10, 15]);
  });
});
