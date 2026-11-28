import {
  AlwaysDepth, BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, Vector3, Vector4, type Camera, type DepthTexture,
  type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { UNSEEN_LAYER } from '../../../../../src/components/replay/view3d/cars/carBatching.js';
import { describe, expect, it } from 'vitest';
import { cascadeDepthRangeM, createCascadeShadows, placeCascadeCamera } from '../../../../../src/components/replay/view3d/shadows/cascadeShadows.js';
import { shadowCascadeLayout, sunSquareAxes } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const {shadows} = testShading();
const layout = shadowCascadeLayout(shadows, shadows.cameras.chase);
const light = new Vector3(1, -1, 0.5).normalize();

type Event = {kind: 'render'; viewport: Vector4; root: unknown; car: boolean; layers: number} | {kind: 'copy'; viewport: Vector4; from: unknown; to: unknown; material: ShaderMaterial};

/** The depth copy's material when `root` is the pass's depth copy quad (a scene of one quad reading `baseDepth`). */
const depthCopyOf = (root: unknown) => {
  const material = root instanceof Scene && root.children[0] instanceof Mesh ? root.children[0].material as unknown : null;
  return material instanceof ShaderMaterial && 'baseDepth' in material.uniforms ? material : null;
};

/** A renderer that records each render (viewport, root, whether the car was drawn) and each depth copy draw (viewport, textures), in order. */
function recordingRenderer(car: Mesh) {
  const events: Event[] = [];
  let target: unknown = null;
  const renderer = {
    autoClear: true, capabilities: {maxTextureSize: 16384}, scissor: false,
    getScissorTest() { return this.scissor; }, setScissorTest(value: boolean) { this.scissor = value; },
    state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}},
    initRenderTarget() {}, clear() {},
    getRenderTarget: () => target, setRenderTarget(next: unknown) { target = next; },
    render(root: unknown, camera: Camera) {
      const into = target as WebGLRenderTarget, viewport = into.viewport.clone(), copy = depthCopyOf(root);
      events.push(copy ? {kind: 'copy', viewport, from: copy.uniforms.baseDepth.value, to: into.depthTexture, material: copy}
        : {kind: 'render', viewport, root, car: car.visible, layers: camera.layers.mask});
    },
  };
  return {renderer: renderer as unknown as WebGLRenderer, events};
}

function setUp() {
  const scene = new Scene(), wall = new Mesh(new BoxGeometry(5, 5, 5), new MeshBasicMaterial()), car = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  wall.castShadow = true; car.castShadow = true; scene.add(wall, car); scene.updateMatrixWorld(true);
  const {renderer, events} = recordingRenderer(car);
  const view = new PerspectiveCamera(); view.position.set(0, 1, 0); view.lookAt(0, 1, -1);
  const draws = {
    get renders() { return events.filter(event => event.kind === 'render'); },
    get copies() { return events.filter(event => event.kind === 'copy'); },
    get events() { return events; },
    clear() { events.length = 0; },
  };
  return {cascades: createCascadeShadows(renderer, scene, shadows, layout, light), draws, view, car, scene};
}

