import { BackSide, BoxGeometry, DoubleSide, Mesh, MeshDepthMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector4, WebGLRenderTarget, type Material, type WebGLRenderer } from 'three';
import { expect, it } from 'vitest';
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
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {},
    render() { Object.assign(seen, {body: body.material, glass: glass.material, grille: grille.material}); },
  } as unknown as WebGLRenderer;
  const originals = [body.material, glass.material, grille.material];
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), new Vector4(0, 0, 4, 4), new OrthographicCamera(), new PerspectiveCamera(), [], 0);
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
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {},
    render() { seen.push([a, b, twoSided, grille, grille2, hedge].map(({material}) => material as Material)); },
  } as unknown as WebGLRenderer;
  const pass = createShadowCasterPass(renderer, scene), draw = () => pass.draw(new WebGLRenderTarget(4, 4), new Vector4(0, 0, 4, 4), new OrthographicCamera(), new PerspectiveCamera(), [], 0);
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
    clear() { calls.push('clear'); }, getRenderTarget: () => null, setRenderTarget() {}, render() { calls.push('render'); },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, new Scene()).draw(new WebGLRenderTarget(4, 4), new Vector4(0, 0, 4, 4), new OrthographicCamera(), new PerspectiveCamera(), [], 0);
  expect(calls).toEqual([false, 'clear', 'render', true]);
});
