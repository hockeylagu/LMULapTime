import { expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, ShaderLib, Vector4, type Camera, type Object3D, type WebGLRenderTarget } from 'three';
import { createContactShadow, createUnderCarBaker } from '../../../../../src/components/replay/view3d/car/carContactShadow.js';
import type { BakeRenderer } from '../../../../../src/components/replay/view3d/car/underCarBake.js';
import { sceneDayLight } from '../../../../../src/components/replay/view3d/scene/dayLight.js';

const carModel = () => {
  const model = new Group(); model.position.set(5, 1, 5);
  const body = new Mesh(new BoxGeometry(2, 1, 4.6), new MeshBasicMaterial()); body.position.y = 0.5; model.add(body);
  body.userData.footprint = [-1, 0, -2.3, 1, 1, 2.3]; // The part's box in the model's frame, measured by the body loader.
  return model;
};

/** A renderer that records its calls and holds a state the bake must put back. */
const stubRenderer = () => {
  const calls: string[] = [];
  let target: WebGLRenderTarget | null = null; const color = new Color(0x123456);
  const renderer: BakeRenderer = {
    autoClear: false,
    getRenderTarget: () => target, setRenderTarget: next => { target = next; calls.push('target'); },
    getClearColor: out => out.copy(color), getClearAlpha: () => 0.5, setClearColor: (value, alpha) => { color.copy(value); calls.push(`clear ${alpha}`); },
    getViewport: out => out.set(1, 2, 3, 4), setViewport: (viewport: Vector4) => { calls.push(`viewport ${viewport.toArray().join(',')}`); },
    render: (scene: Object3D, _camera: Camera) => { calls.push(`render ${scene.type}`); },
  };
  return {renderer, calls, color};
};
const renderCount = (calls: string[]) => calls.filter(call => call.startsWith('render')).length;
const draw = (shadow: Object3D) => shadow.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
/** A car of a body with its shadow added, as the car models do. */
const carOf = (key: string, baker: ReturnType<typeof createUnderCarBaker>) => {
  const model = carModel(), shadow = createContactShadow(model, key, baker);
  model.add(shadow);
  return {model, shadow};
};

it('lays a soft analytic shadow on the car contact plane until its body is baked', () => {
  const shadow = createContactShadow(carModel(), 'a', createUnderCarBaker());
  expect(shadow.position.y).toBeCloseTo(0.02); expect(shadow.position.x).toBeCloseTo(0); // Model-local, on the lowest point.
  expect(shadow.geometry.parameters.width).toBeCloseTo(3); expect(shadow.geometry.parameters.height).toBeCloseTo(5.6);
  const map = shadow.material.alphaMap!, {data, width, height} = map.image as {data: Uint8Array; width: number; height: number};
  const at = (column: number, row: number) => data[(row * width + column) * 4];
  expect(at(width >> 1, height >> 1)).toBe(Math.round(255 * 0.6));
  expect(at(0, 0)).toBe(0);
  expect(shadow.castShadow).toBe(false); expect(shadow.material).toBeInstanceOf(MeshBasicMaterial);
});

