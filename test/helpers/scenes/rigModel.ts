import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

/** A textured-car stand-in: four wheel, steer and spin rig nodes at their rolling hubs (radius 0.33 m) and a body. */
export function rigModel(): Group {
  const model = new Group(), body = new Mesh(new BoxGeometry(2, 0.5, 4), new MeshStandardMaterial()); body.name = 'body'; model.add(body);
  for (const [corner, x, z] of [['fl', 0.8, -1.4], ['fr', -0.8, -1.4], ['rl', 0.8, 1.4], ['rr', -0.8, 1.4]] as const) {
    const pivot = new Group(), steer = new Group(), spin = new Group();
    pivot.name = `wheel_${corner}`; steer.name = `steer_${corner}`; spin.name = `spin_${corner}`;
    pivot.position.set(x, 0.33, z); pivot.userData.wheelPivot = [x, 0.33, z];
    spin.add(new Mesh(new BoxGeometry(0.2, 0.66, 0.66), new MeshStandardMaterial()));
    steer.add(spin); pivot.add(steer); model.add(pivot);
  }
  return model;
}
