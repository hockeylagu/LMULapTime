// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, CubeCamera, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, Texture, Vector3, type BufferGeometry, type Object3D, type PerspectiveCamera, OrthographicCamera, type Scene, type ShaderMaterial } from 'three';
import { createReplayScene } from '../../../../../src/components/replay/view3d/replayScene.js';
import { disposeObjects } from '../../../../../src/components/replay/view3d/laps/disposeObjects.js';
import { EXPOSURE_PASS } from '../../../../../src/components/replay/view3d/autoExposure.js';
import { SUN_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { SceneryChunk, SceneryLayoutResource, ScenerySectorChunk } from '../../../../../shared/types/scenes/scenery.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import { testCarPaint } from '../../../../helpers/scenes/syntheticPackage.js';
import { TEST_HAZE_WEIGHTS, testCamera, testShading, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const gpu = vi.hoisted(() => ({render: vi.fn<(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) => void>(), dispose: vi.fn(), constructed: vi.fn(), setSize: vi.fn(), upload: vi.fn<() => Promise<void>>()}));
const chunks = vi.hoisted(() => ({roots: new Map<string, Object3D>(), loads: [] as string[], obstacleName: ''}));
vi.mock('three-mesh-bvh/worker', async () => {
  const {MeshBVH} = await import('three-mesh-bvh');
  return {GenerateMeshBVHWorker: class {async generate(geometry: BufferGeometry) { return new MeshBVH(geometry, {indirect: true}); } dispose() {}}};
});
vi.mock('../../../../../src/components/replay/view3d/scenery/geometryWarmup.js', () => ({createGeometryWarmup: () => ({upload: gpu.upload, dispose() {}})}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, PMREMGenerator: class {
    fromScene() { return {texture: new actual.Texture(), dispose() {}}; }
    fromCubemap() { return {texture: new actual.Texture(), dispose() {}}; }
    compileCubemapShader() {}
    dispose() {}
  }, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    shadowMap = {enabled: false, type: 0}; capabilities = {maxTextureSize: 16384}; state = {buffers: {depth: {getReversed: () => false, setReversed() {}}}};
    coordinateSystem = actual.WebGLCoordinateSystem;
    render = gpu.render;
    dispose = gpu.dispose;
    constructor() { gpu.constructed(); }
    setSize = gpu.setSize;
    setPixelRatio() {}
    compileAsync() { return Promise.resolve(); }
    initTexture() {}
    initRenderTarget() {}
    forceContextLoss() {}
    getRenderTarget() { return null; }
    getActiveCubeFace() { return 0; }
    getActiveMipmapLevel() { return 0; }
    xr = {enabled: false};
    setRenderTarget() {}
    getDrawingBufferSize(size: {set(x: number, y: number): unknown}) { return size.set(1, 1); }
    readRenderTargetPixelsAsync() { return Promise.resolve(); }
    autoClear = true;
    getClearColor(color: InstanceType<typeof actual.Color>) { return color.set(0); }
    getClearAlpha() { return 1; }
    setClearColor() {}
    setClearAlpha() {}
    clear() {}
  }};
});
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const {rigModel} = await import('../../../../helpers/scenes/rigModel.js');
  return {GLTFLoader: class {
    setMeshoptDecoder() { return this; }
    async parseAsync() {
      const root = rigModel(), cockpit = new Group();
      root.traverse(object => { if (object instanceof Mesh) { const material = object.material as Material; material.userData.nativeMaterialId = 'm1'; material.name = 'body'; } });
      cockpit.name = 'cockpit-in'; cockpit.userData.cockpitView = 'in'; root.add(cockpit);
      for (const name of ['option_PlateA', 'option_PlateB']) {
        const material = new MeshBasicMaterial(), plate = new Mesh(new BoxGeometry(), material);
        material.userData.nativeMaterialId = 'm1'; plate.name = name; root.add(plate);
      }
      // A headlight glow (drawn with its unlit frame; its GLB node `lamp.Glow` loads as `lampGlow`), a brake glow (no texture for its frame) and a disc glow (no known frame): the last two left out.
      for (const name of ['lampGlow', 'brakeGlow', 'discGlow']) {
        const glowMaterial = new MeshBasicMaterial(), glow = new Mesh(new BoxGeometry(), glowMaterial);
        glowMaterial.userData.nativeMaterialId = 'glow'; glowMaterial.name = `${name}Material`; glow.name = name; root.add(glow);
      }
      return {scene: root};
    }
  }};
});
vi.mock('../../../../../src/components/replay/view3d/scenery/chunkLoader.js', () => ({createChunkLoader: () => ({
  async load(chunk: SceneryChunk, _signal: AbortSignal, onParsed?: (root: Object3D) => void) {
    chunks.loads.push(chunk.id);
    const root = new Group(), mesh = new Mesh(new BoxGeometry(200, 1, 200), new MeshBasicMaterial());
    mesh.name = chunk.kind === 'horizon' ? 'FILLER_GROUND__OPAQUE' : 'road__OPAQUE'; mesh.position.y = chunk.kind === 'horizon' ? -5.5 : -0.5;
    root.add(mesh);
    if (chunk.kind !== 'horizon' && chunks.obstacleName) {
      const obstacle = new Mesh(new BoxGeometry(2, 1, 8), new MeshBasicMaterial());
      obstacle.name = chunks.obstacleName;
      obstacle.position.set(24, 25.5, -35);
      root.add(obstacle);
    }
    chunks.roots.set(chunk.id, root);
    onParsed?.(root); // As the loader: the parsed root is handed over before its textures load.
    return root;
  },
  releaseChunk: (root: Object3D) => disposeObjects(root, true), releaseTexture() {}, dispose() {},
})}));
vi.mock('../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js', () => ({CachedKtx2Loader: class {
  async loadAsync() { return new Texture(); }
  release() {}
  dispose() {}
}}));

