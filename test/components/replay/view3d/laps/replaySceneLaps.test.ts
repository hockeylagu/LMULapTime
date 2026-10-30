// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type BufferGeometry, type PerspectiveCamera, type OrthographicCamera, type Scene } from 'three';
import { createReplayScene } from '../../../../../src/components/replay/view3d/replayScene.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { TrackSceneResource } from '../../../../../shared/types/scenes/trackScene.js';

const gpu = vi.hoisted(() => ({render: vi.fn<(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) => void>(), dispose: vi.fn(), constructed: vi.fn(), setSize: vi.fn()}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    shadowMap = {enabled: false, type: 0};
    render = gpu.render;
    dispose = gpu.dispose;
    constructor() { gpu.constructed(); }
    setSize = gpu.setSize;
    setPixelRatio() {}
    forceContextLoss() {}
  }};
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({GLTFLoader: class {
  async parseAsync() {
    const root = new Group(), road = new Mesh(new BoxGeometry(200, 1, 200), new MeshBasicMaterial());
    road.name = 'road'; road.position.y = -0.5; root.add(road);
    return {scene: root};
  }
}}));

const lap: ReplayTrajectoryData = {
  replayName: 'test', layoutKey: 'portimao_wec', geometryRevision: 'g', dataPluginRevision: 'p', pointsCount: 7,
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 0.3, z: 0, timeSec: i * 0.2, rotY: 0, speedKmh: 30})),
};
const metadata: TrackSceneResource = {
  schemaVersion: 1, layoutKey: 'portimao_wec', coordinates: 'lmu-local-xyz-metres', sourceGeometryRevision: 'g', coverage: 'surfaces',
  packageRevision: 'p', revision: 'scene-s', sha256: 's', byteLength: 0, triangles: 12, bounds: {min: [-100, 0, -100], max: [100, 0, 100]},
};
const assets = {primary: null, baseline: null};
let frames: FrameRequestCallback[];
let resizeCallbacks: Array<() => void>;
const draw = () => { frames.splice(0).forEach(callback => callback(0)); };
beforeEach(() => {
  vi.clearAllMocks(); frames = []; resizeCallbacks = [];
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

it('repaints a resized embedded canvas before paint, skipping notifications with unchanged dimensions', async () => {
  const host = document.createElement('div');
  let height = 540;
  Object.defineProperties(host, {clientWidth: {get: () => 460}, clientHeight: {get: () => height}});
  const handle = await createReplayScene(host, new ArrayBuffer(0), metadata, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const camera = gpu.render.mock.calls.at(-1)![1], eye = camera.position.clone();
  gpu.render.mockClear(); gpu.setSize.mockClear();
  resizeCallbacks[0](); expect(gpu.setSize).not.toHaveBeenCalled(); expect(gpu.render).not.toHaveBeenCalled();
  height = 514; resizeCallbacks[0]();
  // No animation callback has run: resizing already cleared the canvas, so it must be repainted now.
  expect(gpu.setSize).toHaveBeenCalledWith(460, 514, false); expect(gpu.render).toHaveBeenCalledOnce();
  expect(camera.position).toEqual(eye);
  height = 540; resizeCallbacks[0](); expect(gpu.render).toHaveBeenCalledTimes(2);
  handle.dispose();
});

it('retains terrain, canvas and camera settings, releases old laps, and draws the new primary and ghost', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, new ArrayBuffer(0), metadata, lap, null, vi.fn(), assets);
  handle.cursor(2, 0); handle.mode('orbit'); handle.zoom(1); draw();
  const [scene, camera] = gpu.render.mock.calls.at(-1)!;
  const eye = camera.position.clone(), zoom = camera.zoom, canvas = host.firstChild;
  const road = scene.getObjectByName('road') as Mesh;
  const world = road.parent!.parent!;
  const oldLayer = world.children.at(-1)!;
  const oldCar = oldLayer.children[0], oldBody = oldCar.getObjectByName('body-envelope')!.children[0] as Mesh;
  const roadDispose = vi.spyOn(road.geometry, 'dispose'), carDispose = vi.spyOn(oldBody.geometry, 'dispose');
  handle.colorLines('speed'); handle.fadeLines(0.12, 1);
  const next = {...lap, points: lap.points.map(point => ({...point, x: point.x + 5}))};
  expect(await handle.updateLaps(next, lap, assets)).toBe(true);
  handle.cursor(2, 0); draw();
  expect(host.firstChild).toBe(canvas); expect(gpu.constructed).toHaveBeenCalledOnce(); expect(gpu.dispose).not.toHaveBeenCalled();
  expect(scene.getObjectByName('road')).toBe(road); expect(roadDispose).not.toHaveBeenCalled(); expect(carDispose).toHaveBeenCalledOnce();
  expect(oldLayer.parent).toBeNull();
  expect(gpu.render.mock.calls.at(-1)![1]).toBe(camera); expect(camera.position).toEqual(eye); expect(camera.zoom).toBe(zoom);
  const layer = world.children.at(-1)!;
  expect(layer.children[0].position.x).toBeCloseTo(7); expect(layer.children[1].visible).toBe(true);
  expect((layer.children[2] as Mesh<BufferGeometry, MeshBasicMaterial>).material.opacity).toBe(0.12);
  expect(await handle.updateLaps(next, null, assets)).toBe(true); handle.cursor(2, 0);
  expect(world.children.at(-1)!.children).toHaveLength(3);
  expect(world.children.at(-1)!.children[1].visible).toBe(false);
  handle.dispose(); expect(roadDispose).toHaveBeenCalledOnce(); expect(gpu.dispose).toHaveBeenCalledOnce(); expect(host.childNodes).toHaveLength(0);
});

it('rejects layout, geometry and package mismatches, and discards cancelled or superseded lap builds', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, new ArrayBuffer(0), metadata, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const scene = gpu.render.mock.calls.at(-1)![0], road = scene.getObjectByName('road')!;
  const world = road.parent!.parent!, original = world.children.at(-1);
  for (const invalid of [{...lap, layoutKey: 'spa_wec'}, {...lap, geometryRevision: 'g2'}, {...lap, dataPluginRevision: 'p2'}]) {
    await expect(handle.updateLaps(invalid, null, assets)).rejects.toThrow(/same layout, geometry and package/);
    await expect(handle.updateLaps(lap, invalid, assets)).rejects.toThrow(/same layout, geometry and package/);
  }
  const abort = new AbortController(), cancelled = handle.updateLaps(lap, lap, assets, abort.signal);
  abort.abort(); expect(await cancelled).toBe(false); expect(world.children.at(-1)).toBe(original);
  const stale = handle.updateLaps(lap, lap, assets), current = handle.updateLaps(lap, null, assets);
  expect(await stale).toBe(false); expect(await current).toBe(true); expect(world.children.at(-1)!.children).toHaveLength(3);
  const late = handle.updateLaps(lap, lap, assets); handle.dispose();
  expect(await late).toBe(false); expect(host.childNodes).toHaveLength(0);
});

