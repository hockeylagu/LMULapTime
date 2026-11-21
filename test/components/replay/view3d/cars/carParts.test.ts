import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { buildCarParts, setCameraDistance, setCockpitView } from '../../../../../src/components/replay/view3d/cars/carParts.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/carObject.js';
import { rigModel } from '../../../../helpers/scenes/rigModel.js';

const box = new BoxGeometry(1, 1, 1), material = new MeshStandardMaterial();

/** A marked group holding one mesh: the group stays visible, its mesh switches. */
function marked(userData: Record<string, unknown>): { group: Group; mesh: Mesh } {
  const group = new Group(), mesh = new Mesh(box, material);
  Object.assign(group.userData, userData); group.add(mesh);
  return { group, mesh };
}

const expectClose = (actual: Matrix4, expected: Matrix4) => actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 6));

describe('buildCarParts', () => {
  it('takes the car out of the renderer matrix walk and keeps its own matrix updated', () => {
    const car = makeCar('#38bdf8', false, rigModel());
    expect(car.matrixWorldAutoUpdate).toBe(true);
    buildCarParts(car);
    expect(car.matrixWorldAutoUpdate).toBe(false);
    expect(car.matrixAutoUpdate).toBe(true);
  });

  it('switches the driver-camera and exterior cockpit meshes at the next sync', () => {
    const model = rigModel(), inside = marked({ cockpitView: 'in' }), outside = marked({ cockpitView: 'out' });
    model.add(inside.group, outside.group);
    const car = makeCar('#38bdf8', false, model), table = buildCarParts(car);
    // Marked non-mesh groups stay visible: their meshes switch instead.
    expect([inside.group.visible, outside.group.visible]).toEqual([true, true]);
    table.sync();
    expect([inside.mesh.visible, outside.mesh.visible]).toEqual([false, true]);
    setCockpitView(car, 'in');
    expect([inside.mesh.visible, outside.mesh.visible]).toEqual([false, true]);
    table.sync();
    expect([inside.mesh.visible, outside.mesh.visible]).toEqual([true, false]);
    expect([inside.group.visible, outside.group.visible]).toEqual([true, true]);
  });

  it('draws each part within its distance range, together with the cockpit variant', () => {
    const model = rigModel(), full = marked({ lod: { inM: 0, outM: 50 } }), far = marked({ lod: { inM: 50, outM: null } });
    const small = marked({ lod: { inM: 0, outM: 10 } }), outside = marked({ cockpitView: 'out', lod: { inM: 0, outM: 50 } });
    model.add(full.group, far.group, small.group, outside.group);
    const car = makeCar('#38bdf8', false, model), table = buildCarParts(car), shown = () => [full, far, small, outside].map(part => part.mesh.visible);
    table.sync(); expect(shown()).toEqual([true, false, true, true]);
    setCameraDistance(car, 10); table.sync(); expect(shown()).toEqual([true, false, false, true]);
    setCameraDistance(car, 50); table.sync(); expect(shown()).toEqual([false, true, false, false]);
    setCockpitView(car, 'in'); setCameraDistance(car, 0); table.sync(); expect(shown()).toEqual([true, false, true, false]);
    expect([full, far, small, outside].map(part => part.group.visible)).toEqual([true, true, true, true]);
  });

  it('marks a level change only when the distance crosses a threshold', () => {
    const model = rigModel(), full = marked({ lod: { inM: 0, outM: 50 } }), small = marked({ lod: { inM: 0, outM: 10 } });
    model.add(full.group, small.group);
    const car = makeCar('#38bdf8', false, model), table = buildCarParts(car);
    setCameraDistance(car, 0); table.sync();
    // A sentinel the sync would overwrite on a re-level: it does not run while the distance stays inside a band.
    full.mesh.visible = false;
    setCameraDistance(car, 5); table.sync();
    expect(full.mesh.visible).toBe(false);
    setCameraDistance(car, 9.9); table.sync();
    expect(full.mesh.visible).toBe(false);
    setCameraDistance(car, 10); table.sync();
    expect([full.mesh.visible, small.mesh.visible]).toEqual([true, false]);
    // The same view again changes nothing either.
    full.mesh.visible = false; setCockpitView(car, 'out'); table.sync();
    expect(full.mesh.visible).toBe(false);
  });

  it('places an unbatched part at car world x anchor frame x rel, following the car and a turning spin node', () => {
    const model = new Group(), spin = new Group(), part = new Mesh(box, material);
    spin.name = 'spin_fl'; spin.position.set(1, 0.3, 1); part.position.set(0.5, 0, 0.2); part.rotation.y = 0.4; spin.add(part); model.add(spin);
    const field = new Group(), car = makeCar('#38bdf8', false, model), table = buildCarParts(car);
    field.position.set(100, 0, -20); field.rotation.y = 0.7; field.add(car);
    car.position.set(5, 0, 7); car.rotation.y = -1.1;
    table.sync();
    const check = () => {
      const world = part.matrixWorld.clone();
      part.updateWorldMatrix(true, false);
      expectClose(world, part.matrixWorld);
    };
    check();
    car.position.set(-3, 1, 2); car.rotation.y = 2; spin.rotation.x = 0.9;
    table.sync();
    check();
    field.updateMatrix();
    const expected = new Matrix4().multiplyMatrices(field.matrix, car.matrix).multiply(spin.matrix).multiply(part.matrix);
    expectClose(part.matrixWorld, expected);
  });
});