const lap: ReplayTrajectoryData = {
  replayName: 'test', layoutKey: 'portimao_wec', geometryRevision: 'g', dataPluginRevision: 'p', pointsCount: 7,
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 0.3, z: 0, timeSec: i * 0.2, rotY: 0, speedKmh: 30, stationM: i * 10})),
};
const box = (min: number, max: number) => ({min: [-100, min, -100] as [number, number, number], max: [100, max, 100] as [number, number, number]});
const base = {sha256: 'x', byteLength: 1, triangles: 1, vertices: 1, drawCalls: 1, shadowDrawCalls: 1, shadowTriangles: 1, geometryBytes: 1, meshes: 1, materials: 1, textures: [] as string[], bounds: box(0, 0)};
const sector = (index: number): ScenerySectorChunk => ({...base, id: `s${index}`, kind: 'main', asset: `scenery/s${index}.glb`, lapStartM: index * 1000, lapEndM: (index + 1) * 1000, prev: `s${(index + 3) % 4}`, next: `s${(index + 1) % 4}`});
const layout = {
  layoutKey: 'portimao_wec', sourceGeometryRevision: 'g', packageRevision: 'p', routeLengthM: 4000, pitLaneLengthM: 0, shadowRangeM: 750,
  streaming: {residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500},
  camera: testCamera(), sky: testSky(), shading: testShading(), environmentProbe: {position: [0, 0, 0]},
  daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9 },
  horizon: {...base, id: 'horizon', kind: 'horizon', asset: 'scenery/h.glb'}, sectors: [0, 1, 2, 3].map(sector), textures: [],
} as unknown as SceneryLayoutResource;
const car = {
  resource: {}, bytes: new ArrayBuffer(0), vehicleId: 'veh',
  descriptor: {optionNodes: ['option_PlateA', 'option_PlateB'], appearances: [{alias: 'VEH', albedo: 'textures/a.ktx2', paint: testCarPaint('textures/a.ktx2'), optionNodes: ['option_PlateA']}], materials: [{id: 'm1', name: 'body', paint: true}, {id: 'glow', name: 'glow', paint: true}], glowMaterialIds: ['glow'],
    lamps: [
      {role: 'headlight', nodes: ['lamp.Glow'], material: 'lampGlowMaterial', frames: ['textures/off.ktx2', 'textures/on.ktx2'], animation: {method: null, rate: null, sequence: null},
        emission: {scale: 500, vertexColour: false, viewBoost: {gain: 2, power: 64}, ambientScaled: false, vertexAlpha: false}, blend: 'alpha',
        states: {off: 0, on: null, brake: null}, defaultLit: false, hiddenInOwnCockpit: true},
      {role: 'brake', nodes: ['brakeGlow'], material: 'brakeGlowMaterial', frames: [null], animation: {method: null, rate: null, sequence: null},
        emission: {scale: 500, vertexColour: false, viewBoost: null, ambientScaled: false, vertexAlpha: false}, blend: 'alpha',
        states: {off: 0, on: null, brake: null}, defaultLit: false, hiddenInOwnCockpit: true},
      {role: 'discGlow', nodes: ['discGlow'], material: 'discGlowMaterial', frames: ['textures/disc.ktx2'], animation: {method: null, rate: null, sequence: null},
        emission: {scale: 10, vertexColour: false, viewBoost: null, ambientScaled: true, vertexAlpha: true}, blend: 'alpha',
        states: null, defaultLit: false, hiddenInOwnCockpit: null, brakeGlowRange: [640, 950]},
    ],
    cameras: {list: [
      {name: 'cockpit', position: [0.28, 1, -0.7], orientation: [-0.1, 0, 0], fov: [89, 49], clipPlanes: [0.13, 700], cockpitView: 'in'},
      {name: 'hood', position: [0.28, 0.9, -1.9], orientation: [0, 0, 0], fov: [80, 45], clipPlanes: [0.2, 800], cockpitView: 'out'},
      {name: 'roof', position: [0.28, 1.5, -0.6], orientation: [-0.1, 0, 0], fov: [60, 45], clipPlanes: [0.02, 550], cockpitView: 'out'},
    ]}},
} as unknown as LoadedBody;
const assets = {primary: car, baseline: null}, withGhost = {primary: car, baseline: car};
let frames: FrameRequestCallback[];
let resizeCallbacks: Array<() => void>;
const draw = () => { frames.splice(0).forEach(callback => callback(0)); };
/** Renders of the replay scene, without the exposure and metering passes. */
// Replay frames only: the exposure passes are named scenes, the occlusion passes draw a full-screen mesh, not a scene, the car's
// reflection probe renders through its cube camera's face cameras, and the reflection convolutions draw a quad with an orthographic camera.
const isFrame = (scene: Scene, camera: Object3D) => scene.isScene && scene.name !== EXPOSURE_PASS && !(camera.parent instanceof CubeCamera) && !(camera instanceof OrthographicCamera);
const sceneRenders = () => gpu.render.mock.calls.filter(([scene, camera]) => isFrame(scene, camera));
const lastSceneRender = () => sceneRenders().at(-1)!;
beforeEach(() => {
  vi.resetAllMocks(); frames = []; resizeCallbacks = []; chunks.roots.clear(); chunks.loads.length = 0; chunks.obstacleName = '';
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(() => callback([], this)); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['overpass__OPAQUE', 22.3],
  ['terrain__OPAQUE', 27.2],
])('uses ground clearance without carrying a camera lift past %s', async (name, expectedHeight) => {
  chunks.obstacleName = name;
  const renderedHeights: number[] = [];
  gpu.render.mockImplementation((_scene, camera) => { if (!isFrame(_scene, camera)) return; renderedHeights.push(camera.position.y); });
  const handle = await createReplayScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  expect(renderedHeights.at(-1)).toBeCloseTo(expectedHeight);
  handle.cursor(3, 0); draw();
  expect(renderedHeights.at(-1)).toBeCloseTo(22.3);
  handle.dispose();
});

