import { expect, it, vi } from 'vitest';
import { DirectionalLight, Fog, Mesh, Scene, Texture, Vector3, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { addSceneEnvironment } from '../../../../src/components/replay/view3d/sceneEnvironment.js';

const probe = vi.hoisted(() => ({render: vi.fn<(scene: Scene) => void>(), dispose: vi.fn()}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, PMREMGenerator: class {
    fromScene(scene: Scene) { probe.render(scene); return {texture: new actual.Texture(), dispose: probe.dispose}; }
    dispose() {}
  }};
});

it('fills the void with sky, horizon fog and a default ground below every scanned surface, and keeps the sun on the car', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0}} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer, -12);
  const ground = scene.getObjectByName('default-terrain') as Mesh;
  expect(environment.groundY).toBeLessThan(-12); expect(ground.position.y).toBe(environment.groundY);
  expect(ground.receiveShadow).toBe(true); expect(scene.getObjectByName('sky')).toBeDefined();
  expect(scene.fog).toBeInstanceOf(Fog); expect(renderer.shadowMap.enabled).toBe(true);
  const sun = scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight)!;
  expect(sun.castShadow).toBe(true);
  environment.follow(new Vector3(500, 3, -200));
  expect(sun.target.position.toArray()).toEqual([500, 3, -200]);
  expect(sun.position.y).toBeGreaterThan(3);
  expect(scene.environment).toBeInstanceOf(Texture);
  const sky = scene.getObjectByName('sky') as Sky;
  const reflectedSky = probe.render.mock.calls.at(-1)![0].children.find(child => child instanceof Sky)!;
  expect(reflectedSky.material).toBe(sky.material);
  expect((sky.material.uniforms.sunPosition.value as Vector3).toArray()).toEqual(sun.position.clone().sub(sun.target.position).toArray());
  environment.dispose(); expect(scene.environment).toBeNull(); expect(probe.dispose).toHaveBeenCalledOnce();
});
