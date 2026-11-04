import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { makeCar, setCockpitView } from '../../../../src/components/replay/view3d/sceneObjects.js';
import { disposeObjects } from '../../../../src/components/replay/view3d/laps/disposeObjects.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { rigModel } from '../../../helpers/scenes/rigModel.js';

const lap = {replayName: 'test', points: [], pointsCount: 0, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, vehicleData: {replayOriginOffsetXZ: [0.5, -0.25]}} as unknown as ReplayTrajectoryData;

it('places the textured model by the vehicle origin offset and adds a hidden pose marker', () => {
  const car = makeCar(lap, '#38bdf8', false, rigModel()), envelope = car.getObjectByName('body-envelope')!;
  expect(envelope.position.toArray()).toEqual([0.5, 0, -0.25]);
  expect(car.getObjectByName('pose-marker')!.visible).toBe(false);
  expect(envelope.getObjectByName('wheel_fl')).toBeDefined();
  const body = car.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(body.material.opacity).toBe(1); expect(body.material.polygonOffset).toBe(false);
});

it('makes ghosts translucent, unreflective and depth-ordered without touching the primary', () => {
  const primary = makeCar(lap, '#38bdf8', false, rigModel()), ghost = makeCar(lap, '#ffb703', true, rigModel());
  const ghostBody = ghost.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  const primaryBody = primary.getObjectByName('body') as Mesh<BoxGeometry, MeshStandardMaterial>;
  expect(ghostBody.material.opacity).toBe(0.45); expect(ghostBody.material.transparent).toBe(true); expect(ghostBody.material.depthWrite).toBe(false);
  expect(ghostBody.material.envMapIntensity).toBe(0); expect(ghostBody.material.polygonOffset).toBe(true); expect(ghostBody.renderOrder).toBeGreaterThan(0);
  expect(primaryBody.material.opacity).toBe(1); expect(primaryBody.renderOrder).toBe(0);
});

it('switches the driver-camera and exterior cockpit meshes marked in the model', () => {
  const model = rigModel(), inside = new Group(), outside = new Group();
  inside.userData.cockpitView = 'in'; outside.userData.cockpitView = 'out'; model.add(inside, outside);
  const car = makeCar(lap, '#38bdf8', false, model);
  expect([inside.visible, outside.visible]).toEqual([false, true]);
  setCockpitView(car, 'in'); expect([inside.visible, outside.visible]).toEqual([true, false]);
});

it('shares geometry marked sharedAsset and respects includeShared on disposal', () => {
  const source = new Group(), geom = new BoxGeometry(2, 1, 4); geom.userData.sharedAsset = true;
  const mesh = new Mesh(geom, new MeshStandardMaterial()); mesh.name = 'shared'; source.add(mesh);
  const car = makeCar(lap, '#38bdf8', false, source);
  expect((car.getObjectByName('shared') as Mesh).geometry).toBe(geom);
  const dispose = vi.spyOn(geom, 'dispose');
  disposeObjects(car, false); expect(dispose).not.toHaveBeenCalled();
  disposeObjects(car, true); expect(dispose).toHaveBeenCalledOnce();
});