it('serializes GPU warm-ups when several new sectors load together', async () => {
  const sectors = Array.from({length: 8}, (_, index) => ({...sector(index), prev: `s${(index + 7) % 8}`, next: `s${(index + 1) % 8}`}));
  const extended = {...layout, routeLengthM: 8000, sectors};
  const moving = {...lap, points: lap.points.map((point, index) => ({...point, stationM: index * 1000}))};
  const handle = await createReplayScene(document.createElement('div'), extended, moving, null, vi.fn(), assets);
  const releases: (() => void)[] = [];
  gpu.upload.mockClear().mockImplementation(() => new Promise<void>(resolve => { releases.push(resolve); }));
  try {
    handle.cursor(4, 0); draw();
    await vi.waitFor(() => expect(gpu.upload).toHaveBeenCalledOnce());
    releases[0]();
    await vi.waitFor(() => expect(gpu.upload).toHaveBeenCalledTimes(2));
    releases[1]();
    await vi.waitFor(() => expect(gpu.upload).toHaveBeenCalledTimes(3));
    releases[2]();
  } finally { releases.forEach(release => release()); handle.dispose(); }
});

it('caches static scenery matrices after the scene reflection without freezing the moving car', async () => {
  const handle = await createReplayScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
  try {
    // Chunks still loading behind the window join (and freeze) later.
    for (const root of [...chunks.roots.values()].filter(root => root.parent)) {
      expect(root.matrixWorldAutoUpdate).toBe(false);
      expect(root.matrixWorld.determinant()).toBeCloseTo(-1);
      root.traverse(object => { expect(object.matrixAutoUpdate).toBe(false); });
    }
    handle.cursor(0, 0); draw();
    const scene = lastSceneRender()[0];
    const primary = scene.getObjectByName('body-envelope')!.parent!;
    const first = primary.position.clone();
    handle.cursor(3, 0); draw();
    expect(primary.position.distanceTo(first)).toBeGreaterThan(0);
    expect(primary.matrixAutoUpdate).toBe(true);
  } finally { handle.dispose(); }
});

