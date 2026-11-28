import { BatchedMesh, BoxGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { createFirstDraws } from '../../../../../../src/components/replay/view3d/scenery/warmup/firstDraws.js';

/** What one render drew: the meshes and lights it would project (shown, in a camera layer), the target's size, culling and batch state. */
interface Drawn { meshes: Object3D[]; lights: number; width: number | undefined; culled: boolean[]; instanceShown: boolean | undefined }

function fixture() {
  const scene = new Scene(), sun = new DirectionalLight(), scenery = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  scene.add(sun, sun.target, scenery);
  const frameTarget = new WebGLRenderTarget(64, 32, {samples: 4});
  let target: WebGLRenderTarget | null = null;
  const drawn: Drawn[] = [], batches: BatchedMesh[] = [];
  const render = vi.fn((root: Object3D, camera: Camera) => {
    const meshes: Object3D[] = [];
    let lights = 0;
    root.traverseVisible(object => {
      if (!object.layers.test(camera.layers)) return;
      if (object instanceof DirectionalLight) lights++;
      else if (object instanceof Mesh) meshes.push(object);
    });
    drawn.push({meshes, lights, width: target?.width, culled: meshes.map(mesh => mesh.frustumCulled),
      instanceShown: batches.length ? batches[0].getVisibleAt(0) : undefined});
  });
  const renderer = {getRenderTarget: () => target, setRenderTarget: (next: WebGLRenderTarget | null) => { target = next; }, render} as unknown as WebGLRenderer;
  const shadows = vi.fn<(root: Object3D) => void>();
  const draws = createFirstDraws(renderer, scene, shadows);
  return {scene, scenery, frameTarget, drawn, batches, render, shadows, draws, prepare: () => { target = frameTarget; }, target: () => target};
}

it('draws each material once, a frame apart, alone in the scene with its lights, into a pixel of the frame target kind', async () => {
  const {scene, scenery, frameTarget, drawn, batches, shadows, draws, prepare, target} = fixture();
  const material = new MeshBasicMaterial(), other = new MeshBasicMaterial();
  const car = new Group(), body = new Mesh(new BoxGeometry(), material), wheel = new Mesh(new BoxGeometry(), material), glass = new Mesh(new BoxGeometry(), other);
  const standIn = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  standIn.layers.disableAll(); glass.layers.set(31);
  const batch = new BatchedMesh(1, 24, 36, new MeshBasicMaterial());
  batch.setVisibleAt(batch.addInstance(batch.addGeometry(new BoxGeometry())), false); batch.perObjectFrustumCulled = true;
  batches.push(batch);
  car.add(body, wheel, glass, standIn, batch);
  try {
    let frames = 0;
    await draws.draw([car], new PerspectiveCamera(), prepare, () => { frames++; return Promise.resolve(); }, new AbortController().signal);
    // One draw per material (the wheel shares the body's), the stand-in in no layer never drawn, one frame before each.
    expect(drawn.map(draw => draw.meshes)).toEqual([[body], [glass], [batch]]);
    expect(frames).toBe(3);
    expect(drawn.every(draw => draw.lights === 1 && draw.width === 1 && draw.culled.every(culled => !culled))).toBe(true);
    expect(drawn[2].instanceShown).toBe(true); // A batch draws its first instance.
    expect(shadows.mock.calls.map(([root]) => root)).toEqual([car, car, car]);
    // All as before: hidden instance, culling, the scenery shown, the car out of the scene, the target back.
    expect([batch.getVisibleAt(0), batch.perObjectFrustumCulled, body.frustumCulled, scenery.visible, wheel.visible, car.parent, target()]).toEqual([false, true, true, true, true, null, null]);
    expect(scene.children).not.toContain(car);
    expect(frameTarget.samples).toBe(4);
  } finally { draws.dispose(); }
});

it('leaves a root already in the scene, stops when aborted, and draws the calls one after another', async () => {
  const {scene, drawn, draws, prepare} = fixture(), camera = new PerspectiveCamera();
  const placed = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), first = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), second = first.clone();
  second.material = new MeshBasicMaterial();
  scene.add(placed);
  const aborted = new AbortController();
  aborted.abort();
  const order: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await draws.draw([placed], camera, prepare, () => Promise.resolve(), new AbortController().signal);
    await draws.draw([first], camera, prepare, () => Promise.resolve(), aborted.signal);
    expect(drawn).toHaveLength(0);
    const one = draws.draw([first], camera, prepare, () => { order.push('first waits'); return held; }, new AbortController().signal);
    const two = draws.draw([second], camera, prepare, () => { order.push('second waits'); return Promise.resolve(); }, new AbortController().signal);
    await Promise.resolve();
    expect(order).toEqual(['first waits']);
    release();
    await Promise.all([one, two]);
    expect([order, drawn.map(draw => draw.meshes[0])]).toEqual([['first waits', 'second waits'], [first, second]]);
  } finally { draws.dispose(); }
});
