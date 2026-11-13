import { Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material, type Object3D } from 'three';

export type CockpitView = 'in' | 'out';

/** A part's distance range (`extras.lod`), in metres from the camera to the car's origin: drawn within [inM, outM), to any distance when `outM` is null. */
interface PartRange { inM: number; outM: number | null }

const shownParts = new WeakMap<Object3D, {view: CockpitView; distanceM: number}>();
function showParts(car: Object3D, change: {view?: CockpitView; distanceM?: number}): void {
  const state = {...(shownParts.get(car) ?? {view: 'out' as const, distanceM: 0}), ...change};
  shownParts.set(car, state);
  car.traverse(object => {
    const marked: unknown = object.userData.cockpitView, range = object.userData.lod as PartRange | undefined;
    const variant = marked === 'in' || marked === 'out';
    if (!variant && !range) return;
    object.visible = (!variant || marked === state.view)
      && (!range || (state.distanceM >= range.inM && (range.outM === null || state.distanceM < range.outM)));
  });
}

/** Driver-camera (`in`) and exterior (`out`) cockpit meshes are alternatives: the GLB marks them with `extras.cockpitView`. */
export function setCockpitView(car: Object3D, view: CockpitView): void {
  showParts(car, {view});
}

/**
 * Shows the parts of the car whose distance range holds the camera's distance to the car's origin: a part's simpler level takes
 * over from its full one, and small parts end at their own distance. A car starts at distance 0, every part at its full level.
 */
export function setCameraDistance(car: Object3D, distanceM: number): void {
  showParts(car, {distanceM});
}

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
  const marker = new Mesh(new SphereGeometry(0.65, 12, 8), new MeshStandardMaterial({ color, transparent: ghost, opacity: ghost ? 0.5 : 1, depthWrite: !ghost, roughness: 0.35 }));
  marker.name = 'pose-marker'; marker.visible = false;
  envelope.name = 'body-envelope'; car.add(envelope, marker);
  setCockpitView(car, 'out');
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