it('repaints a resized embedded canvas before paint, skipping notifications with unchanged dimensions', async () => {
  const host = document.createElement('div');
  let height = 540;
  Object.defineProperties(host, {clientWidth: {get: () => 460}, clientHeight: {get: () => height}});
  const handle = await createReplayScene(host, layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const camera = lastSceneRender()[1], eye = camera.position.clone();
  gpu.render.mockClear(); gpu.setSize.mockClear();
  resizeCallbacks[0](); expect(gpu.setSize).not.toHaveBeenCalled(); expect(sceneRenders()).toHaveLength(0);
  height = 514; resizeCallbacks[0]();
  // No animation callback has run: resizing already cleared the canvas, so it must be repainted now.
  expect(gpu.setSize).toHaveBeenCalledWith(460, 514, false); expect(sceneRenders()).toHaveLength(1);
  expect(camera.position).toEqual(eye);
  height = 540; resizeCallbacks[0](); expect(sceneRenders()).toHaveLength(2);
  handle.dispose();
});

it('retains scenery, canvas and camera settings, releases old laps, and draws the new primary and ghost', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, layout, lap, null, vi.fn(), assets);
  handle.cursor(2, 0); handle.mode('orbit'); handle.zoom(1); draw();
  const [scene, camera] = lastSceneRender();
  const lightingEnvironment = scene.environment;
  const eye = camera.position.clone(), zoom = camera.zoom, canvas = host.firstChild;
  const road = scene.getObjectByName('road__OPAQUE') as Mesh;
  const world = road.parent!.parent!.parent!;
  const oldLayer = world.children.at(-1)!;
  const oldCar = oldLayer.children[0], oldBody = oldCar.getObjectByName('body-envelope')!.getObjectByName('body') as Mesh<BufferGeometry, Material>;
  expect(oldBody.material.shadowSide).toBe(DoubleSide);
  // The entry's own option parts only: the other entries' alternatives are left out of its car.
  expect([oldCar.getObjectByName('option_PlateA'), oldCar.getObjectByName('option_PlateB')].map(Boolean)).toEqual([true, false]);
  // A glow is drawn only through a lamp with a known unlit frame that has a texture, with that lamp's own material.
  const headlight = oldCar.getObjectByName('lampGlow') as Mesh<BufferGeometry, ShaderMaterial>;
  expect(headlight.material.name).toBe('lamp-lampGlowMaterial');
  expect([headlight.material.uniforms.scale.value, headlight.castShadow, headlight.userData.cockpitView]).toEqual([500 * SUN_UNIT, false, 'out']);
  expect([oldCar.getObjectByName('brakeGlow'), oldCar.getObjectByName('discGlow')]).toEqual([undefined, undefined]);
  const roadDispose = vi.spyOn(road.geometry, 'dispose'), carDispose = vi.spyOn(oldBody.geometry, 'dispose'), materialDispose = vi.spyOn(oldBody.material, 'dispose');
  handle.colorLines('speed'); handle.fadeLines(0.12, 1);
  const next = {...lap, points: lap.points.map(point => ({...point, x: point.x + 5}))};
  expect(await handle.updateLaps(next, lap, withGhost)).toBe(true);
  handle.cursor(2, 0); draw();
  expect(host.firstChild).toBe(canvas); expect(gpu.constructed).toHaveBeenCalledOnce(); expect(gpu.dispose).not.toHaveBeenCalled();
  expect(scene.getObjectByName('road__OPAQUE')).toBe(road); expect(scene.environment).toBe(lightingEnvironment);
  // The car geometry is shared with the cached template; only the lap's materials are released.
  expect(roadDispose).not.toHaveBeenCalled(); expect(carDispose).not.toHaveBeenCalled(); expect(materialDispose).toHaveBeenCalled();
  expect(oldLayer.parent).toBeNull();
  expect(lastSceneRender()[1]).toBe(camera); expect(camera.position).toEqual(eye); expect(camera.zoom).toBe(zoom);
  const layer = world.children.at(-1)!;
  expect(layer.children[0].position.x).toBeCloseTo(7); expect(layer.children[1].visible).toBe(true);
  expect((layer.children[2] as Mesh<BufferGeometry, MeshBasicMaterial>).material.opacity).toBe(0.12);
  expect(await handle.updateLaps(next, null, assets)).toBe(true); handle.cursor(2, 0);
  expect(world.children.at(-1)!.children).toHaveLength(3);
  expect(world.children.at(-1)!.children[1].visible).toBe(false);
  handle.dispose(); expect(scene.environment).toBeNull();
  expect(roadDispose).toHaveBeenCalledOnce(); expect(gpu.dispose).toHaveBeenCalledOnce(); expect(host.childNodes).toHaveLength(0);
});

