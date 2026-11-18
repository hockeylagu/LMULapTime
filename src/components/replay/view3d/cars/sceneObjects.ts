import { Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material } from 'three';
import { hazeProgram } from '../atmosphere/haze.js';

/**
 * One car for a lap: a parsed textured car whose materials the caller already created per native material,
 * placed at its model origin (the replay pose), with a pose marker for samples without a heading.
 * `model` is a clone that shares its geometry with the parsed template (marked `sharedAsset`).
 */
export function makeCar(color: string, ghost: boolean, model: Group): Group {
  const car = new Group(), envelope = model;
  let order = 1;
  envelope.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (ghost) object.renderOrder = order++;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!ghost) continue;
      material.transparent = true; material.opacity = 0.45; material.depthWrite = false;
      if (material instanceof MeshStandardMaterial) {
        material.roughness = 0.7; material.metalness = 0;
        material.envMap = null; material.envMapIntensity = 0;
      }
      material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;
    }
  });
  const markerMaterial = new MeshStandardMaterial({
    color, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost,
    roughness: ghost ? 0.7 : 0.35, ...(ghost ? { metalness: 0, envMap: null, envMapIntensity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
  });
  hazeProgram(markerMaterial);
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), markerMaterial);
  // Camera-distance sorting can swap intersecting transparent body/tyre parts each frame.
  if (ghost) marker.renderOrder = order;
  marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  return car;
}
