import { Box3, CompressedTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBA_BPTC_Format, Scene, Texture, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isStreaming, startStreaming } from '../../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import { trackSurfaceTextures } from '../../../../../../src/components/replay/view3d/scenery/materials/configureSurfaceMaterial.js';
import { createSceneWarmup } from '../../../../../../src/components/replay/view3d/scenery/warmup/sceneWarmup.js';
import { carMapPart } from '../../../../../../src/components/replay/view3d/car/carStandardSurface.js';
import { composedMaterial } from '../../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../../src/components/replay/view3d/shaders/litTemplate.js';

/** A material reading map as its own texture, as a car part does. */
const mapped = (map: Texture) => composedMaterial(litTemplate, [carMapPart(map, false)]);

let frames: ((time: number) => void)[] = [], clock = 0;
/** Runs one frame: every callback asked for so far, with the frame's one timestamp, as a browser does. */
const frame = () => { clock++; for (const run of frames.splice(0)) run(clock); };
/** One frame as above, letting each callback's promise work settle before the next callback runs, as a browser does. */
const settledFrame = async () => { clock++; for (const run of frames.splice(0)) { run(clock); await new Promise(resolve => { setTimeout(resolve); }); } };
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (run: (time: number) => void) => frames.push(run));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

/** A renderer double whose textures are on the GPU once `upload` ran for them, as after their first draw. */
function fixture() {
  const bound: Texture[] = [], versions = new WeakMap<object, number>();
  // Like three: a source uploads once per version, then the texture's onUpdate runs. `bound` lists the swaps in order.
  const initTexture = (texture: Texture) => {
    if (versions.get(texture.source) === texture.source.version) return;
    versions.set(texture.source, texture.source.version);
    if (texture.mipmaps.length === Math.log2(texture.mipmaps[0].width) + 1) bound.push(texture);
    texture.onUpdate?.(texture);
  };
  const renderer = {getRenderTarget: () => null, setRenderTarget: () => {}, compile: () => {}, compileAsync: () => Promise.resolve(), initTexture, render: () => {}} as unknown as WebGLRenderer;
  const changed = vi.fn(), warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, changed, () => Promise.resolve(), () => {});
  /** A `size` px texture (1024 by default) read from its start file, a quarter of its size: the two levels above come when it sharpens. */
  const texture = (size = 1024) => {
    const levels = Array.from({length: Math.log2(size) + 1}, (_, i) => ({data: new Uint8Array(Math.ceil((size >> i) / 4) ** 2 * 16), width: size >> i, height: size >> i}));
    const made = new CompressedTexture(levels.slice(2), size / 4, size / 4, RGBA_BPTC_Format);
    startStreaming(made, {missing: 2, load: async () => levels.slice(0, 2), drop: () => {}});
    return made;
  };
  const upload = (made: Texture) => { made.needsUpdate = true; renderer.initTexture(made); };
  /** Runs frames until none is asked for, the levels a frame asked for arriving before the next; returns how many ran. */
  const drain = async () => { let ran = 0; while (frames.length && ran < 100) { await settledFrame(); ran++; } return ran; };
  return {warmup, texture, upload, drain, changed, bound};
}

it('sharpens a queued texture once it is on the GPU, and asks for no frame while it is not', async () => {
  const {warmup, texture, upload, drain, changed} = fixture(), undrawn = texture();
  try {
    warmup.sharpen(undrawn); warmup.shown();
    expect([frames.length, isStreaming(undrawn)]).toEqual([0, true]); // Nothing to copy yet: the queue is empty, no frame loop runs.
    expect(warmup.sharpening()).toEqual({sharp: 0, total: 0}); // Not queued until it is on the GPU.
    upload(undrawn);
    expect(warmup.sharpening()).toEqual({sharp: 0, total: 1});
    expect(frames).toHaveLength(1);
    expect(await drain()).toBeGreaterThan(0);
    expect([isStreaming(undrawn), frames.length, changed.mock.calls.length > 0]).toEqual([false, 0, true]); // Sharp, and the loop ended.
    expect(warmup.sharpening()).toEqual({sharp: 1, total: 1});
  } finally { warmup.dispose(); }
});

it('keeps a held texture on its reduced levels until released, then sharpens it when it is on the GPU', async () => {
  const {warmup, texture, upload, drain} = fixture(), drawn = texture(), undrawn = texture();
  try {
    warmup.hold(drawn); warmup.hold(undrawn); warmup.shown();
    upload(drawn);
    expect([await drain(), isStreaming(drawn)]).toEqual([0, true]);
    warmup.sharpenHeld();
    await drain();
    expect([isStreaming(drawn), isStreaming(undrawn), frames.length]).toEqual([false, true, 0]);
    upload(undrawn); await drain();
    expect([isStreaming(undrawn), frames.length]).toEqual([false, 0]);
  } finally { warmup.dispose(); }
});

