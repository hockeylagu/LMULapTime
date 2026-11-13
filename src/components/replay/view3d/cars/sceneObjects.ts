import { Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material } from 'three';
import { hazeProgram } from '../atmosphere/haze.js';

/**
 * One car for a lap: a parsed textured car whose materials the caller already created per native material,
 * placed at its model origin (the replay pose), with a pose marker for samples without a heading.
 * `model` is a clone that shares its geometry with the parsed template (marked `sharedAsset`).
 */
export function makeCar(color: string, ghost: boolean, model: Group): Group {
  const car = new Group(), envelope = model;
  envelope.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (ghost) { material.transparent = true; material.opacity = 0.45; material.depthWrite = false; }
    }
  });
  const markerMaterial = new MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost, roughness: 0.35 });
  hazeProgram(markerMaterial);
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), markerMaterial);
  marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  if (ghost) {
    let order = 1;
    car.traverse(object => {
      if (!(object instanceof Mesh)) return;
      // Camera-distance sorting can swap intersecting transparent body/tyre parts each frame.
      object.renderOrder = order++;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      for (const ghostMaterial of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (ghostMaterial instanceof MeshStandardMaterial) {
          ghostMaterial.roughness = 0.7; ghostMaterial.metalness = 0;
          ghostMaterial.envMap = null; ghostMaterial.envMapIntensity = 0;
        }
        ghostMaterial.polygonOffset = true; ghostMaterial.polygonOffsetFactor = -1; ghostMaterial.polygonOffsetUnits = -1;
      }
    });
  }
  return car;
}
