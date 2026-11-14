import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Vector3, type Material, type Mesh, type Object3D } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { RaceReplayCar } from '../../../../../shared/types/replay.js';
import { RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import type { RenderPose } from '../../../../../src/components/replay/view3d/scene/replayPose.js';
import type { SceneShell } from '../../../../../src/components/replay/view3d/scene/sceneShell.js';
import { createRaceField } from '../../../../../src/components/replay/view3d/race/raceField.js';
import { createCarSets } from '../../../../../src/components/replay/view3d/cars/drawnCar.js';

const models = vi.hoisted(() => ({far: new Map<number, unknown>(), near: new Map<number, unknown>(), nearCalls: 0, nearActive: 0, nearPeak: 0}));

vi.mock('../../../../../src/components/replay/view3d/cars/farCars.js', async () => {
  const three = await import('three');
  return {
    createFarCarLoader: () => ({
      model: async (body: {vehicleId: number}) => {
        const group = new three.Group();
        group.add(new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshStandardMaterial()), new three.Mesh(new three.BoxGeometry(1, 1, 2), new three.MeshStandardMaterial()));
        models.far.set(body.vehicleId, group);
        return group;
      },
    }),
  };
});

vi.mock('../../../../../src/components/replay/view3d/cars/carModels.js', async () => {
  const three = await import('three');
  return {
    createCarModels: () => ({
      sharedMaterial: () => false,
      car: async (body: {vehicleId: number}) => {
        models.nearCalls++; models.nearActive++; models.nearPeak = Math.max(models.nearPeak, models.nearActive);
        await new Promise(resolve => setTimeout(resolve, 5));
        models.nearActive--;
        const group = new three.Group();
        group.add(new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshStandardMaterial()));
        group.name = 'near-model';
        models.near.set(body.vehicleId, group);
        return group;
      },
    }),
  };
});

vi.mock('../../../../../src/components/replay/view3d/cars/carMotion.js', () => ({
  createCarMotion: () => ({setTrack: vi.fn(), refreshHeights: vi.fn(), update: vi.fn()}),
}));

const FROM_M = 60;

const body = (slot: number): LoadedBody => ({
  vehicleId: slot, resource: {folder: 'oreca', vehicleIds: ['oreca'], far: {fromM: FROM_M}}, descriptor: {},
} as unknown as LoadedBody);

const makeCars = (count: number): RaceReplayCar[] => Array.from({length: count}, (_, slot) => ({slot, vehicleId: 'oreca', handling: undefined}) as unknown as RaceReplayCar);

const poseAt = (z: number): RenderPose => ({x: 0, y: 0, z, yaw: 0, index: 0, fraction: 0});

const windowOf = (count: number): RacePoseWindow => ({
  fromSec: 0, hz: 5, count: 2, slots: Array.from({length: count}, (_, slot) => slot), data: new Float32Array(count * 2 * RACE_POSE_CHANNEL_COUNT),
});

function setup(count: number, bodyOf: (slot: number) => Promise<LoadedBody | null> = async slot => body(slot), warm: (object: Object3D) => Promise<void> = async () => {}) {
  const root = new Group(), changed = vi.fn(), report = vi.fn(), cars = makeCars(count), window = windowOf(count);
  const shell = {
    origin: new Vector3(), carTextures: {}, report, carTemplates: {hold: vi.fn(), release: vi.fn()}, exposureDisplay: () => ({}), surfaceHeight: () => 0, warm,
    placeCar: (car: Object3D, pose: RenderPose) => { car.position.set(pose.x, pose.y, pose.z); car.updateMatrix(); },
  } as unknown as SceneShell;
  const sets = createCarSets(shell.carTemplates, shell.carTextures, {} as SceneryShading, shell.surfaceHeight);
  const bodyOfSpy = vi.fn(bodyOf);
  const farModel = vi.fn((_slot: number, car: Group) => expect(car.getObjectByName('body-envelope')).toBeDefined());
  const field = createRaceField(shell, sets, root, cars, bodyOfSpy, changed, farModel);
  const camera = new PerspectiveCamera(60, 1.6, 0.1, 2000);
  root.updateMatrixWorld();
  const place = (slot: number, z: number | null) => field.pose(slot, z === null ? null : poseAt(z), window, slot);
  /** The slot's far car: the root child holding the far model made for it. */
  const farCar = (slot: number) => root.children.find(child => child.getObjectByName('body-envelope') === models.far.get(slot))!;
  const nearCar = (slot: number) => models.near.get(slot) as Group | undefined;
  const ready = async (slots: number[]) => {
    field.load(slots.map(slot => ({slot, metres: slot})));
    await vi.waitFor(() => expect(slots.every(slot => field.has(slot))).toBe(true));
  };
  return {field, root, changed, camera, place, farCar, nearCar, ready, bodyOfSpy, report, farModel, templates: shell.carTemplates as unknown as {hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>}};
}