it("keeps a quarter of its darkening where the sun reaches the road, all of it past the sun's shadows", () => {
  const {material} = createContactShadow(carModel(), 'a', createUnderCarBaker());
  const shader = {uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader};
  material.onBeforeCompile(shader as never, null as never);
  expect(shader.fragmentShader).toContain('diffuseColor.a *= mix( 1.0 - 0.75 * sunLit, 1.0, beyond );');
  expect(shader.fragmentShader.indexOf('sunLit = surfaceCascadeShadow')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <alphamap_fragment>'));
});

it('stays whole at night: the sun share of the fade follows the day share, not the moon', () => {
  const {material} = createContactShadow(carModel(), 'a', createUnderCarBaker());
  const shader = {uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader};
  material.onBeforeCompile(shader as never, null as never);
  expect(shader.fragmentShader).toContain('sunLit = surfaceCascadeShadow( vCascadeViewDepth ) * contactShadow_dayLight;');
  expect(shader.uniforms.contactShadow_dayLight).toBe(sceneDayLight);
});

it('draws pulled toward the eye, so a cambered road under the flat quad does not cut it frame by frame', () => {
  const {material} = createContactShadow(carModel(), 'a', createUnderCarBaker());
  const shader = {uniforms: {} as Record<string, unknown>, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader};
  material.onBeforeCompile(shader as never, null as never);
  expect(material.polygonOffset).toBe(false);
  expect(shader.vertexShader).toMatch(/#include <project_vertex>\s*mvPosition\.xyz \*= max\( 0\.0, 1\.0 - 0\.15 \/ length\( mvPosition\.xyz \) \);\s*gl_Position = projectionMatrix \* mvPosition;/);
});

it('refuses a model without measured parts', () => {
  expect(() => createContactShadow(new Group().add(new Mesh(new BoxGeometry())), 'a')).toThrow('no measured parts');
});

it('bakes a body once for all its cars, one body per frame, and swaps the baked map in', () => {
  const baker = createUnderCarBaker(), bodyA = 'a', bodyB = 'b';
  const shadows = [carOf(bodyA, baker).shadow, carOf(bodyA, baker).shadow, carOf(bodyB, baker).shadow];
  const first = stubRenderer(); baker.flush(first.renderer);
  expect(renderCount(first.calls)).toBe(0); // Nothing was about to draw yet.
  shadows.forEach(draw);
  const second = stubRenderer(); baker.flush(second.renderer);
  expect(renderCount(second.calls)).toBe(2); // One body: its height pass and its occlusion pass.
  expect(shadows[0].material.alphaMap!.image).not.toHaveProperty('data'); // A render target's image, not the analytic data.
  expect(shadows[1].material.alphaMap).toBe(shadows[0].material.alphaMap); // Shared by the second car of the body.
  expect(shadows[2].material.alphaMap!.image).toHaveProperty('data'); // The other body waits for the next frame.
  expect(shadows[0].geometry.parameters.width).toBeCloseTo(5.6); // Car length + 1 m (the footprint is 4.6 m long).
  const third = stubRenderer(); baker.flush(third.renderer);
  expect(renderCount(third.calls)).toBe(2);
  expect(shadows[2].material.alphaMap).not.toBe(shadows[0].material.alphaMap);
  const idle = stubRenderer(); baker.flush(idle.renderer);
  expect(idle.calls).toHaveLength(0); // Baked once each: nothing more.
});

it('puts the renderer state back and leaves the car untouched after a bake', () => {
  const baker = createUnderCarBaker(), {model, shadow} = carOf('a', baker), body = model.children[0] as Mesh, material = body.material;
  draw(shadow);
  const {renderer, calls, color} = stubRenderer();
  baker.flush(renderer);
  expect(renderer.getRenderTarget()).toBeNull(); expect(renderer.autoClear).toBe(false);
  expect(color.getHex()).toBe(0x123456); expect(calls).toContain('clear 0.5'); expect(calls).toContain('viewport 1,2,3,4');
  expect(body.material).toBe(material); expect(shadow.visible).toBe(true); expect(body.geometry.attributes.position).toBeDefined();
});

it('bakes the exterior seen up close as built, whatever is visible or batched by the first draw, as proxies in the car frame', () => {
  const baker = createUnderCarBaker(), model = carModel();
  const inside = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), cabin = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const far = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), nested = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  inside.userData.cockpitView = 'in'; cabin.userData.interior = true; far.userData.lod = {inM: 30, outM: null};
  const group = new Group(); group.userData.lod = {inM: 0, outM: 30}; group.position.set(1, 2, 3); nested.position.set(0, 1, 0); group.add(nested);
  model.add(inside, cabin, far, group);
  const shadow = createContactShadow(model, 'a', baker); model.add(shadow);
  // The cockpit view hides the exterior, and a batch takes a part's vertices: the bake depends on neither.
  model.visible = false; const body = model.children[0] as Mesh, vertices = body.geometry.attributes.position.count;
  body.geometry = new BoxGeometry(); body.geometry.deleteAttribute('position');
  draw(shadow);
  const drawn: Mesh[][] = [], {renderer} = stubRenderer();
  renderer.render = scene => { drawn.push(scene.children.slice() as Mesh[]); };
  baker.flush(renderer);
  expect(drawn[0]).toHaveLength(2); // The body and the nested close part: not the 'in' or cabin mesh, not the far level, not the shadow quad.
  expect(drawn[0][0].geometry.attributes.position.count).toBe(vertices);
  expect(drawn[0].some(proxy => proxy.matrix.elements[13] === 3)).toBe(true); // Nested: group (1, 2, 3) then its own (0, 1, 0).
});

it('releases the baked map with the last car of its body', () => {
  const baker = createUnderCarBaker(), key = 'a', a = carOf(key, baker).shadow, b = carOf(key, baker).shadow;
  draw(a); baker.flush(stubRenderer().renderer);
  let disposed = 0; baker.mapOf(key)!.addEventListener('dispose', () => { disposed++; });
  a.material.dispose(); expect(disposed).toBe(0);
  b.material.dispose(); expect(disposed).toBe(1);
});