it('places the ghost at the same distance, the same lap time, or the same time since marker A', async () => {
  const handle = await createReplayScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
  try {
    // The baseline drives the same line at half speed.
    const slower = {...lap, points: lap.points.map(point => ({...point, timeSec: (point.timeSec ?? 0) * 2}))};
    expect(await handle.updateLaps(lap, slower, withGhost)).toBe(true);
    handle.cursor(4, 0); draw();
    const ghost = () => lastSceneRender()[0].getObjectByName('road__OPAQUE')!.parent!.parent!.parent!.children.at(-1)!.children[1];
    expect(ghost().position.x).toBeCloseTo(4);
    handle.syncGhost('time', null); handle.cursor(4, 0); draw();
    expect(ghost().position.x).toBeCloseTo(2);
    handle.syncGhost('anchored', 3); handle.cursor(4, 0); draw();
    expect(ghost().position.x).toBeCloseTo(3.5);
  } finally { handle.dispose(); }
});

it('rejects layout, geometry and package mismatches, and discards cancelled or superseded lap builds', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const scene = lastSceneRender()[0], road = scene.getObjectByName('road__OPAQUE')!;
  const world = road.parent!.parent!.parent!, original = world.children.at(-1);
  for (const invalid of [{...lap, layoutKey: 'spa_wec'}, {...lap, geometryRevision: 'g2'}, {...lap, dataPluginRevision: 'p2'}]) {
    await expect(handle.updateLaps(invalid, null, assets)).rejects.toThrow(/same layout, geometry and package/);
    await expect(handle.updateLaps(lap, invalid, withGhost)).rejects.toThrow(/same layout, geometry and package/);
  }
  const abort = new AbortController(), cancelled = handle.updateLaps(lap, lap, withGhost, abort.signal);
  abort.abort(); expect(await cancelled).toBe(false); expect(world.children.at(-1)).toBe(original);
  const stale = handle.updateLaps(lap, lap, withGhost), current = handle.updateLaps(lap, null, assets);
  expect(await stale).toBe(false); expect(await current).toBe(true); expect(world.children.at(-1)!.children).toHaveLength(3);
  const late = handle.updateLaps(lap, lap, withGhost); handle.dispose();
  expect(await late).toBe(false); expect(host.childNodes).toHaveLength(0);
});

