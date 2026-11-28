// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { descriptorTexturePath } from '../../../../../shared/packageContract/index.js';
import { BoxGeometry, CubeCamera, DirectionalLight, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, Texture, Vector3, type BufferGeometry, type Object3D, type PerspectiveCamera, OrthographicCamera, type Scene, type ShaderMaterial } from 'three';
import { createReplayScene, lapFirstStation } from '../../../../../src/components/replay/view3d/laps/replayScene.js';
import { createSceneShell, type SceneShell } from '../../../../../src/components/replay/view3d/scene/sceneShell.js';
import { describeLoad, type SceneLoadProgress } from '../../../../../src/components/replay/view3d/scene/loadProgress.js';
import { sceneSun } from '../../../../../src/components/replay/view3d/sceneEnvironment.js';
import { EXPOSURE_PASS } from '../../../../../src/components/replay/view3d/autoExposure.js';
import { isStreaming } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import { GAME_LIGHT_UNIT } from '../../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { SceneryChunk, SceneryLayoutResource, ScenerySectorChunk } from '../../../../../shared/types/scenes/scenery.js';
import type { LoadedBody } from '../../../../../src/api/vehicles/bodyApi.js';
import { testCarPaint } from '../../../../helpers/scenes/syntheticPackage.js';
import { TEST_HAZE_WEIGHTS, testCamera, testLayoutNight, testShading, testSky } from '../../../../helpers/scenes/sceneryProfiles.js';

