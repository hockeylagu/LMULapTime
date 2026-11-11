import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Scene, Vector3, Vector4, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { createCascadeShadows, placeCascadeCamera } from '../../../../../src/components/replay/view3d/shadows/cascadeShadows.js';
import { shadowCascadeLayout, sunSquareAxes } from '../../../../../src/components/replay/view3d/shadows/shadowCascades.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const {shadows} = testShading();
const layout = shadowCascadeLayout(shadows, shadows.cameras.chase);
const light = new Vector3(1, -1, 0.5).normalize();

/** A renderer that records each draw: the viewport and whether the car was drawn. */
function recordingRenderer(car: Mesh) {
  const draws: Array<{viewport: Vector4; car: boolean}> = [];
  let target: unknown = null;
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, capabilities: {maxTextureSize: 16384},
    initRenderTarget() {}, clear() {},
    getRenderTarget: () => target, setRenderTarget(next: unknown) { target = next; },
    render() { draws.push({viewport: (target as {viewport: Vector4}).viewport.clone(), car: car.visible}); },
  };
  return {renderer: renderer as unknown as WebGLRenderer, draws};
}

function setUp() {
  const scene = new Scene(), wall = new Mesh(new BoxGeometry(5, 5, 5), new MeshBasicMaterial()), car = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  wall.castShadow = true; car.castShadow = true; scene.add(wall, car); scene.updateMatrixWorld(true);
  const {renderer, draws} = recordingRenderer(car);
  const view = new PerspectiveCamera(); view.position.set(0, 1, 0); view.lookAt(0, 1, -1);
  return {cascades: createCascadeShadows(renderer, scene, shadows, layout, light), draws, view, car};
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

  it('draws every cascade into its tile first, then only the live ones while the view stays put', () => {
    const {cascades, draws, view} = setUp();
    expect(cascades.update(view, [])).toBe(false);
    // The second atlas sits above the first in one 64 x 128 texture.
    expect(draws.map(draw => [draw.viewport.x, draw.viewport.y, draw.viewport.z])).toEqual([[0, 0, 32], [32, 0, 32], [0, 64, 32]]);
    expect(cascades.state.tiles.map(tile => tile.toArray())).toEqual([[0, 0, 0.5, 0.25], [0.5, 0, 0.5, 0.25], [0, 0.5, 0.5, 0.25]]);
    draws.length = 0;
    cascades.update(view, []);
    expect(draws).toHaveLength(2);
  });

  it('leaves the cars out of a cached cascade only, and redraws it once its centre has moved an eighth of its side', () => {
    const {cascades, draws, view, car} = setUp();
    cascades.update(view, [car]);
    expect(draws.map(draw => draw.car)).toEqual([true, true, false]);
    // The cached square is 242 m: a 20 m move across the sun is under an eighth of it, a further 20 m is over.
    const {u} = sunSquareAxes(light);
    for (const [acrossM, drawn] of [[20, 2], [40, 3]] as const) {
      draws.length = 0; view.position.set(0, 1, 0).addScaledVector(u, acrossM); cascades.update(view, [car]);
      expect(draws).toHaveLength(drawn);
    }
    expect(car.visible).toBe(true);
  });

  it('maps a point at a cascade centre to the middle of its tile', () => {
    const {cascades, view} = setUp();
    cascades.update(view, []);
    // The first slice midpoint on the view line: 1 m up, looking along −z, (0.1 + 20) / 2 m ahead.
    const point = new Vector3(0, 1, -(0.1 + 20) / 2).applyMatrix4(cascades.state.matrices[0]);
    // Off the middle by at most a texel's snap (0.6875 m texels over a 22 m square).
    expect(Math.abs(point.x - 0.5)).toBeLessThanOrEqual(0.5 / 32 + 1e-9);
    expect(Math.abs(point.y - 0.5)).toBeLessThanOrEqual(0.5 / 32 + 1e-9);
  });

  it('redraws every cascade from a new sun direction', () => {
    const {cascades, draws, view} = setUp();
    cascades.update(view, []);
    draws.length = 0;
    cascades.setLight(new Vector3(-1, -1, 0).normalize());
    cascades.update(view, []);
    expect(draws).toHaveLength(3);
  });
});
