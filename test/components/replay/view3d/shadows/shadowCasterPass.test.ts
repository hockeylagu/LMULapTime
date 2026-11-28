import { BackSide, BatchedMesh, BoxGeometry, DoubleSide, FrontSide, Mesh, MeshDepthMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector2, Vector4, WebGLRenderTarget, type IUniform, type Material, type ShaderMaterial, type Side, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { billboardShadowMaterial, billboardShadowPart } from '../../../../../src/components/replay/view3d/scenery/materials/billboardCard.js';
import { composedCutOut, composedMaterial, composedParts, composedTemplate, cutOutOf } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { depthTemplate } from '../../../../../src/components/replay/view3d/shaders/depthTemplate.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { createShadowCasterPass } from '../../../../../src/components/replay/view3d/shadows/shadowCasterPass.js';

const noBias = {slope: 0, units: 0};

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
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [], 0);
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
  const pass = createShadowCasterPass(renderer, scene), draw = () => pass.draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [], 0);
  draw(); draw();
  const [first, again] = seen, [da, db, dTwo, dGrille, dGrille2, dHedge] = first as MeshDepthMaterial[];
  expect(da).toBe(db); expect(dTwo).not.toBe(da); expect(dTwo.side).toBe(DoubleSide);
  // An opaque single-sided caster draws the faces the view does, a cut-out the faces it does not (the reference's culling).
  expect([da.side, dGrille.side]).toEqual([FrontSide, BackSide]);
  expect(dGrille).toBe(dGrille2); expect([dGrille.alphaTest, dGrille.map]).toEqual([0.5, fence]); expect(dHedge.map).toBe(leaves);
  expect(again).toEqual(first);
  // A cut-out's depth material goes with its texture.
  fence.dispose(); draw();
  expect(seen[2][3]).not.toBe(dGrille);
});

it('gives a batch its own depth material beside a plain mesh of the same material (three builds their programs apart)', () => {
  const scene = new Scene(), material = new MeshStandardMaterial();
  const batch = new BatchedMesh(1, 100, 300, material), plain = new Mesh(new BoxGeometry(), material), other = new Mesh(new BoxGeometry(), material);
  batch.addInstance(batch.addGeometry(new BoxGeometry()));
  for (const mesh of [batch, plain, other]) { mesh.castShadow = true; scene.add(mesh); }
  scene.updateMatrixWorld(true);
  let seen: Material[] = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { seen = [batch, plain, other].map(mesh => mesh.material as Material); },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: {slope: 1, units: 419}}], new PerspectiveCamera(), [], 0);
  expect(seen[1]).toBe(seen[2]); expect(seen[0]).not.toBe(seen[1]);
  expect(seen.every(depth => depth instanceof MeshDepthMaterial && depth.side === FrontSide)).toBe(true);
  // Each caster draws with its layer's depth offset.
  expect(seen.map(depth => [depth.polygonOffset, depth.polygonOffsetFactor, depth.polygonOffsetUnits])).toEqual(Array(3).fill([true, 1, 419]));
});

it('draws the shadow in plain depth while the scene uses a reversed depth range, then goes back to it', () => {
  const calls: Array<boolean | string> = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => true, setReversed(value: boolean) { calls.push(value); }}}},
    clear() { calls.push('clear'); }, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {}, render() { calls.push('render'); },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, new Scene()).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [], 0);
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
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [], 1);
  expect([drawn, batch.geometry.boundingSphere]).toEqual([false, null]);
});

it('draws every caster without a size floor, measuring none', () => {
  const scene = new Scene(), tiny = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshStandardMaterial());
  tiny.castShadow = true; scene.add(tiny); scene.updateMatrixWorld(true);
  let drawn: Material | undefined;
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { drawn = tiny.material; },
  } as unknown as WebGLRenderer;
  createShadowCasterPass(renderer, scene).drawRoots(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [scene]);
  expect([drawn instanceof MeshDepthMaterial, tiny.geometry.boundingSphere]).toEqual([true, null]);
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
  createShadowCasterPass(renderer, scene).draw(target, lights.map((light, i) => ({viewport: new Vector4(i * 2, 0, 2, 2), light, depthBias: noBias})), new PerspectiveCamera(), [], 0);
  expect(walk).toHaveBeenCalledTimes(1);
  expect(assigned).toBe(2); // One swap to the depth material, one restore.
  expect(body.material).toBe(original);
  expect(calls.map(call => call.camera)).toEqual(lights);
  expect(calls.map(call => call.viewport.x)).toEqual([0, 2, 4]);
  expect(calls.every(call => call.depth && call.blind)).toBe(true);
});