it('sharpens the car first, then the scenery nearest the camera, the track surfaces and then the largest first within a band', async () => {
  const {warmup, texture, upload, drain, bound} = fixture(), signal = new AbortController().signal;
  const [car, fieldCar, far, nearSmall, nearLarge, road, roadUnder] = [texture(512), texture(), texture(), texture(512), texture(), texture(512), texture()];
  trackSurfaceTextures.add(road); trackSurfaceTextures.add(roadUnder);
  const chunk = (...maps: Texture[]) => maps.map(map => new Mesh(new PlaneGeometry(), mapped(map)));
  const box = (x: number) => new Box3(new Vector3(x, 0, 0), new Vector3(x + 10, 1, 10));
  try {
    await warmup.queue(chunk(far), signal, box(500));
    await warmup.queue(chunk(roadUnder), signal, box(0));
    await warmup.queue(chunk(nearSmall, nearLarge, road), signal, box(20));
    for (const made of [far, nearSmall, nearLarge, road, roadUnder, fieldCar, car]) upload(made);
    warmup.sharpen(fieldCar, true); warmup.sharpen(car);
    bound.length = 0;
    warmup.shown();
    await drain();
    // The order their missing levels were copied in: the car, then the (larger) road under it, the road ahead of the other scenery
    // as near, another car of the field after the scenery around the camera.
    expect([...new Set(bound)]).toEqual([car, roadUnder, road, nearLarge, nearSmall, fieldCar, far]);
    expect([car, fieldCar, far, nearSmall, nearLarge, road, roadUnder].some(isStreaming)).toBe(false);
  } finally { warmup.dispose(); await drain(); }
});

it('swaps whole textures within the frame budget: the first one even if bigger, the frames after it paying off the excess', async () => {
  const {warmup, texture, upload, drain, bound} = fixture(), [big, other, small, smaller] = [texture(2048), texture(2048), texture(512), texture(512)];
  try {
    for (const made of [big, other, small, smaller]) { upload(made); warmup.sharpen(made); }
    bound.length = 0;
    warmup.shown();
    await settledFrame(); // The frame that asks for the levels above: nothing to send yet.
    expect(bound).toHaveLength(0);
    frame(); // One frame: the 5.3 MiB swap is over the 2 MiB budget alone, so nothing else goes with it.
    expect(bound).toHaveLength(1);
    frame(); // 3.3 MiB still owed: nothing goes.
    expect(bound).toHaveLength(1);
    frame(); // 1.3 MiB owed, under the budget: the next swap goes.
    expect(bound).toHaveLength(2);
    await drain();
    expect([big, other, small, smaller].some(isStreaming)).toBe(false);
  } finally { warmup.dispose(); await drain(); }
});

it('warms a shown scene within the frame byte budget: the first upload whole, then the next frame', async () => {
  const {warmup, bound} = fixture(), mib = 1024 * 1024;
  // Uploads return at once: only the bytes end the frame's slice.
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const card = () => new Mesh(new PlaneGeometry(), mapped(new CompressedTexture([{data: new Uint8Array(1.5 * mib), width: 1, height: 1}], 1, 1, RGBA_BPTC_Format)));
  try {
    warmup.shown();
    const done = warmup.warm([card(), card(), card()], new AbortController().signal);
    await vi.waitFor(() => expect(bound).toHaveLength(2)); // 1.5 MiB, then 3 MiB: over the 2 MiB budget, the frame ends.
    expect(frames).toHaveLength(1);
    frame(); // 1 MiB still owed, under the budget: the third goes.
    await vi.waitFor(() => expect(bound).toHaveLength(3));
    while (frames.length) await settledFrame();
    await done;
  } finally { warmup.dispose(); vi.restoreAllMocks(); }
});

it('moves a warm-up begun behind the loading screen onto the frame budget once the scene shows', async () => {
  const {warmup, bound} = fixture(), mib = 1024 * 1024;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const card = () => new Mesh(new PlaneGeometry(), mapped(new CompressedTexture([{data: new Uint8Array(1.5 * mib), width: 1, height: 1}], 1, 1, RGBA_BPTC_Format)));
  const cards = [card(), card(), card()];
  (cards[0].material.uniforms.map.value as Texture).onUpdate = () => warmup.shown(); // The first frame goes out while the first card uploads.
  try {
    const done = warmup.warm(cards, new AbortController().signal);
    // 1.5 MiB, then 3 MiB counted since the scene shows: over the 2 MiB budget, so it waits for a frame, not for a task.
    await vi.waitFor(() => expect(bound).toHaveLength(2));
    expect(frames).toHaveLength(1);
    frame(); // 1 MiB still owed, under the budget: the third goes.
    await vi.waitFor(() => expect(bound).toHaveLength(3));
    while (frames.length) await settledFrame();
    await done;
  } finally { warmup.dispose(); vi.restoreAllMocks(); }
});

