import { BoxGeometry, Mesh, MeshDepthMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, Vector4, WebGLRenderTarget, type Material, type WebGLRenderer } from 'three';
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
    autoClear: true, shadowMap: {autoUpdate: true}, clear() {}, getRenderTarget: () => null, setRenderTarget() {},
    render() { Object.assign(seen, {body: body.material, glass: glass.material, grille: grille.material}); },
  } as unknown as WebGLRenderer;
  const originals = [body.material, glass.material, grille.material];
  createShadowCasterPass(renderer, scene).draw(new WebGLRenderTarget(4, 4), new Vector4(0, 0, 4, 4), new OrthographicCamera(), new PerspectiveCamera(), [], 0);
  // The windscreen lets the sun into the cockpit; a grille's alpha-tested bars still cast.
  expect([seen.body, seen.grille].every(material => material instanceof MeshDepthMaterial && material.visible)).toBe(true);
  expect(seen.glass.visible).toBe(false);
  expect([body.material, glass.material, grille.material]).toEqual(originals);
});