it('hides the fallback cabin in cockpit mode, locks the eye to the driver seat and zooms via projection matrix', async () => {
  const host = document.createElement('div');
  const handle = await createReplayScene(host, new ArrayBuffer(0), metadata, lap, null, vi.fn(), assets);
  handle.cursor(0, 0); draw();
  const [scene, camera] = gpu.render.mock.calls.at(-1)!;
  const cabin = scene.getObjectByName('cabin');
  expect(cabin).not.toBeNull();
  expect(cabin!.visible).toBe(true);

  handle.mode('cockpit'); draw();
  const modelOffset = scene.getObjectByName('body-envelope')!.position;
  // Switching modes must already be correct while paused, before another cursor update.
  expect(camera.position.x).toBeCloseTo(0.28, 2);
  expect(camera.position.y).toBeCloseTo(0.3 + modelOffset.y + 0.78, 2);
  expect(camera.getWorldDirection(new Vector3()).y).toBeCloseTo(-0.08 / 40, 4);
  handle.cursor(1, 0); draw();
  expect(cabin!.visible).toBe(false);

  // Driver eye position in cockpit mode: near car position + 0.28m lateral, +0.78m height
  const eye = camera.position.clone();
  expect(eye.x).toBeCloseTo(1.28, 2);
  expect(eye.y).toBeCloseTo(0.3 + modelOffset.y + 0.78, 2);

  // Zooming in cockpit mode adjusts camera.zoom rather than shifting camera position
  handle.zoom(1);
  expect(camera.zoom).toBeGreaterThan(1);
  expect(camera.position).toEqual(eye);

  // Exiting cockpit mode restores cabin visibility and Y-up vector
  handle.mode('follow');
  expect(cabin!.visible).toBe(true);
  expect(camera.up.y).toBe(1);
  expect(camera.zoom).toBe(1);
  expect(camera.position.distanceTo(eye)).toBeGreaterThan(10);
  handle.dispose();
});
