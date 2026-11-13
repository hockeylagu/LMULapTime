import { expect, it } from 'vitest';
import { BatchedMesh, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import { createFieldBatches } from '../../../../../src/components/replay/view3d/race/fieldBatches.js';

/** Two cars of one body: the shared geometry and paint material, a part each on its own material, and a glass part drawn alone. */
function body() {
  const shell = new BoxGeometry(2, 1, 4), wheel = new BoxGeometry(0.7, 0.7, 0.3), glass = new BoxGeometry(1, 0.3, 1);
  const paint = new MeshStandardMaterial(), rubber = new MeshStandardMaterial(), clear = new MeshStandardMaterial({transparent: true});
  const car = () => {
    const model = new Group(), envelope = new Group(), spin = new Mesh(wheel, rubber);
    envelope.add(new Mesh(shell, paint), spin, new Mesh(glass, clear));
    model.add(envelope);
    return {model, spin};
  };
  return {shell, wheel, glass, cars: [car(), car()]};
}

const batchesOf = (group: Group) => group.children as BatchedMesh[];

it('draws the cars of a body from one batch per material, with one copy of each geometry, and keeps their parts as stand-ins', () => {
  const {shell, wheel, glass, cars} = body();
  const {batches, cars: field} = createFieldBatches().addBody(cars.map(car => car.model));
  expect(batchesOf(batches).map(batch => batch.maxInstanceCount)).toEqual([2, 2]);
  expect(field).toHaveLength(2);
  // The batched geometries leave the parsed body (their bounds stay); the glass, drawn on its own, keeps its vertices.
  for (const geometry of [shell, wheel] as BufferGeometry[]) {
    expect(geometry.attributes.position.array).toBeNull();
    expect(geometry.boundingBox).not.toBeNull();
  }
  expect(glass.attributes.position.array).not.toBeNull();
  cars[0].model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    expect(object.layers.mask === 0).toBe(!(object.material as MeshStandardMaterial).transparent);
  });
});

it('shows a car in its batches at its parts\' pose and visibility, and leaves a batch out while no car shows in it', () => {
  const {cars} = body();
  const {batches, cars: field, ready} = createFieldBatches().addBody(cars.map(car => car.model));
  ready();
  expect(batchesOf(batches).every(batch => !batch.visible)).toBe(true);
  cars[0].model.position.set(10, 0, 0); cars[0].spin.position.set(1, 0, 2);
  for (const node of [cars[0].model, cars[0].spin]) node.updateMatrix();
  field[0].show(true);
  expect(batchesOf(batches).every(batch => batch.visible)).toBe(true);
  const [paintBatch, wheelBatch] = batchesOf(batches);
  expect([paintBatch.getVisibleAt(0), paintBatch.getVisibleAt(1)]).toEqual([true, false]);
  const matrix = wheelBatch.getMatrixAt(0, new Matrix4());
  expect(matrix.elements.slice(12, 15)).toEqual([11, 0, 2]);
  // A part hidden in its model (another distance level) leaves its batch.
  cars[0].spin.visible = false; field[0].show(true);
  expect([wheelBatch.getVisibleAt(0), wheelBatch.visible]).toEqual([false, false]);
  field[0].show(false);
  expect(paintBatch.visible).toBe(false);
});
