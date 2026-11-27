import { Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';
import { composedGhost, composedParts } from '../shaders/composer.js';
import { plainSurfaceMaterial } from '../shaders/plainSurface.js';

/**
 * One car for a lap: a parsed textured car whose materials the caller already created per native material,
 * placed at its model origin (the replay pose), with a pose marker for samples without a heading.
 * `model` is a clone that shares its geometry with the parsed template (marked `sharedAsset`).
 *
 * A ghost draws see-through, over the car it overlaps, in the composer's ghost mode (`composedGhost`: roughness 0.7, no metal); its
 * lamps fade with it. It keeps the scene's environment at the scene's intensity, as its built-in materials did (three lit them by the
 * scene's environment whatever their `envMapIntensity` while they had no map of their own).
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
      if (composedParts(material)) composedGhost(material);
      material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;
    }
  });
  const markerMaterial = plainSurfaceMaterial({colour: color, roughness: ghost ? 0.7 : 0.35, metalness: 0, environment: 1}, {
    transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost,
    ...(ghost ? {polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1} : {}),
  });
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), markerMaterial);
  // Camera-distance sorting can swap intersecting transparent body/tyre parts each frame.
  if (ghost) marker.renderOrder = order;
  marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  return car;
}