const gpu = vi.hoisted(() => ({render: vi.fn<(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) => void>(), dispose: vi.fn(), constructed: vi.fn(), setSize: vi.fn(), upload: vi.fn<() => Promise<void>>()}));
const chunks = vi.hoisted(() => ({roots: new Map<string, Object3D>(), loads: [] as string[], obstacleName: ''}));
/** Car texture reads with the start file each was read from, and the textures read from one. */
const carTextureLoads = vi.hoisted(() => ({paths: [] as string[], started: new WeakSet<object>()}));
import { hazePart } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { composedMaterial } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { unlitTemplate } from '../../../../../src/components/replay/view3d/shaders/unlitTemplate.js';
vi.mock('three-mesh-bvh/worker', async () => {
  const {MeshBVH} = await import('three-mesh-bvh');
  return {GenerateMeshBVHWorker: class {async generate(geometry: BufferGeometry) { return new MeshBVH(geometry, {indirect: true}); } dispose() {}}};
});
vi.mock('../../../../../src/components/replay/view3d/scenery/warmup/geometryWarmup.js', () => ({createGeometryWarmup: () => ({upload: gpu.upload, dispose() {}})}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  // A PMREM as three's generator makes one: its levels.
  const pmrem = () => ({texture: Object.assign(new actual.Texture(), {isPMREMTexture: true, mipmaps: Array.from({length: 5}, () => ({}))}), dispose() {}});
  return {...actual, PMREMGenerator: class {
    fromScene() { return pmrem(); }
    fromCubemap() { return pmrem(); }
    compileCubemapShader() {}
    dispose() {}
  }, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    capabilities = {maxTextureSize: 16384, maxTextures: 16}; debug = {checkShaderErrors: true}; state = {buffers: {depth: {getReversed: () => false, setReversed() {}}}};
    coordinateSystem = actual.WebGLCoordinateSystem;
    render = gpu.render;
    dispose = gpu.dispose;
    constructor() { gpu.constructed(); }
    setSize = gpu.setSize;
    setPixelRatio() {}
    getContext() { return {MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d, getParameter: () => 32}; }
    compileAsync() { return Promise.resolve(); }
    initTexture() {}
    properties = {has: () => false};
    initRenderTarget() {}
    forceContextLoss() {}
    getRenderTarget() { return null; }
    getActiveCubeFace() { return 0; }
    getActiveMipmapLevel() { return 0; }
    xr = {enabled: false};
    setRenderTarget() {}
    setScissorTest() {}
    getScissorTest() { return false; }
    copyTextureToTexture() {}
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
    async parseAsync(bytes: ArrayBuffer) {
      // The interior file (one byte in this double): a dashboard under its chassis node.
      if (bytes.byteLength === 1) {
        const scene = new Group(), parts = new Group(), dash = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
        (dash.material.userData as {nativeMaterialId?: string}).nativeMaterialId = 'm1';
        parts.name = 'chassis'; dash.name = 'dash-in'; dash.userData.cockpitView = 'in';
        parts.add(dash); scene.add(parts);
        return {scene};
      }
      const root = rigModel(), cockpit = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), chassis = new Group();
      chassis.name = 'chassis'; root.add(chassis);
      cockpit.name = 'cockpit-in'; cockpit.userData.cockpitView = 'in'; root.add(cockpit);
      root.traverse(object => { if (object instanceof Mesh) { const material = object.material as Material; material.userData.nativeMaterialId = 'm1'; material.name = 'body'; } });
      // An interior part (the package marks its node) with its own material, and the same material's texture kept for the outside by a second, unmarked one.
      const interior = new Group(); interior.userData.interior = true; root.add(interior);
      for (const [name, id, parent] of [['seat', 'seat', interior], ['dash', 'trim', interior], ['sill', 'trim', root]] as const) {
        const material = new MeshBasicMaterial(), part = new Mesh(new BoxGeometry(), material);
        material.userData.nativeMaterialId = id; part.name = name; parent.add(part);
      }
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
/** One shared material per package material key, as the loader shares them. */
const keyed = new Map<string, ShaderMaterial>();
// Configured as the chunk loader configures its surfaces, haze included.
const materialOf = (key: string) => { let made = keyed.get(key); if (!made) { made = composedMaterial(unlitTemplate, [hazePart]); made.userData = {lmuMaterial: key, surfaceConfigured: true, surfaceTextureUnits: 1}; keyed.set(key, made); } return made; };
vi.mock('../../../../../src/components/replay/view3d/scenery/chunkLoader.js', () => ({createChunkLoader: () => ({
  async load(chunk: SceneryChunk, _signal: AbortSignal, onParsed?: (root: Object3D) => void) {
    chunks.loads.push(chunk.id);
    const horizon = chunk.kind === 'horizon', root = new Group(), mesh = new Mesh(new BoxGeometry(200, 1, 200), materialOf(horizon ? 'ground' : 'road'));
    mesh.userData.lmuMaterial = horizon ? 'ground' : 'road'; mesh.name = horizon ? 'FILLER_GROUND__OPAQUE' : 'road__OPAQUE'; mesh.position.y = horizon ? -5.5 : -0.5;
    root.add(mesh);
    if (!horizon && chunks.obstacleName) {
      const obstacle = new Mesh(new BoxGeometry(2, 1, 8), materialOf('obstacle'));
      obstacle.name = chunks.obstacleName; obstacle.userData.lmuMaterial = 'obstacle';
      obstacle.position.set(24, 25.5, -35);
      root.add(obstacle);
    }
    chunks.roots.set(chunk.id, root);
    onParsed?.(root); // As the loader: the parsed root is handed over before its textures load.
    return root;
  },
  dispose() {},
})}));
vi.mock('../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js', () => ({CachedKtx2Loader: class Loader {
  constructor(_renderer: unknown, private readonly textureDetail?: {maxPx?: unknown; start?: (url: string) => {url: string; skip: number} | undefined}) {}
  async loadAsync(url: string) {
    const texture = new Texture(), start = this.textureDetail?.start?.(url), name = (path: string) => path.split('/').at(-1)!;
    // The loader cuts no levels: the package sizes car textures.
    if (this.textureDetail?.maxPx) throw Error('car textures load at the package size');
    carTextureLoads.paths.push(`${name(url)}${start ? ` from ${name(start.url)}` : ''}`);
    if (start) { texture.mipmaps = [{data: new Uint8Array(4), width: 512, height: 512}]; carTextureLoads.started.add(texture); }
    return texture;
  }
  detail(texture: Texture) { return carTextureLoads.started.has(texture) ? {missing: 2, load: async () => []} : undefined; }
  file() { return undefined; }
  release() {}
  dispose() {}
}}));

const lap: ReplayTrajectoryData = {
  replayName: 'test', layoutKey: 'portimao_wec', geometryRevision: 'g', dataPluginRevision: 'p', pointsCount: 7,
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 0.3, z: 0, timeSec: i * 0.2, rotY: 0, speedKmh: 30, stationM: i * 10})),
};
const box = (min: number, max: number) => ({min: [-100, min, -100] as [number, number, number], max: [100, max, 100] as [number, number, number]});
const base = {sha256: 'x', byteLength: 1, triangles: 1, vertices: 1, drawCalls: 1, shadowDrawCalls: 1, shadowTriangles: 1, reflectDrawCalls: 1, reflectTriangles: 1, geometryBytes: 1, meshes: 1, materials: 1, textures: [] as string[], bounds: box(0, 0)};
const sector = (index: number): ScenerySectorChunk => ({...base, id: `s${index}`, kind: 'main', asset: `scenery/s${index}.glb`, lapStartM: index * 1000, lapEndM: (index + 1) * 1000});
const layout = {
  layoutKey: 'portimao_wec', sourceGeometryRevision: 'g', packageRevision: 'p', routeLengthM: 4000, pitLaneLengthM: 0, shadowRangeM: 750,
  streaming: {residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500},
  camera: testCamera(), sky: testSky(), shading: testShading(), environmentProbe: {position: [0, 0, 0]}, roadHeightAt: () => null, realRoad: {sha256: 'r', byteLength: 8, points: 2, elements: 2}, realRoadTable: Uint32Array.of(0, 1),
  daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88, sunBearingDeg: 136.26 },{ id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9 },
  horizon: {...base, id: 'horizon', kind: 'horizon', asset: 'scenery/h.glb'}, sectors: [0, 1, 2, 3].map(sector), textures: [], reflection: {name: 'REFMAP0', textureSize: 1024, updateRate: 100, staticSwitchM: 300, observedClipM: 150}, night: testLayoutNight(),
  // A box has 24 vertices and 36 indices: the horizon's ground, and a road and an obstacle in each sector (up to eight).
  materials: [['ground', 1], ['road', 8], ['obstacle', 8]].map(([key, count]) => ({key, vertices: 24 * +count, indices: 36 * +count, primitives: +count, draws: +count})),
} as unknown as SceneryLayoutResource;
/** A texture file's content hash as a body row states it: a name in hex, so the paths the app derives from it stay readable in the loads. */
const hashOf = (name: string) => Buffer.from(name).toString('hex').padEnd(64, '0');
const car = {
  resource: {sha256: 'body',textures: ['seat', 'trim'].map(name => ({sha256: hashOf(name), levels: 12, start: {sha256: hashOf(`${name}-start`), levels: 10}})), volumes: []}, file: async () => new ArrayBuffer(0), interiorFile: async () => null, volumes: new Map(), vehicleId: 'veh',
  descriptor: {optionNodes: ['option_PlateA', 'option_PlateB'], appearances: [{alias: 'VEH', albedo: 'textures/a.ktx2', paint: testCarPaint('textures/a.ktx2'), optionNodes: ['option_PlateA'], readout: null}], readouts: [], materials: [{id: 'm1', name: 'body', paint: true}, {id: 'glow', name: 'glow', paint: true},
      ...['seat', 'trim'].map(name => ({id: name, name, paint: false, surface: {kind: 'diffuse', maps: {albedo: {texture: descriptorTexturePath(hashOf(name)), uv: 'uv0', scale: [1, 1]}}, finish: {roughness: 0.6, metalness: 0}, normalShadowInfluence: 0}}))], glowMaterialIds: ['glow'],
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
      {name: 'cockpit', position: [0.28, 1, -0.7], orientation: [-0.1, 0, 0], fov: [89, 49], clipPlanes: [0.13, 700], cockpitView: 'in', lodMultiplier: 1, shadow: null},
      {name: 'hood', position: [0.28, 0.9, -1.9], orientation: [0, 0, 0], fov: [80, 45], clipPlanes: [0.2, 800], cockpitView: 'out', lodMultiplier: 1, shadow: null},
      {name: 'roof', position: [0.28, 1.5, -0.6], orientation: [-0.1, 0, 0], fov: [60, 45], clipPlanes: [0.02, 550], cockpitView: 'out', lodMultiplier: 1, shadow: null},
    ], chase: {lodMultiplier: 1.5}}},
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
  vi.resetAllMocks(); frames = []; resizeCallbacks = []; carTextureLoads.paths.length = 0; chunks.roots.clear(); chunks.loads.length = 0; chunks.obstacleName = '';
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(() => callback([], this)); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
const shells: SceneShell[] = [];
afterEach(() => { for (const shell of shells.splice(0)) shell.dispose(); vi.unstubAllGlobals(); });

