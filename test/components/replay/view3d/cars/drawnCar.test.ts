import { describe, expect, it, vi } from 'vitest';
import { BatchedMesh, BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { CarTextures } from '../../../../../src/components/replay/view3d/cars/carModels.js';
import type { CarTemplates } from '../../../../../src/components/replay/view3d/cars/carTemplates.js';
import { createCarSets, createDrawnCars } from '../../../../../src/components/replay/view3d/cars/drawnCar.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/sceneObjects.js';
import { rigModel } from '../../../../helpers/scenes/rigModel.js';

/** Whether each loader made shares materials; its models are the rig with a cabin part (the interior) and two glass panes. */
const loaders = vi.hoisted(() => [] as boolean[]);
vi.mock('../../../../../src/components/replay/view3d/cars/carModels.js', async () => {
  const three = await import('three'), {rigModel: rig} = await import('../../../../helpers/scenes/rigModel.js');
  const {makeCar: make} = await import('../../../../../src/components/replay/view3d/cars/sceneObjects.js');
  const withParts = () => {
    const model = rig(), cabin = new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshStandardMaterial());
    cabin.name = 'cabin'; cabin.userData.interior = true;
    const tint = new three.MeshStandardMaterial({transparent: true, opacity: 0.4}), pane = new three.BoxGeometry(1, 1, 1);
    model.add(cabin, new three.Mesh(pane, tint), new three.Mesh(pane, tint));
    return model;
  };
  return {
    createCarModels: (_templates: unknown, _textures: unknown, _shading: unknown, {shareMaterials = false} = {}) => {
      loaders.push(shareMaterials);
      return {model: async () => withParts(), car: async () => make('#38bdf8', false, withParts()), sharedMaterial: () => shareMaterials};
    },
  };
});

/** The rig model plus two body panels of one material: a batch. */
function model(): Group {
  const rig = rigModel(), geometry = new BoxGeometry(1, 1, 1), carbon = new MeshStandardMaterial({shadowSide: DoubleSide});
  for (const x of [0, 1]) { const panel = new Mesh(geometry, carbon); panel.position.x = x; panel.castShadow = true; rig.add(panel); }
  return rig;
}

const batchesIn = (car: Group) => car.children.filter(child => child instanceof BatchedMesh);

describe('createDrawnCars', () => {
  it('batches a lone car into its own batches, which draw once ready and go with the car', () => {
    const root = new Group(), set = createDrawnCars([makeCar('#38bdf8', false, model())], () => 0), [drawn] = set.cars;
    root.add(drawn.car);
    expect(set.shared).toBeNull();
    expect(drawn.parts.own.length).toBeGreaterThan(0);
    expect(batchesIn(drawn.car)).toEqual(drawn.parts.own);
    // Its solid parts cast from the shadow-only batch.
    expect(drawn.parts.own.some(batch => batch.name === 'car shadow batch')).toBe(true);
    drawn.parts.sync(); set.ready();
    expect(drawn.parts.own.some(batch => batch.visible)).toBe(true);
    set.dispose();
    expect(root.children).toHaveLength(0);
    expect(batchesIn(drawn.car)).toHaveLength(0);
  });

  it('batches the cars of a set together, their shared batches for the caller to place', () => {
    const shared = model(), set = createDrawnCars([makeCar('#38bdf8', false, shared.clone()), makeCar('#38bdf8', false, shared.clone())], () => 0);
    expect(set.shared?.children.length).toBeGreaterThan(0);
    for (const drawn of set.cars) expect(batchesIn(drawn.car)).toHaveLength(0);
    set.dispose();
    expect(set.shared!.children).toHaveLength(0);
  });

  it('leaves the materials other cars draw with when dropped', () => {
    const rig = model(), panel = rig.children.find(child => child instanceof Mesh) as Mesh<BoxGeometry, MeshStandardMaterial>;
    const material = panel.material, disposed: unknown[] = [];
    material.addEventListener('dispose', () => disposed.push(material));
    createDrawnCars([makeCar('#38bdf8', false, rig)], () => 0, {sharedMaterial: each => each === material}).dispose();
    expect(disposed).toHaveLength(0);
  });

  it('keeps a car part by part when not batched', () => {
    const set = createDrawnCars([makeCar('#38bdf8', true, model())], () => 0, {batched: false}), [drawn] = set.cars;
    expect(drawn.parts.own).toHaveLength(0);
    expect(batchesIn(drawn.car)).toHaveLength(0);
    expect(() => { set.ready(); set.dispose(); }).not.toThrow();
  });
});

describe('createCarSets', () => {
  const sets = () => createCarSets({} as CarTemplates, {} as CarTextures, {} as SceneryShading, () => 0);
  const body = {vehicleId: 'oreca'} as unknown as LoadedBody;
  const sortedBatches = (car: Group) => batchesIn(car).filter(batch => batch.sortObjects);

  it('builds the own car and the field on one path: glass sorted in its batch, the interior kept only by the own car', async () => {
    const built = sets(), own = await built.build([body], {own: true}), field = await built.build([body], {own: false});
    expect(loaders).toEqual([false, true]);
    expect(own.cars[0].car.getObjectByName('cabin')).toBeDefined();
    expect(field.cars[0].car.getObjectByName('cabin')).toBeUndefined();
    for (const set of [own, field]) expect(sortedBatches(set.cars[0].car)).toHaveLength(1);
    own.dispose(); field.dispose();
  });

  it('keeps the ghost part by part, see-through and without shadows', async () => {
    const ghost = await sets().ghost(body);
    expect(ghost.parts.own).toHaveLength(0);
    ghost.car.traverse(object => { if (object instanceof Mesh) expect(object.castShadow || object.receiveShadow).toBe(false); });
  });
});