describe('cascade shadows', () => {
  it('puts a cascade camera on the sun axes: the square centre at the middle of its tile, its edge at the tile edge', () => {
    const axes = sunSquareAxes(light), camera = new OrthographicCamera();
    placeCascadeCamera(camera, axes, light, [12, -7], 3, 40);
    const toTile = (point: Vector3) => point.clone().applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
      .multiplyScalar(0.5).addScalar(0.5);
    const centre = new Vector3().addScaledVector(axes.u, 12).addScaledVector(axes.v, -7).addScaledVector(light, 3);
    const middle = toTile(centre), edge = toTile(centre.clone().addScaledVector(axes.u, 20)), up = toTile(centre.clone().addScaledVector(axes.v, 20));
    [[middle.x, 0.5], [middle.y, 0.5], [edge.x, 1], [edge.y, 0.5], [up.y, 1]].forEach(([got, want]) => expect(got).toBeCloseTo(want, 6));
    expect(middle.z).toBeGreaterThan(0); expect(middle.z).toBeLessThan(1);
  });

  // Test layout: live cascades of 22 m (texel 0.6875, holds 0.83 m of drift) and 88 m (holds 11 m), a cached one of 242 m (holds 30.25 m).
  const sceneRenders = (draws: ReturnType<typeof setUp>['draws'], scene: unknown) => draws.renders.filter(event => event.root === scene);
  const across = (view: PerspectiveCamera, metres: number) => view.position.set(0, 1, 0).addScaledVector(sunSquareAxes(light).u, metres);
  // A car 150 m down the view line, in the cached cascade's 80 to 300 m slice.
  const far = new Vector3(0, 1, -150);

  it('draws a first draw as the held and cached cascades draw a car: the car alone, into a texel of its own, no tile touched', () => {
    const {cascades, draws, view, car, scene} = setUp();
    cascades.drawFirst(car, view);
    // The test layout has no whole live cascade: no scene draw, the car drawn on its own over nothing (no depth copy).
    expect([draws.renders.map(draw => [draw.root === car, draw.viewport.toArray()]), sceneRenders(draws, scene), draws.copies]).toEqual([[[true, [0, 0, 1, 1]]], [], []]);
    expect(car.visible).toBe(true);
    // It sees what the cascades see, and the layer a warming car waits in, which they do not.
    const unseen = 1 << UNSEEN_LAYER, first = draws.renders[0].layers;
    draws.clear();
    cascades.update(view, [], []);
    expect([first & unseen, first & ~unseen, draws.renders[0].layers]).toEqual([unseen, draws.renders[0].layers, first & ~unseen]);
    cascades.dispose();
  });

  it('draws every cascade into its tile first, then only redraws the held ones from their static depth while the view stays put', () => {
    const {cascades, draws, view, scene} = setUp();
    expect(cascades.update(view, [], [])).toBe(false);
    // The second atlas sits above the first in one 64 x 128 texture.
    expect(draws.renders.map(draw => [draw.viewport.x, draw.viewport.y, draw.viewport.z])).toEqual([[0, 0, 32], [32, 0, 32], [0, 64, 32]]);
    expect(draws.copies.map(copy => copy.viewport.toArray())).toEqual([[0, 0, 32, 32], [32, 0, 32, 32], [0, 64, 32, 32]]);
    expect(cascades.state.tiles.map(tile => tile.toArray())).toEqual([[0, 0, 0.5, 0.25], [0.5, 0, 0.5, 0.25], [0, 0.5, 0.5, 0.25]]);
    draws.clear();
    cascades.update(view, [], []);
    expect(draws.renders).toHaveLength(0); expect(draws.copies.map(copy => copy.viewport.x)).toEqual([0, 32]);
    expect(sceneRenders(draws, scene)).toHaveLength(0);
  });

  it('draws the cars over every cascade each frame when a casting car is far, and leaves them out of the static depth', () => {
    const {cascades, draws, view, car, scene} = setUp();
    cascades.update(view, [car], [far]);
    // Static into the held depth, the cached cascade's too, then each tile's copy and the cars over it.
    expect(draws.renders.map(draw => [draw.root === car ? 'car' : 'scene', draw.car])).toEqual([['scene', false], ['scene', false], ['scene', false], ['car', true], ['car', true], ['car', true]]);
    expect(draws.events.slice(3, 9).map(event => [event.kind, event.viewport.x, event.viewport.y])).toEqual([['copy', 0, 0], ['render', 0, 0], ['copy', 32, 0], ['render', 32, 0], ['copy', 0, 64], ['render', 0, 64]]);
    draws.clear();
    cascades.update(view, [car], [far]);
    expect(draws.renders.map(draw => [draw.root === car, draw.viewport.x, draw.viewport.y])).toEqual([[true, 0, 0], [true, 32, 0], [true, 0, 64]]);
    expect(draws.copies).toHaveLength(3); expect(sceneRenders(draws, scene)).toHaveLength(0);
    expect(car.visible).toBe(true);
  });

  it('draws the cars over a cached cascade only while its slice holds a casting car, and clears them from its tile once it does not', () => {
    const {cascades, draws, view, car} = setUp();
    const carTiles = () => draws.renders.filter(draw => draw.root === car).map(draw => draw.viewport.y);
    const copiedTiles = () => draws.copies.map(copy => copy.viewport.y);
    // A car 10 m ahead: the cached tile is copied bare after its first draw, and the cars go over the live ones only.
    const near = new Vector3(0, 1, -10);
    cascades.update(view, [car], [near]);
    expect([carTiles(), copiedTiles()]).toEqual([[0, 0], [0, 0, 64]]);
    draws.clear(); cascades.update(view, [car], [near]);
    expect([carTiles(), copiedTiles()]).toEqual([[0, 0], [0, 0]]);
    draws.clear(); cascades.update(view, [car], [far]);
    expect([carTiles(), copiedTiles()]).toEqual([[0, 0, 64], [0, 0, 64]]);
    // Back near: one bare copy clears the cars from the cached tile, then it is left alone.
    for (const want of [[0, 0, 64], [0, 0]]) {
      draws.clear(); cascades.update(view, [car], [near]);
      expect([carTiles(), copiedTiles()]).toEqual([[0, 0], want]);
    }
    // A car at 75 m, short of the cached slice by less than a car's reach, still casts into it.
    draws.clear(); cascades.update(view, [car], [new Vector3(0, 1, -75)]);
    expect(carTiles()).toEqual([0, 0, 64]);
    // No casting car draws them over the live ones only.
    draws.clear(); cascades.update(view, [car], []);
    expect(carTiles()).toEqual([0, 0]);
  });

  it('redraws the static casters of a live cascade only once its centre has drifted past its hold, and of the cached one past an eighth of its side', () => {
    const {cascades, draws, view, car, scene} = setUp();
    cascades.update(view, [car], [far]);
    // 5 m across the sun: past the 22 m cascade's 0.83 m, under the 88 m one's 11 m.
    for (const [acrossM, redrawn] of [[5, [0]], [20, [0, 32]], [40, [0, 32, 0]]] as const) {
      draws.clear(); across(view, acrossM); cascades.update(view, [car], [far]);
      expect(sceneRenders(draws, scene).map(draw => draw.viewport.x)).toEqual(redrawn);
      expect(draws.copies).toHaveLength(3);
      expect(draws.renders.filter(draw => draw.root === car)).toHaveLength(3);
    }
  });

  it('copies each held tile from its static depth into the atlas, of the same depth type, by a depth-only draw at the same texels', () => {
    const {cascades, draws, view, scene} = setUp();
    cascades.update(view, [], []);
    const [copy] = draws.copies, from = copy.from as DepthTexture, to = copy.to as DepthTexture;
    expect(to).toBe(cascades.state.atlas); expect(from).not.toBe(to);
    expect([from.type, from.image.width, from.image.height]).toEqual([to.type, to.image.width, to.image.height]);
    // Not a framebuffer blit: Direct3D 11 copies part of a depth texture as nothing.
    expect([copy.material.depthFunc, copy.material.depthWrite, copy.material.colorWrite]).toEqual([AlwaysDepth, true, false]);
    expect(copy.material.fragmentShader).toContain('gl_FragDepth = texelFetch( baseDepth, ivec2( gl_FragCoord.xy ), 0 ).r');
    expect(sceneRenders(draws, scene)).toHaveLength(3);
  });

  it('keeps the matrix of a held cascade until it moves', () => {
    const {cascades, view} = setUp();
    cascades.update(view, [], []);
    const before = cascades.state.matrices.map(matrix => matrix.clone());
    across(view, 5); cascades.update(view, [], []);
    expect(cascades.state.matrices[0].equals(before[0])).toBe(false);
    expect(cascades.state.matrices[1].equals(before[1])).toBe(true);
    expect(cascades.state.matrices[2].equals(before[2])).toBe(true);
    // The samplers' packed copy follows each redraw.
    expect(Array.from(cascades.state.packedMatrices.slice(0, 16))).toEqual(cascades.state.matrices[0].elements.map(Math.fround));
  });

  it('deepens a cascade under a low sun by 1 / sin(height), to a floor near sunset', () => {
    const sun = (degrees: number) => new Vector3(Math.cos(degrees * Math.PI / 180), -Math.sin(degrees * Math.PI / 180), 0);
    expect(cascadeDepthRangeM(40, sun(90))).toBeCloseTo(800, 6); // 400 m each way at least.
    expect(cascadeDepthRangeM(1000, sun(90))).toBeCloseTo(2000, 6);
    expect(cascadeDepthRangeM(1000, sun(30))).toBeCloseTo(4000, 6);
    expect(cascadeDepthRangeM(1000, sun(1))).toBeCloseTo(40000, 6);
    // A caster 50 m up shades the ground 235 m away under a 12 degree sun: the near cascade's range reaches back past it.
    const camera = new OrthographicCamera(), low = sun(12);
    placeCascadeCamera(camera, sunSquareAxes(low), low, [0, 0], 0, 22);
    const toDepth = (point: Vector3) => point.clone().applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix).z * 0.5 + 0.5;
    const ground = new Vector3(0, 0, 0), roof = new Vector3(-50 / Math.tan(12 * Math.PI / 180), 50, 0);
    expect(toDepth(roof)).toBeGreaterThan(0); expect(toDepth(roof)).toBeLessThan(toDepth(ground));
  });

  it('lets a camera-facing card skip 1 m of its own depth, or 14 texels of a coarse cascade, over its depth range', () => {
    const {cascades, view} = setUp();
    cascades.update(view, [], []);
    // The test cascades have 0.6875, 2.75 and 7.5625 m texels: 14 of them pass 1 m from the second on.
    layout.cascades.forEach((cascade, i) => expect(cascades.state.cardDepth[i])
      .toBeCloseTo(Math.fround(Math.max(1, 14 * cascade.texelM) / cascadeDepthRangeM(cascade.sideM, light)), 9));
  });

  it('maps a point at a cascade centre to the middle of its tile', () => {
    const {cascades, view} = setUp();
    cascades.update(view, [], []);
    // The first slice midpoint on the view line: 1 m up, looking along −z, (0.1 + 20) / 2 m ahead.
    const point = new Vector3(0, 1, -(0.1 + 20) / 2).applyMatrix4(cascades.state.matrices[0]);
    // Off the middle by at most a texel's snap (0.6875 m texels over a 22 m square).
    expect(Math.abs(point.x - 0.5)).toBeLessThanOrEqual(0.5 / 32 + 1e-9);
    expect(Math.abs(point.y - 0.5)).toBeLessThanOrEqual(0.5 / 32 + 1e-9);
  });

  it('redraws every cascade from a new sun direction', () => {
    const {cascades, draws, view, scene} = setUp();
    cascades.update(view, [], []);
    draws.clear();
    cascades.setLight(new Vector3(-1, -1, 0).normalize());
    cascades.update(view, [], []);
    expect(sceneRenders(draws, scene)).toHaveLength(3);
  });

  it('draws a live cascade whole each frame when it can hold less than a texel of drift, and holds the other', () => {
    // A package selecting only a thin middle of each tile leaves the live cascades no margin to hold.
    const thin = {...shadows, select: {...shadows.select, halfExtent: 0.4}};
    const scene = new Scene(), car = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {renderer, events} = recordingRenderer(car);
    car.castShadow = true; scene.add(car);
    const cascades = createCascadeShadows(renderer, scene, thin, layout, light), view = new PerspectiveCamera();
    cascades.update(view, [], []); events.length = 0;
    cascades.update(view, [], []);
    expect(events.filter(event => event.kind === 'render' && event.root === scene)).toHaveLength(1);
    // The held live cascade; the cached one is copied only when redrawn.
    expect(events.filter(event => event.kind === 'copy')).toHaveLength(1);
  });
});