/** A lap scene in `host` on a new shell of `sceneLayout` (disposed after the test), or on `shell`. */
function openScene(host: HTMLDivElement, sceneLayout: SceneryLayoutResource, trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
  onFailure: (message: string) => void, cars: Parameters<typeof createReplayScene>[6], shell?: SceneShell, onProgress?: (progress: SceneLoadProgress) => void) {
  const used = shell ?? createSceneShell(sceneLayout, {daylightClock: trajectory.daylightClock, firstView: {kind: 'lap', lapDistanceM: lapFirstStation(trajectory, sceneLayout)}});
  if (!shell) shells.push(used);
  return createReplayScene(used, host, sceneLayout, trajectory, baseline, onFailure, cars, 'default', onProgress);
}

it.each([
  ['overpass__OPAQUE', 22.3],
  ['terrain__OPAQUE', 27.2],
])('uses ground clearance without carrying a camera lift past %s', async (name, expectedHeight) => {
  chunks.obstacleName = name;
  const renderedHeights: number[] = [];
  gpu.render.mockImplementation((_scene, camera) => { if (!isFrame(_scene, camera)) return; renderedHeights.push(camera.position.y); });
  const handle = await openScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  expect(renderedHeights.at(-1)).toBeCloseTo(expectedHeight);
  handle.cursor(3, 0); draw();
  expect(renderedHeights.at(-1)).toBeCloseTo(22.3);
  handle.dispose();
});