describe('createRaceField', () => {
  beforeEach(() => { models.far.clear(); models.near.clear(); models.nearCalls = 0; models.nearActive = 0; models.nearPeak = 0; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('loads a body once for all its cars, and keeps a car without a body as a stand-in', async () => {
    const {field, changed, bodyOfSpy, root} = setup(3, async slot => (slot === 2 ? null : body(slot)));
    expect(field.has(0)).toBe(false);
    field.load([{slot: 0, metres: 10}]);
    await vi.waitFor(() => expect(field.has(0)).toBe(true));
    expect(field.has(1)).toBe(true);
    expect(field.has(2)).toBe(false);
    expect(models.far.size).toBe(2);
    expect(changed).toHaveBeenCalled();
    expect(root.children.length).toBeGreaterThan(2);
    // The body is loaded: asking again for a car of it starts nothing.
    const before = bodyOfSpy.mock.calls.length;
    field.load([{slot: 1, metres: 10}]);
    await Promise.resolve();
    expect(bodyOfSpy.mock.calls.length).toBe(before);
  });

  it("counts the cars asked for and those settled for the scene's corner note, a car without a body included", async () => {
    const {field, report} = setup(3, async slot => (slot === 2 ? null : body(slot)));
    field.load([{slot: 0, metres: 10}, {slot: 2, metres: 20}]);
    expect(report).toHaveBeenLastCalledWith({carModels: {loaded: 0, total: 2}});
    // Car 0's body serves car 1 too; car 2 has none and stays a stand-in.
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith({carModels: {loaded: 3, total: 3}}));
    report.mockClear(); field.load([{slot: 1, metres: 5}]);
    expect(report).not.toHaveBeenCalled(); // Nothing new: no report.
  });

  it("shows each car's far model to the stand-ins as it is built, the car without a body not", async () => {
    const {field, farModel} = setup(3, async slot => (slot === 2 ? null : body(slot)));
    field.load([{slot: 0, metres: 10}, {slot: 2, metres: 20}]);
    await vi.waitFor(() => expect(field.has(1)).toBe(true));
    expect(farModel.mock.calls.map(([slot]) => slot).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('builds every full model of a body when its first car turns near, and draws the six nearest in view with theirs', async () => {
    const {field, camera, place, farCar, nearCar, ready} = setup(8);
    await ready([...Array(8).keys()]);
    for (let slot = 0; slot < 8; slot++) place(slot, -10 - slot * 2);
    field.beforeDraw(camera);
    await vi.waitFor(() => { field.beforeDraw(camera); expect([0, 1, 2, 3, 4, 5].every(slot => nearCar(slot)?.visible)).toBe(true); });
    // One build for the body: all eight full models at once.
    expect(models.nearCalls).toBe(8);
    expect(models.nearPeak).toBe(8);
    for (let slot = 0; slot < 6; slot++) expect(farCar(slot).visible).toBe(false);
    for (const slot of [6, 7]) {
      expect(nearCar(slot)!.visible).toBe(false);
      expect(farCar(slot).visible).toBe(true);
    }
  });

  it('fits a far model to the road under its poses: its lowest point on the road', async () => {
    const {field, camera, place, farCar, ready} = setup(1);
    await ready([0]);
    place(0, -(FROM_M + 5));
    field.beforeDraw(camera);
    // The far model's boxes reach 0.5 m below its origin (`BoxGeometry(1, 1, 1)`), the road is at 0 and so are the poses.
    expect(farCar(0).getObjectByName('body-envelope')!.position.y).toBeCloseTo(0.5);
  });

  it('draws a car beyond its far distance as the far model', async () => {
    const {field, camera, place, farCar, ready} = setup(1);
    await ready([0]);
    place(0, -(FROM_M + 5));
    field.beforeDraw(camera);
    expect(farCar(0).visible).toBe(true);
    expect(models.nearCalls).toBe(0);
  });

  it('keeps a near car near and a far car far between the entering and the leaving distance', async () => {
    const {field, camera, place, farCar, nearCar, ready} = setup(2);
    await ready([0, 1]);
    place(0, -20); place(1, -0.9 * FROM_M);
    field.beforeDraw(camera);
    await vi.waitFor(() => { field.beforeDraw(camera); expect(nearCar(0)).toBeDefined(); });
    // Slot 1 at 0.9 of the distance never turned near.
    expect(farCar(1).visible).toBe(true);
    expect(nearCar(1)!.visible).toBe(false);
    place(0, -0.9 * FROM_M);
    field.beforeDraw(camera);
    expect(nearCar(0)!.visible).toBe(true);
    expect(farCar(0).visible).toBe(false);
    place(0, -1.05 * FROM_M);
    field.beforeDraw(camera);
    expect(nearCar(0)!.visible).toBe(false);
    expect(farCar(0).visible).toBe(true);
    // Back at 0.9 it is far: only the entering distance brings it near again.
    place(0, -0.9 * FROM_M);
    field.beforeDraw(camera);
    expect(farCar(0).visible).toBe(true);
    expect(nearCar(0)!.visible).toBe(false);
  });

  it('hides both models of a car behind the camera or without a pose', async () => {
    const {field, camera, place, farCar, nearCar, ready} = setup(2);
    await ready([0, 1]);
    place(0, -15); place(1, -20);
    field.beforeDraw(camera);
    await vi.waitFor(() => { field.beforeDraw(camera); expect(nearCar(0) && nearCar(1)).toBeTruthy(); });
    field.beforeDraw(camera);
    expect(nearCar(0)!.visible).toBe(true);
    place(0, 30); // Behind the camera.
    place(1, null);
    field.beforeDraw(camera);
    for (const slot of [0, 1]) {
      expect(nearCar(slot)!.visible).toBe(false);
      expect(farCar(slot).visible).toBe(false);
    }
  });

  it('keeps the full models: a car near again draws its model at once, loading nothing', async () => {
    const {field, camera, place, nearCar, ready} = setup(2);
    await ready([0, 1]);
    place(0, -15); place(1, -500);
    await vi.waitFor(() => { field.beforeDraw(camera); expect(nearCar(0)?.visible).toBe(true); });
    const first = nearCar(0);
    place(0, -500); place(1, -15);
    field.beforeDraw(camera);
    expect(nearCar(0)!.visible).toBe(false);
    expect(nearCar(1)!.visible).toBe(true);
    place(0, -15); place(1, -500);
    field.beforeDraw(camera);
    expect(nearCar(0)).toBe(first);
    expect(nearCar(0)!.visible).toBe(true);
    expect(models.nearCalls).toBe(2);
  });

  it('holds the parse of a body from its near build while any of its cars is near', async () => {
    const {field, camera, place, nearCar, ready, templates} = setup(2);
    await ready([0, 1]);
    place(0, -15); place(1, -500);
    await vi.waitFor(() => { field.beforeDraw(camera); expect(nearCar(0)?.visible).toBe(true); });
    expect(templates.hold).toHaveBeenCalledTimes(1);
    expect(templates.release).not.toHaveBeenCalled();
    place(0, -500);
    field.beforeDraw(camera);
    expect(templates.release).toHaveBeenCalledTimes(1);
    field.beforeDraw(camera);
    expect(templates.release).toHaveBeenCalledTimes(1);
  });

  it('removes its cars and batches from the root on dispose', async () => {
    const {field, root, camera, place, nearCar, ready} = setup(2);
    await ready([0, 1]);
    place(0, -15); place(1, -20);
    field.beforeDraw(camera);
    await vi.waitFor(() => { field.beforeDraw(camera); expect(nearCar(0) && nearCar(1)).toBeTruthy(); });
    expect(root.children.length).toBeGreaterThan(4); // Two far cars, two full models, the shared batches.
    field.dispose();
    expect(root.children).toHaveLength(0);
  });

  /** The far cars' own materials (the mocked far models'), each spied for its dispose. */
  const farMaterialSpies = () => [...models.far.values()].flatMap(model => (model as Group).children.map(mesh => vi.spyOn((mesh as Mesh).material as Material, 'dispose')));

  it('frees the far cars a body built when the field goes while they compile', async () => {
    let compiled!: () => void, compiling!: () => void;
    const started = new Promise<void>(resolve => { compiling = resolve; }), gate = new Promise<void>(resolve => { compiled = resolve; });
    const {field, root} = setup(2, undefined, async () => { compiling(); await gate; });
    field.load([{slot: 0, metres: 10}]);
    await started;
    const freed = farMaterialSpies();
    expect(freed).toHaveLength(4);
    field.dispose(); compiled();
    await vi.waitFor(() => expect(freed.every(spy => spy.mock.calls.length === 1)).toBe(true));
    expect(root.getObjectByName('body-envelope')).toBeUndefined();
  });

  it('frees the far cars a body built when their compile fails, and keeps those cars stand-ins', async () => {
    let compiling!: () => void;
    const started = new Promise<void>(resolve => { compiling = resolve; });
    const {field} = setup(2, undefined, async () => { compiling(); await Promise.resolve(); throw Error('compile failed'); });
    field.load([{slot: 0, metres: 10}]);
    await started;
    const freed = farMaterialSpies();
    await vi.waitFor(() => expect(freed.every(spy => spy.mock.calls.length === 1)).toBe(true));
    expect([field.has(0), field.has(1)]).toEqual([false, false]);
  });
});
