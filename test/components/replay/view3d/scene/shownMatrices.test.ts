import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { updateShownMatrices } from '../../../../../src/components/replay/view3d/scene/shownMatrices.js';

const worldX = (object: Group) => new Vector3().setFromMatrixPosition(object.matrixWorld).x;

describe('updateShownMatrices', () => {
  it('updates shown nodes as three does, and a hidden one once it shows under a parent that moved meanwhile', () => {
    const root = new Group(), car = new Group(), wheel = new Group(), hidden = new Group();
    root.add(car); car.add(wheel); car.add(hidden);
    car.position.x = 10; wheel.position.x = 1; hidden.position.x = 2; hidden.visible = false;
    updateShownMatrices(root, () => false);
    expect([worldX(car), worldX(wheel), worldX(hidden)]).toEqual([10, 11, 0]);
    car.position.x = 20;
    updateShownMatrices(root, () => false);
    expect(worldX(wheel)).toBe(21);
    // Shown in a frame where its parent stays put: it still takes the parent's move it missed.
    hidden.visible = true;
    updateShownMatrices(root, () => false);
    expect(worldX(hidden)).toBe(22);
  });

  it('leaves a frozen subtree as it is', () => {
    const root = new Group(), chunk = new Group(), mesh = new Group();
    root.add(chunk); chunk.add(mesh);
    mesh.position.x = 5;
    updateShownMatrices(root, object => object === chunk);
    expect(worldX(mesh)).toBe(0);
    updateShownMatrices(root, () => false);
    expect(worldX(mesh)).toBe(5);
  });
});