it('puts the cockpit, hood and roof views on the game cameras of the car with their cockpit mesh, and zooms via projection matrix', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const [scene, camera] = lastSceneRender();
  const cockpit = scene.getObjectByName('cockpit-in')!, headlight = scene.getObjectByName('lampGlow')!;
  expect([cockpit.visible, headlight.visible]).toEqual([false, true]);

  handle.mode('cockpit'); draw();
  const modelOffset = scene.getObjectByName('body-envelope')!.position;
  // Switching modes must already be correct while paused, before another cursor update.
  expect(camera.position.x).toBeCloseTo(0.28, 2);
  expect(camera.position.y).toBeCloseTo(0.3 + modelOffset.y + 1.00, 2);
  expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(Math.sin(-0.1), 4);
  expect([(camera as PerspectiveCamera).fov, camera.near]).toEqual([49, 0.13]);
  handle.cursor(1, 0); draw();
  // The own car leaves its headlight glow out in the cockpit view.
  expect([cockpit.visible, headlight.visible]).toEqual([true, false]);

  // Driver eye position in cockpit mode: near car position + 0.28m lateral, +1.00m height
  const eye = camera.position.clone();
  expect(eye.x).toBeCloseTo(1.28, 2);
  expect(eye.y).toBeCloseTo(0.3 + modelOffset.y + 1.00, 2);

  // Zooming in cockpit mode adjusts camera.zoom rather than shifting camera position
  handle.zoom(1);
  expect(camera.zoom).toBeGreaterThan(1);
  expect(camera.position).toEqual(eye);

  // The hood camera sits on the bonnet with the exterior cockpit, ahead of the driver's eye.
  handle.mode('hood'); draw();
  expect(cockpit.visible).toBe(false);
  expect(camera.position.y).toBeCloseTo(0.3 + modelOffset.y + 0.9, 2);
  expect(camera.position.distanceTo(eye)).toBeCloseTo(Math.hypot(0.1, 1.2), 2);
  expect([(camera as PerspectiveCamera).fov, camera.near]).toEqual([45, 0.2]);

  // The roof camera sits above the roll hoop with the exterior cockpit.
  handle.mode('roof'); draw();
  expect(cockpit.visible).toBe(false);
  expect(camera.position.y).toBeCloseTo(0.3 + modelOffset.y + 1.5, 2);
  expect([(camera as PerspectiveCamera).fov, camera.near]).toEqual([45, 0.02]);

  // Exiting the car-mounted views restores the exterior mesh, Y-up vector and the default lens
  handle.mode('follow');
  expect(cockpit.visible).toBe(false);
  expect(camera.up.y).toBe(1);
  expect(camera.zoom).toBe(1);
  expect(camera.position.distanceTo(eye)).toBeGreaterThan(10);
  expect([(camera as PerspectiveCamera).fov, camera.near]).toEqual([48, 0.5]);
  handle.dispose();
});

it('loads the whole circuit, shows the window around the car, hides what left it, and follows a free camera', async () => {
  const host = document.createElement('div'), far = {...lap, points: [...lap.points.slice(0, 6), {...lap.points[6], stationM: 3000}]};
  const handle = await createReplayScene(host, layout, far, null, vi.fn(), assets);
  const shown = () => [...chunks.roots].filter(([, root]) => root.parent && root.visible).map(([id]) => id).sort();
  // Everything loads; at station 0 the window [-300, 1500] covers s0, s1 and the end of s3, never s2.
  await vi.waitFor(() => expect([...chunks.roots.values()].every(root => root.parent)).toBe(true));
  expect([...chunks.roots.keys()].sort()).toEqual(['horizon', 's0', 's1', 's2', 's3']);
  expect(shown()).toEqual(['horizon', 's0', 's1', 's3']);
  handle.cursor(6, 0); draw();
  // At station 3000 the window [2700, 4500) covers s2, s3 and the start of s0; s1 left it plus the hysteresis margin.
  expect(shown()).toEqual(['horizon', 's0', 's2', 's3']);
  expect(chunks.loads.filter(id => id === 's2')).toHaveLength(1);
  // An orbit camera is planned around its own position, not the lap distance.
  handle.mode('orbit'); draw();
  handle.dispose();
  expect(chunks.roots.get('horizon')!.parent).toBeNull();
});