it("cuts a composed surface by its cut-out where it reads it, and draws a card with its shadow turn, cut by its cut-out and side", () => {
  const scene = new Scene(), fence = new Texture(), leaves = new Texture();
  const composedOf = (texture: Texture, side: Side = FrontSide) => {
    const own = {surface_albedo: {value: texture}, surface_uv_albedo: {value: new Vector4()}, surface_scale_albedo: {value: new Vector2(8, 8)}};
    const part = {name: 'cut', slots: {}, uniforms: () => own,
      cutOut: (u: Record<string, IUniform>) => cutOutOf(u.surface_albedo, u.surface_uv_albedo, {scale: u.surface_scale_albedo})};
    return composedMaterial(litTemplate, [part], {alphaTest: 0.5, side});
  };
  const wall = new Mesh(new BoxGeometry(), composedOf(fence)), gate = new Mesh(new BoxGeometry(), composedOf(fence));
  const tree = new Mesh(new BoxGeometry(), Object.assign(composedOf(leaves, DoubleSide), {shadowSide: DoubleSide}));
  tree.customDepthMaterial = billboardShadowMaterial();
  for (const mesh of [wall, gate, tree]) { mesh.castShadow = true; scene.add(mesh); }
  scene.updateMatrixWorld(true);
  let seen: Material[] = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render() { seen = [wall, gate, tree].map(mesh => mesh.material as Material); },
  } as unknown as WebGLRenderer;
  const pass = createShadowCasterPass(renderer, scene);
  const draw = () => pass.draw(new WebGLRenderTarget(4, 4), [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}], new PerspectiveCamera(), [], 0);
  draw();
  const [wallDepth, gateDepth, card] = seen as ShaderMaterial[], wallCut = composedCutOut(wall.material)!;
  // On the depth template, reading the wall's own cut-out uniforms (its world XZ at its scale), on its back faces.
  expect(composedTemplate(wallDepth)).toBe(depthTemplate);
  expect([wallDepth.uniforms.cutOut_map, wallDepth.uniforms.cutOut_uvSets, wallDepth.uniforms.cutOut_scale]).toEqual([wallCut.map, wallCut.uvSets, wallCut.scale]);
  expect(wallDepth.uniforms.cutOut_scale).toBe(wallCut.scale);
  expect([wallDepth.alphaTest, wallDepth.side]).toEqual([0.5, BackSide]);
  // Another surface of the same texture reads its own values: its own depth material, the same program.
  expect(gateDepth).not.toBe(wallDepth); expect(gateDepth.customProgramCacheKey()).toBe(wallDepth.customProgramCacheKey());
  // The card's own shadow material, on its side, with the depth cut by its leaves' cut-out.
  expect(composedParts(card)?.[0]).toBe(billboardShadowPart); expect(composedParts(card)?.[1]?.name).toBe('depthCutOut');
  expect([card.side, card.alphaTest, card.uniforms.cutOut_map.value]).toEqual([DoubleSide, 0.5, leaves]);
  expect(card.fragmentShader).toContain('if ( diffuseColor.a < alphaTest ) discard;');
  // A cut-out's depth material goes with its surface.
  wall.material.dispose(); draw();
  expect(seen[0]).not.toBe(wallDepth); expect(seen[1]).toBe(gateDepth);
});

it('frees its depth materials and depth-copy quad on dispose, and lets go of the textures they cut by', () => {
  const scene = new Scene(), fence = new Texture(), grille = new Mesh(new BoxGeometry(), new MeshStandardMaterial({alphaTest: 0.5, map: fence}));
  grille.castShadow = true; scene.add(grille); scene.updateMatrixWorld(true);
  const drawn: Array<Material | Material[]> = [];
  const renderer = {
    autoClear: true, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, clear() {}, getRenderTarget: () => null, setRenderTarget() {}, getScissorTest: () => false, setScissorTest() {},
    render(root: Scene) { drawn.push((root.children[0] as Mesh).material); },
  } as unknown as WebGLRenderer;
  const pass = createShadowCasterPass(renderer, scene), layers = [{viewport: new Vector4(0, 0, 4, 4), light: new OrthographicCamera(), depthBias: noBias}];
  pass.drawRoots(new WebGLRenderTarget(4, 4), layers, new PerspectiveCamera(), [scene], new WebGLRenderTarget(4, 4));
  // The tile takes its base depth first (the copy quad), then the grille draws with its depth material.
  const [copy, depth] = drawn as [Material, MeshDepthMaterial];
  expect([copy.type, depth.type]).toEqual(['ShaderMaterial', 'MeshDepthMaterial']);
  const freed = [vi.spyOn(depth, 'dispose'), vi.spyOn(copy, 'dispose')], unlisten = vi.spyOn(fence, 'removeEventListener');
  pass.dispose();
  expect(freed.map(spy => spy.mock.calls.length)).toEqual([1, 1]);
  expect(unlisten).toHaveBeenCalledWith('dispose', expect.any(Function));
});

it('compiles the depth programs of the casters into its target on plain depth, then puts every material and setting back', async () => {
  const scene = new Scene(), fence = new Texture();
  const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), grille = new Mesh(new BoxGeometry(), new MeshStandardMaterial({alphaTest: 0.5, map: fence}));
  const glass = new Mesh(new BoxGeometry(), new MeshStandardMaterial({transparent: true})), standIn = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), shade = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  for (const mesh of [body, grille, glass, standIn]) mesh.castShadow = true;
  standIn.layers.disableAll();
  scene.add(body, grille, glass, standIn, shade);
  const target = new WebGLRenderTarget(4, 4), calls: string[] = [], walked: Material[] = [];
  let reversed = true, current: WebGLRenderTarget | null = null;
  const renderer = {
    state: {buffers: {depth: {getReversed: () => reversed, setReversed(value: boolean) { reversed = value; }}}},
    getRenderTarget: () => current, setRenderTarget(next: WebGLRenderTarget | null) { current = next; },
    compileAsync(view: Mesh) {
      calls.push(`compile ${current === target} reversed ${reversed}`);
      view.traverse(object => { walked.push((object as Mesh).material as Material); });
      return Promise.resolve();
    },
  } as unknown as WebGLRenderer;
  const originals = [body, grille, glass, standIn, shade].map(mesh => mesh.material);
  await createShadowCasterPass(renderer, scene).compile(target, [scene]);
  expect(calls).toEqual(['compile true reversed false']);
  // Only the casters, each with its depth material (glass casts none; a stand-in in no layer never draws).
  expect(walked.map(material => material.type)).toEqual(['MeshDepthMaterial', 'MeshDepthMaterial', 'MeshDepthMaterial']);
  expect(walked.map(material => material.visible)).toEqual([true, true, false]);
  expect([body, grille, glass, standIn, shade].map(mesh => mesh.material)).toEqual(originals);
  expect([reversed, current]).toEqual([true, null]);
});