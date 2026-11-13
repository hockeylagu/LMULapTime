import { BackSide, BatchedMesh, BoxGeometry, DoubleSide, Mesh, MeshDepthMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector4, WebGLRenderTarget, type Material, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { createShadowCasterPass } from '../../../../../src/components/replay/view3d/shadows/shadowCasterPass.js';

it('draws opaque surfaces and cut-outs into the shadow, but not blended glass, then restores every material', () => {
  const scene = new Scene();
  const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const glass = new Mesh(new BoxGeometry(), new MeshStandardMaterial({transparent: true, depthWrite: false}));
  const grille = new Mesh(new BoxGeometry(), new MeshStandardMaterial({transparent: true, alphaTest: 0.5}));
  for (const mesh of [body, glass, grille]) { mesh.castShadow = true; scene.add(mesh); }
  scene.updateMatrixWorld(true);
  const seen: Record<string, Material> = {};
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { Object.assign(seen, {body: body.material, glass: glass.material, grille: grille.material}); },
  } as unknown as WebGLRenderer;
  const originals = [body.material, glass.material, grille.material];
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera()}], new PerspectiveCamera(), [], 0);
  // The windscreen lets the sun into the cockpit; a grille's alpha-tested bars still cast.
  expect([seen.body, seen.grille].every(material => material instanceof MeshDepthMaterial && material.visible)).toBe(true);
  expect(seen.glass.visible).toBe(false);
  expect([body.material, glass.material, grille.material]).toEqual(originals);
});

it('shares one depth material among casters that draw alike: same side, and for cut-outs the same cut and texture', () => {
  const scene = new Scene();
  const mesh = (material: MeshStandardMaterial) => { const made = new Mesh(new BoxGeometry(), material); made.castShadow = true; scene.add(made); return made; };
  const fence = new Texture(), leaves = new Texture();
  const [a, b, twoSided, grille, grille2, hedge] = [mesh(new MeshStandardMaterial()), mesh(new MeshStandardMaterial()), mesh(new MeshStandardMaterial({side: DoubleSide})),
    mesh(new MeshStandardMaterial({alphaTest: 0.5, map: fence})), mesh(new MeshStandardMaterial({alphaTest: 0.5, map: fence})), mesh(new MeshStandardMaterial({alphaTest: 0.5, map: leaves}))];
  scene.updateMatrixWorld(true);
  const seen: Material[][] = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { seen.push([a, b, twoSided, grille, grille2, hedge].map(({material}) => material as Material)); },
  } as unknown as WebGLRenderer;
  const pass = createShadowCasterPass(renderer, scene), draw = () => pass.draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera()}], new PerspectiveCamera(), [], 0);
  draw(); draw();
  const [first, again] = seen, [da, db, dTwo, dGrille, dGrille2, dHedge] = first as MeshDepthMaterial[];
  expect(da).toBe(db); expect(da.side).toBe(BackSide); expect(dTwo).not.toBe(da); expect(dTwo.side).toBe(DoubleSide);
  expect(dGrille).toBe(dGrille2); expect([dGrille.alphaTest, dGrille.map]).toEqual([0.5, fence]); expect(dHedge.map).toBe(leaves);
  expect(again).toEqual(first);
  // A cut-out's depth material goes with its texture.
  fence.dispose(); draw();
  expect(seen[2][3]).not.toBe(dGrille);
});

it('draws the shadow in plain depth while the scene uses a reversed depth range, then goes back to it', () => {
  const calls: Array<boolean | string> = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => true, setReversed(value: boolean) { calls.push(value); }}}},
    clear() { calls.push('clear'); }, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {}, render() { calls.push('render'); },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, new Scene()).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera()}], new PerspectiveCamera(), [], 0);
  expect(calls).toEqual([false, 'clear', 'render', true]);
});

it("sizes a batch by its instances' bounds, not by its reserved buffer", () => {
  const scene = new Scene(), batch = new BatchedMesh(2, 1000, 3000, new MeshStandardMaterial());
  // A 0.1 m box in a batch whose buffer has room for much more: a cached cascade leaves it out like any small caster.
  batch.addInstance(batch.addGeometry(new BoxGeometry(0.1, 0.1, 0.1)));
  batch.castShadow = true; scene.add(batch); scene.updateMatrixWorld(true);
  let drawn: boolean | undefined;
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { drawn = batch.visible; },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera()}], new PerspectiveCamera(), [], 1);
  expect([drawn, batch.geometry.boundingSphere]).toEqual([false, null]);
});

it('walks the scene and swaps materials once for several layers, each rendered with its own camera and viewport', () => {
  const scene = new Scene();
  const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), glass = new Mesh(new BoxGeometry(), new MeshStandardMaterial({transparent: true}));
  for (const mesh of [body, glass]) { mesh.castShadow = true; scene.add(mesh); }
  scene.updateMatrixWorld(true);
  const walk = vi.spyOn(scene, 'traverseVisible');
  let assigned = 0, material: Material | Material[] = body.material;
  Object.defineProperty(body, 'material', {get: () => material, set: (value: Material | Material[]) => { material = value; assigned++; }});
  const calls: Array<{camera: unknown; viewport: Vector4; depth: boolean; blind: boolean}> = [];
  const target = new WebGLRenderTarget(8, 8), lights = [new OrthographicCamera(), new OrthographicCamera(), new OrthographicCamera()];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render(_scene: Scene, camera: unknown) { calls.push({camera, viewport: target.viewport.clone(), depth: body.material instanceof MeshDepthMaterial, blind: !(glass.material as Material).visible}); },
  } as unknown as WebGLRenderer;
  const original = body.material;
  createShadowCasterPass(renderer, scene).draw(target, lights.map((light, i) => ({viewport: new Vector4(i * 2, 0, 2, 2), light})), new PerspectiveCamera(), [], 0);
  expect(walk).toHaveBeenCalledTimes(1);
  expect(assigned).toBe(2); // One swap to the depth material, one restore.
  expect(body.material).toBe(original);
  expect(calls.map(call => call.camera)).toEqual(lights);
  expect(calls.map(call => call.viewport.x)).toEqual([0, 2, 4]);
  expect(calls.every(call => call.depth && call.blind)).toBe(true);
});