it('serializes GPU warm-ups when several new sectors load together', async () => {
  // The scene loads every sector of the lap, those under the first view first: each waits for the warm-up before it to upload.
  const sectors = Array.from({length: 8}, (_, index) => ({...sector(index), prev: `s${(index + 7) % 8}`, next: `s${(index + 1) % 8}`}));
  const extended = {...layout, routeLengthM: 8000, sectors};
  const releases: (() => void)[] = [];
  gpu.upload.mockClear().mockImplementation(() => new Promise<void>(resolve => { releases.push(resolve); }));
  const opening = openScene(document.createElement('div'), extended, lap, null, vi.fn(), assets);
  try {
    for (let upload = 1; upload <= 3; upload++) {
      await vi.waitFor(() => expect(gpu.upload).toHaveBeenCalledTimes(upload));
      await new Promise(resolve => { setTimeout(resolve, 20); });
      expect(gpu.upload).toHaveBeenCalledTimes(upload);
      releases[upload - 1]();
    }
  } finally {
    gpu.upload.mockImplementation(async () => {});
    releases.forEach(release => release());
    (await opening).dispose();
  }
});

it('caches static scenery matrices after the scene reflection without freezing the moving car', async () => {
  const handle = await openScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
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
  const handle = await openScene(host, layout, lap, null, vi.fn(), assets);
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
  const handle = await openScene(host, layout, lap, null, vi.fn(), assets);
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
  expect([headlight.material.uniforms.scale.value, headlight.castShadow, headlight.userData.cockpitView]).toEqual([500 * GAME_LIGHT_UNIT, false, 'out']);
  expect([oldCar.getObjectByName('brakeGlow'), oldCar.getObjectByName('discGlow')]).toEqual([undefined, undefined]);
  // The road draws from its material's batch, which holds its geometry.
  const roadBatch = world.getObjectsByProperty('isBatchedMesh', true).find(batch => (batch as Mesh).material === road.material) as Mesh;
  const roadDispose = vi.spyOn(roadBatch.geometry, 'dispose'), carDispose = vi.spyOn(oldBody.geometry, 'dispose'), materialDispose = vi.spyOn(oldBody.material, 'dispose');
  handle.colorLines('speed'); handle.fadeLines(0.12, 1);
  const next = {...lap, points: lap.points.map(point => ({...point, x: point.x + 5}))};
  expect(await handle.updateLaps(next, lap, withGhost)).toBe(true);
  handle.cursor(2, 0); draw();
  expect(host.firstChild).toBe(canvas); expect(gpu.constructed).toHaveBeenCalledOnce(); expect(gpu.dispose).not.toHaveBeenCalled();
  expect(scene.getObjectByName('road__OPAQUE')).toBe(road); expect(scene.environment).toBe(lightingEnvironment);
  // The car's body draws from its batch (its stand-in has bounds, no vertices). The old lap's car stays with the shell, for the next
  // lap or view driving it.
  expect(oldBody.geometry.attributes.position).toBeUndefined();
  expect(roadDispose).not.toHaveBeenCalled(); expect(carDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
  expect([oldLayer.parent, oldCar.parent]).toEqual([null, null]);
  expect(lastSceneRender()[1]).toBe(camera); expect(camera.position).toEqual(eye); expect(camera.zoom).toBe(zoom);
  const layer = world.children.at(-1)!;
  expect(layer.children[0].position.x).toBeCloseTo(7); expect(layer.children[1].visible).toBe(true);
  expect((layer.children[2] as Mesh<BufferGeometry, ShaderMaterial>).material.opacity).toBe(0.12);
  expect(await handle.updateLaps(next, null, assets)).toBe(true); handle.cursor(2, 0);
  expect(world.children.at(-1)!.children).toHaveLength(3);
  expect(world.children.at(-1)!.children[1].visible).toBe(false);
  // The next lap of the same car takes the kept one as it is.
  expect(world.children.at(-1)!.children[0]).toBe(oldCar); expect(carDispose).not.toHaveBeenCalled();
  // The view leaving keeps the shell for the next one; the shell going frees it all.
  handle.dispose(); expect(host.childNodes).toHaveLength(0); expect(gpu.dispose).not.toHaveBeenCalled();
  for (const shell of shells.splice(0)) shell.dispose();
  expect(scene.environment).toBeNull();
  expect(roadDispose).toHaveBeenCalledOnce(); expect(gpu.dispose).toHaveBeenCalledOnce(); expect(host.childNodes).toHaveLength(0);
  expect(carDispose).toHaveBeenCalled(); expect(materialDispose).toHaveBeenCalled();
});

it('places the ghost at the same distance, the same lap time, or the same time since marker A', async () => {
  const handle = await openScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
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
  const handle = await openScene(host, layout, lap, null, vi.fn(), assets);
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
  const handle = await openScene(host, layout, lap, null, vi.fn(), assets);
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

it('joins the interior file to the body under its chassis node, drawn in the driver cameras', async () => {
  const withInterior = {...assets, primary: {...assets.primary, resource: {...assets.primary.resource, interior: {sha256: 'interior', byteLength: 1, triangles: 0, vertices: 0}}, interiorFile: async () => new ArrayBuffer(1)}};
  const handle = await openScene(document.createElement('div'), layout, lap, null, vi.fn(), withInterior);
  handle.cursor(0, 0); draw();
  const [scene] = lastSceneRender(), dash = scene.getObjectByName('dash-in')!;
  expect([dash.parent?.name, dash.visible]).toEqual(['chassis', false]);
  handle.mode('cockpit'); draw();
  expect(dash.visible).toBe(true);
  handle.dispose();
});

it("reads car textures from their start files, the interior's like the body's", async () => {
  const handle = await openScene(document.createElement('div'), layout, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  // The seat is interior only; the trim is also on an outside part. The paint has no start file.
  expect(carTextureLoads.paths).toEqual(expect.arrayContaining([
    `${hashOf('seat')}.ktx2.zst from ${hashOf('seat-start')}.ktx2.zst`, `${hashOf('trim')}.ktx2.zst from ${hashOf('trim-start')}.ktx2.zst`, 'a.ktx2']));
  const [scene] = lastSceneRender(), map = (name: string) => (scene.getObjectByName(name) as Mesh<BufferGeometry, ShaderMaterial>).material.uniforms.map.value as Texture;
  // Each map's own copy draws from the 512 start file and waits to sharpen.
  expect([isStreaming(map('seat')), map('seat').mipmaps.map(level => level.width), isStreaming(map('dash'))]).toEqual([true, [512], true]);
  handle.mode('cockpit'); draw();
  expect(isStreaming(map('seat'))).toBe(true); // Not on the GPU in this double: nothing to copy yet.
  handle.dispose();
});

it('loads the whole circuit, shows the window around the car, hides what left it, and follows a free camera', async () => {
  const host = document.createElement('div'), far = {...lap, points: [...lap.points.slice(0, 6), {...lap.points[6], stationM: 3000}]};
  // s1 lies 5 km from the car's path, so only its lap range can bring it in (the other sectors are also near in a straight line).
  const away = {min: [5000, 0, -100], max: [5200, 0, 100]}, spread = {...layout, sectors: layout.sectors.map(chunk => chunk.id === 's1' ? {...chunk, bounds: away} : chunk)} as SceneryLayoutResource;
  const handle = await openScene(host, spread, far, null, vi.fn(), assets);
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
  expect(chunks.roots.get('horizon')!.parent).not.toBeNull();
  for (const shell of shells.splice(0)) shell.dispose();
  expect(chunks.roots.get('horizon')!.parent).toBeNull();
});

it('hands its shell to the next view: one renderer, the canvas moving to its element', async () => {
  const first = document.createElement('div'), second = document.createElement('div');
  const shell = createSceneShell(layout, {daylightClock: lap.daylightClock, firstView: {kind: 'lap', lapDistanceM: lapFirstStation(lap, layout)}});
  shells.push(shell);
  const before = await openScene(first, layout, lap, null, vi.fn(), assets, shell);
  const canvas = shell.renderer.domElement;
  expect(canvas.parentElement).toBe(first);
  before.dispose();
  expect(canvas.parentElement).toBeNull();
  const steps: SceneLoadProgress[] = [];
  const after = await openScene(second, layout, lap, null, vi.fn(), assets, shell, progress => steps.push(progress));
  expect(shell.renderer.domElement).toBe(canvas);
  expect(canvas.parentElement).toBe(second);
  expect(shell.scene.getObjectsByProperty('name', 'body-envelope').length).toBeGreaterThan(0);
  // The next view's bar starts past the track, scenery and lighting, and fills as its car builds and compiles.
  const step = (progress: SceneLoadProgress) => [progress.track, progress.lighting, progress.cars, progress.shaders];
  expect(step(steps[0])).toEqual([1, 1, 0, 0]); expect(describeLoad(steps[0]).label).toBe('Preparing the car');
  expect(step(steps.at(-1)!)).toEqual([1, 1, 1, 1]); expect(describeLoad(steps.at(-1)!).fraction).toBe(1);
  // A new lap counts its cars in the corner note until they show.
  steps.length = 0;
  expect(await after.updateLaps({...lap}, lap, Promise.resolve(withGhost))).toBe(true);
  expect(steps.map(progress => progress.carModels)).toEqual([{loaded: 0, total: 2}, {loaded: 2, total: 2}]);
  after.dispose();
});

it("lights the scene by the clock's moment, once the sun has moved a quarter of a degree", async () => {
  const clock = {session: 'race' as const, startMinute: null, sessionTimeSec: 0, cloudCover: 0};
  const shell = createSceneShell(layout, {daylightClock: clock, firstView: {kind: 'lap', lapDistanceM: lapFirstStation(lap, layout)}});
  shells.push(shell);
  const scene = await openScene(document.createElement('div'), layout, {...lap, daylightClock: clock}, null, vi.fn(), assets, shell);
  const sun = shell.scene.getObjectsByProperty('name', 'sun').find(object => object instanceof DirectionalLight)!, start = sun.position.clone();
  const toward = (sessionTimeSec: number) => sceneSun(layout, shell.origin.y, {...clock, sessionTimeSec}).lighting.sunDirection.clone().normalize();
  // 30 s of the day moves the sun about an eighth of a degree: nothing changes.
  shell.setDaylight({...clock, sessionTimeSec: 30});
  expect(sun.position.equals(start)).toBe(true);
  // Ten minutes, about two and a half degrees: the sun light points at the new sun.
  shell.setDaylight({...clock, sessionTimeSec: 600});
  expect(sun.position.distanceTo(toward(600))).toBeLessThan(1e-9);
  scene.dispose();
});

it('leaves the sun through the clouds to the meter: a camera moving under them lights nothing again', async () => {
  const cloudField = {cells: '0ffff', upperDrift: 0, lowerDrift: 0, startUpperDrift: -10, startLowerDrift: -10};
  const clock = {session: 'race' as const, startMinute: null, sessionTimeSec: 0, cloudCover: 0, cloudField};
  const shell = createSceneShell(layout, {daylightClock: clock, firstView: {kind: 'lap', lapDistanceM: lapFirstStation(lap, layout)}});
  shells.push(shell);
  const scene = await openScene(document.createElement('div'), layout, {...lap, daylightClock: clock}, null, vi.fn(), assets, shell);
  const environment = shell.scene.environment, sun = shell.scene.getObjectsByProperty('name', 'sun').find(object => object instanceof DirectionalLight)!;
  const start = sun.position.clone(), seenFrom = (x: number) => sceneSun(layout, shell.origin.y, clock, [x, 0, 0]).clouds.sunVisibility!;
  // Under the cloud and 20 km away, the sun's visibility differs far more than a step...
  expect(Math.abs(seenFrom(-500) - seenFrom(20000))).toBeGreaterThan(0.1);
  shell.rig.camera.position.set(20000 - shell.origin.x, 0, 0);
  // ...yet a clock step without a sun step or a new cover neither redraws the shadows nor captures the venue again.
  shell.setDaylight({...clock, sessionTimeSec: 30});
  expect(sun.position.equals(start)).toBe(true);
  expect(shell.scene.environment).toBe(environment);
  scene.dispose();
});

it("lights a shell another view made by the lap's own moment, and a new lap's", async () => {
  const shell = createSceneShell(layout, {firstView: {kind: 'lap', lapDistanceM: lapFirstStation(lap, layout)}});
  shells.push(shell);
  const daylight = vi.spyOn(shell, 'setDaylight');
  const clock = {session: 'race' as const, startMinute: 600, sessionTimeSec: 120, cloudCover: 0};
  const scene = await openScene(document.createElement('div'), layout, {...lap, daylightClock: clock}, null, vi.fn(), assets, shell);
  expect(daylight).toHaveBeenLastCalledWith(clock);
  const later = {...clock, sessionTimeSec: 900};
  expect(await scene.updateLaps({...lap, daylightClock: later}, null, assets)).toBe(true);
  expect(daylight).toHaveBeenLastCalledWith(later);
  scene.dispose();
});
