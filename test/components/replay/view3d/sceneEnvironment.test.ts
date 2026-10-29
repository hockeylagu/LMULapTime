import { expect, it } from 'vitest';
import { DirectionalLight, Fog, Mesh, Scene, Vector3, type WebGLRenderer } from 'three';
import { addSceneEnvironment } from '../../../../src/components/replay/view3d/sceneEnvironment.js';

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
});
