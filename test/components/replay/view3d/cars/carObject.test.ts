import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, type Color, type ShaderMaterial, type SphereGeometry, type Vector2 } from 'three';
import { hazePart } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { makeCar } from '../../../../../src/components/replay/view3d/cars/carObject.js';
import { composedParts } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { plainSurfaceMaterial, plainSurfacePart } from '../../../../../src/components/replay/view3d/shaders/plainSurface.js';
import { disposeObjects } from '../../../../../src/components/replay/view3d/scene/disposeObjects.js';
import { rigMaterial, rigModel } from '../../../../helpers/scenes/rigModel.js';
import { sceneEnvironmentMap } from '../../../../../src/components/replay/view3d/shaders/sceneLight.js';

it('places the textured model at the replay pose and adds a hidden pose marker', () => {
  const car = makeCar('#38bdf8', false, rigModel()), envelope = car.getObjectByName('body-envelope')!;
  expect(envelope.position.toArray()).toEqual([0, 0, 0]);
  expect(car.getObjectByName('pose-marker')!.visible).toBe(false);
  expect(envelope.getObjectByName('wheel_fl')).toBeDefined();
  const body = car.getObjectByName('body') as Mesh<BoxGeometry, ShaderMaterial>;
  expect(body.material.opacity).toBe(1); expect(body.material.polygonOffset).toBe(false);
});

it('makes ghosts translucent, rougher, metal-free and depth-ordered without touching the primary, the environment kept', () => {
  const primary = makeCar('#38bdf8', false, rigModel()), ghost = makeCar('#ffb703', true, rigModel());
  const ghostBody = ghost.getObjectByName('body') as Mesh<BoxGeometry, ShaderMaterial>;
  const primaryBody = primary.getObjectByName('body') as Mesh<BoxGeometry, ShaderMaterial>;
  expect(ghostBody.material.opacity).toBe(0.45); expect(ghostBody.material.transparent).toBe(true); expect(ghostBody.material.depthWrite).toBe(false);
  expect(ghostBody.material.polygonOffset).toBe(true); expect(ghostBody.renderOrder).toBeGreaterThan(0);
  // The composer's ghost mode: roughness 0.7, no metal, through the material's own uniforms; the scene's environment stays.
  expect([ghostBody.material.uniforms.roughness.value, ghostBody.material.uniforms.metalness.value]).toEqual([0.7, 0]);
  expect(ghostBody.material.uniforms.envMap).toBe(sceneEnvironmentMap); expect((ghostBody.material.uniforms.lit_ownEnvironment.value as Vector2).x).toBe(0);
  expect(primaryBody.material.opacity).toBe(1); expect(primaryBody.renderOrder).toBe(0);
  expect([primaryBody.material.uniforms.roughness.value, primaryBody.material.uniforms.metalness.value]).toEqual([0.5, 0.5]);
});

it('draws the pose marker as a hazed plain surface in the car colour, the ghost one translucent and rougher', () => {
  const values = (car: Group): unknown[] => {
    const material = (car.getObjectByName('pose-marker') as Mesh<SphereGeometry, ShaderMaterial>).material, u = material.uniforms;
    expect(composedParts(material)).toEqual([plainSurfacePart, hazePart]);
    return [(u.plain_colour.value as Color).getHexString(), u.plain_roughness.value, u.plain_metalness.value, u.plain_environment.value,
      material.transparent, material.opacity, material.depthWrite, material.polygonOffset];
  };
  expect(values(makeCar('#38bdf8', false, rigModel()))).toEqual(['38bdf8', 0.35, 0, 1, false, 1, true, false]);
  expect(values(makeCar('#ffb703', true, rigModel()))).toEqual(['ffb703', 0.7, 0, 1, true, 0.5, false, true]);
});

it("gives a ghost's plain surfaces the ghost's finish through their uniforms, the scene's environment kept", () => {
  const model = new Group(), glass = new Mesh(new BoxGeometry(), plainSurfaceMaterial({ colour: 0, roughness: 1, metalness: 0.2, environment: 0 }));
  glass.name = 'mirror'; model.add(glass);
  makeCar('#ffb703', true, model);
  const { material } = glass, u = material.uniforms;
  expect([u.plain_roughness.value, u.plain_metalness.value, u.plain_environment.value, material.opacity, material.transparent, material.polygonOffset]).toEqual([0.7, 0, 1, 0.45, true, true]);
});

it('shares geometry marked sharedAsset and respects includeShared on disposal', () => {
  const source = new Group(), geom = new BoxGeometry(2, 1, 4); geom.userData.sharedAsset = true;
  const mesh = new Mesh(geom, rigMaterial()); mesh.name = 'shared'; source.add(mesh);
  const car = makeCar('#38bdf8', false, source);
  expect((car.getObjectByName('shared') as Mesh).geometry).toBe(geom);
  const dispose = vi.spyOn(geom, 'dispose');
  disposeObjects(car, false); expect(dispose).not.toHaveBeenCalled();
  disposeObjects(car, true); expect(dispose).toHaveBeenCalledOnce();
});
