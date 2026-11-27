import { BoxGeometry, Color, Group, Mesh, type ShaderMaterial } from 'three';
import { carStandardPart } from '../../../src/components/replay/view3d/car/carStandardSurface.js';
import { composedMaterial } from '../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../src/components/replay/view3d/shaders/litTemplate.js';

/** A car part's material as the car draws one: three's standard model on the lit template. */
export const rigMaterial = (): ShaderMaterial => composedMaterial(litTemplate, [carStandardPart({colour: new Color(1, 1, 1), roughness: 0.5, metalness: 0.5})]);

/** A textured-car stand-in: four wheel, steer and spin rig nodes at their rolling hubs (radius 0.33 m) and a body. */
export function rigModel(): Group {
  const model = new Group(), body = new Mesh(new BoxGeometry(2, 0.5, 4), rigMaterial()); body.name = 'body'; model.add(body);
  for (const [corner, x, z] of [['fl', 0.8, -1.4], ['fr', -0.8, -1.4], ['rl', 0.8, 1.4], ['rr', -0.8, 1.4]] as const) {
    const pivot = new Group(), steer = new Group(), spin = new Group();
    pivot.name = `wheel_${corner}`; steer.name = `steer_${corner}`; spin.name = `spin_${corner}`;
    pivot.position.set(x, 0.33, z); pivot.userData.wheelPivot = [x, 0.33, z];
    spin.add(new Mesh(new BoxGeometry(0.2, 0.66, 0.66), rigMaterial()));
    steer.add(spin); pivot.add(steer); model.add(pivot);
  }
  return model;
}