it('shares one frame byte budget between warm-ups running together', async () => {
  const {warmup, bound} = fixture(), mib = 1024 * 1024;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const card = () => new Mesh(new PlaneGeometry(), mapped(new CompressedTexture([{data: new Uint8Array(1.5 * mib), width: 1, height: 1}], 1, 1, RGBA_BPTC_Format)));
  const cards = () => [card(), card(), card()], signal = new AbortController().signal;
  try {
    warmup.shown();
    const done = Promise.all([warmup.warm(cards(), signal), warmup.warm(cards(), signal)]);
    // The first sends 1.5 MiB, then 3 MiB: the frame's 2 MiB is spent, so the second waits with nothing sent, on the same frame.
    await vi.waitFor(() => expect([bound.length, frames.length]).toEqual([2, 1]));
    const sentByFrame = [bound.length];
    while (frames.length) { await settledFrame(); sentByFrame.push(bound.length); }
    await done;
    // Each frame pays 2 MiB off what was sent and stops once 2 MiB is owed: the first's last card (1 MiB owed before it), the
    // second's first (0.5 MiB owed), then the second's last two.
    expect(sentByFrame.slice(0, 4)).toEqual([2, 3, 4, 6]);
  } finally { warmup.dispose(); vi.restoreAllMocks(); }
});

it("uploads a composed material's own textures and any other material's texture fields (a readout's canvas)", async () => {
  const uploaded: Texture[] = [];
  const renderer = {getRenderTarget: () => null, setRenderTarget: () => {}, initTexture: (texture: Texture) => { uploaded.push(texture); }, render: () => {}, compile: () => {},
    compileAsync: () => Promise.resolve()} as unknown as WebGLRenderer;
  const warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, () => {}, () => Promise.resolve(), () => {});
  const canvas = new Texture(), map = new Texture(), root = new Group();
  root.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({map: canvas})), new Mesh(new PlaneGeometry(), mapped(map)));
  try {
    warmup.shown();
    await warmup.warm(root, new AbortController().signal);
    expect(uploaded).toEqual([canvas, map]);
  } finally { warmup.dispose(); }
});

it("links and draws a shown warm-up's materials one a frame before it ends; behind the loading screen all link at once and the first frame draws", async () => {
  let target: WebGLRenderTarget | null = null;
  const part = () => new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
  const loaded = new Group(), shown = new Group(), first = part(), second = part(), parts = new Set<Object3D>([first, second, loaded.add(part()).children[0]]);
  shown.add(first, second);
  // The draws of the parts (the geometry warm-up draws its own probe), with the frame each was in.
  const drawn: [Object3D, number][] = [], frameTarget = new WebGLRenderTarget(8, 8);
  const render = (scene: Scene) => { scene.traverseVisible(object => { if (parts.has(object)) drawn.push([object, clock]); }); };
  // The parts each compile walked, with its frame.
  const linked: [Object3D[], number][] = [];
  const compileAsync = (object: Object3D) => {
    const walked: Object3D[] = [];
    object.traverse(child => { if (parts.has(child)) walked.push(child); });
    linked.push([walked, clock]);
    return Promise.resolve();
  };
  const renderer = {getRenderTarget: () => target, setRenderTarget: (next: WebGLRenderTarget | null) => { target = next; }, initTexture: () => {}, compile: () => {},
    compileAsync, render} as unknown as WebGLRenderer;
  const shadows = vi.fn();
  const warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => { target = frameTarget; }, () => {}, () => Promise.resolve(), shadows);
  try {
    await warmup.warm(loaded, new AbortController().signal);
    expect([drawn, shadows.mock.calls, linked.length]).toEqual([[], [], 1]);
    linked.length = 0;
    warmup.shown();
    let ended = false;
    const done = warmup.warm(shown, new AbortController().signal).then(() => { ended = true; });
    await vi.waitFor(async () => { await settledFrame(); expect(drawn).toHaveLength(1); });
    expect([drawn[0][0], ended]).toEqual([first, false]);
    while (!ended) await settledFrame();
    await done;
    expect(drawn.map(([object]) => object)).toEqual([first, second]);
    expect(drawn[1][1]).toBeGreaterThan(drawn[0][1]);
    expect(shadows.mock.calls.map(([root]) => root as Object3D)).toEqual([shown, shown]);
    // Shown, the links went one material a frame, as the draws did; loading, all at once.
    expect(linked.map(([walked]) => walked)).toEqual([[first], [second]]);
    expect(linked[1][1]).toBeGreaterThan(linked[0][1]);
  } finally { warmup.dispose(); }
});

it('compiles what a camera layer draws, hidden or not, and no stand-in in no layer', async () => {
  const compiled: Object3D[] = [];
  const renderer = {getRenderTarget: () => null, setRenderTarget: () => {}, initTexture: () => {}, render: () => {}, compile: () => {},
    compileAsync: (object: Object3D) => { object.traverse(child => { compiled.push(child); }); return Promise.resolve(); }} as unknown as WebGLRenderer;
  const shadows = vi.fn(() => Promise.resolve());
  const warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, () => {}, shadows, () => {});
  const root = new Group(), drawn = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()), hidden = drawn.clone(), standIn = drawn.clone();
  hidden.visible = false; standIn.layers.disableAll();
  root.add(drawn, hidden, standIn);
  try {
    await warmup.warm(root, new AbortController().signal);
    expect(compiled).toEqual([root, drawn, hidden]); // A hidden part may show later (a cockpit, a chunk); a stand-in never draws.
    // The sun shadow's depth programs of the same roots link with them, not at their first cast.
    expect(shadows).toHaveBeenCalledWith([root]);
  } finally { warmup.dispose(); }
});
