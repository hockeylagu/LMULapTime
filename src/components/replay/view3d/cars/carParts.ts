import { Matrix4, Mesh, type BatchedMesh, type Object3D } from 'three';

export type CockpitView = 'in' | 'out';

/** A part's distance range (`extras.lod`), in metres from the camera to the car's origin: drawn within [inM, outM), to any distance when `outM` is null. */
interface PartRange { inM: number; outM: number | null }

/** The nodes that move against the car: the body (its road fit), each wheel's pivot (suspension), steer and spin, the steering wheel. */
const MOVING = /^(body-envelope|(wheel|steer|spin)_(fl|fr|rl|rr)|steering_wheel)$/;

interface Anchor {
  node: Object3D;
  /** The anchor it hangs from (-1 for the car itself), and the fixed nodes' transform between them. */
  parent: number;
  path: Matrix4;
  /** In the car's frame, as last synced. */
  frame: Matrix4;
  visible: boolean;
}

/** A mesh of the car: fixed against its anchor, drawn by a batch instance or as itself. */
export interface CarPart {
  readonly mesh: Mesh;
  readonly anchor: number;
  /** From its anchor's frame to its own. */
  readonly rel: Matrix4;
  /** The distance ranges and cockpit views marked on it or on the fixed nodes above it, up to its anchor. */
  readonly ranges: readonly PartRange[];
  readonly views: readonly CockpitView[];
  batch: BatchedMesh | null;
  instance: number;
  /** Its instance in the cars' shadow-only batch, which casts its sun shadow in place of its batch (`batchCars`' `shadows`). */
  shadow: {batch: BatchedMesh; instance: number} | null;
  /** Whether its batch instance shows, as last synced. */
  shown: boolean;
}

export interface CarParts {
  readonly car: Object3D;
  readonly parts: readonly CarPart[];
  /**
   * Places the car's parts for this frame (after its pose, wheels and lamps are set): each moving node's frame from its own
   * transform, then each part from its anchor, a part drawn as itself by its world matrix, a batched one by its instance. Nothing
   * walks the model, and a car whose pose, moving nodes and levels are unchanged costs a dozen matrix products and a visibility check.
   */
  sync(): void;
  /** Hides the car's batch instances (a car out of view or off the track; its own meshes hide with `car.visible`). */
  hide(): void;
  /**
   * Set by the batching. `own`: the car's own batches, which ride in it (drawn in its frame, hidden with it); a batch shared with
   * other cars draws in their parent's frame. `onShown` is told when an instance starts (+1) or stops (-1) showing.
   */
  own: readonly BatchedMesh[];
  onShown: (batch: BatchedMesh, change: number) => void;
}

interface Levels { view: CockpitView; distanceM: number; band: number; thresholds: readonly number[]; changed: boolean }

const levelsOf = new WeakMap<Object3D, Levels>();

/**
 * The car's part table, built once from its model (a car of `makeCar`, its option parts already chosen). The car leaves the
 * renderer's matrix walk: its parts take their matrices from `sync` alone. The nodes marked with a distance range or a cockpit view
 * stay visible; their parts show by the car's view and camera distance (`setCockpitView`, `setCameraDistance`) instead.
 */
export function buildCarParts(car: Object3D): CarParts {
  const anchors: Anchor[] = [{node: car, parent: -1, path: new Matrix4(), frame: new Matrix4(), visible: true}];
  const parts: CarPart[] = [], thresholds = new Set<number>();
  const walk = (node: Object3D, anchor: number, path: Matrix4, ranges: PartRange[], views: CockpitView[]) => {
    for (const child of node.children) {
      child.updateMatrix();
      const marked: unknown = child.userData.cockpitView, range = child.userData.lod as PartRange | undefined;
      const own: CockpitView[] = marked === 'in' || marked === 'out' ? [...views, marked] : views, inside = range ? [...ranges, range] : ranges;
      if (range) { thresholds.add(range.inM); if (range.outM !== null) thresholds.add(range.outM); }
      if ((range || own !== views) && !(child instanceof Mesh)) child.visible = true;
      if (MOVING.test(child.name)) {
        anchors.push({node: child, parent: anchor, path: path.clone(), frame: new Matrix4(), visible: true});
        walk(child, anchors.length - 1, new Matrix4(), inside, own);
        continue;
      }
      const through = path.clone().multiply(child.matrix);
      if (child instanceof Mesh) parts.push({mesh: child as Mesh, anchor, rel: through, ranges: inside, views: own, batch: null, instance: -1, shadow: null, shown: false});
      walk(child, anchor, through, inside, own);
    }
  };
  walk(car, 0, new Matrix4(), [], []);
  // Out of the renderer's matrix walk, which runs on each of a frame's render passes: `sync` sets the matrices once per frame.
  car.matrixWorldAutoUpdate = false;
  const levels: Levels = {view: 'out', distanceM: 0, band: 0, thresholds: [...thresholds].sort((a, b) => a - b), changed: true};
  levelsOf.set(car, levels);
  const frame = new Matrix4(), placed = new Matrix4(), previous = new Matrix4(), lastWorld = new Matrix4();
  const marksShow = (part: CarPart) => part.views.every(view => view === levels.view)
    && part.ranges.every(range => levels.distanceM >= range.inM && (range.outM === null || levels.distanceM < range.outM));
  let carVisible = false, first = true;
  const table: CarParts = {
    car, parts, own: [], onShown: () => {},
    sync() {
      placeCarFrame(car);
      for (const batch of table.own) batch.matrixWorld.copy(car.matrixWorld);
      const moved = first || !lastWorld.equals(car.matrixWorld);
      lastWorld.copy(car.matrixWorld); first = false;
      let changed = levels.changed || car.visible !== carVisible;
      carVisible = car.visible;
      for (let index = 1; index < anchors.length; index++) {
        const anchor = anchors[index], node = anchor.node, parent = anchors[anchor.parent];
        const visible = node.visible && parent.visible;
        node.updateMatrix();
        previous.copy(anchor.frame);
        anchor.frame.multiplyMatrices(parent.frame, anchor.path).multiply(node.matrix);
        node.matrixWorld.multiplyMatrices(car.matrixWorld, anchor.frame);
        if (visible !== anchor.visible || !previous.equals(anchor.frame)) changed = true;
        anchor.visible = visible;
      }
      const relevel = levels.changed;
      levels.changed = false;
      // Only the parts' visibility is read for a car that neither moved nor moved its parts: no matrix products.
      for (const part of parts) {
        if (relevel && (part.ranges.length || part.views.length)) part.mesh.visible = marksShow(part);
        const batch = part.batch;
        if (!batch) {
          if (changed || moved) part.mesh.matrixWorld.multiplyMatrices(car.matrixWorld, frame.multiplyMatrices(anchors[part.anchor].frame, part.rel));
          continue;
        }
        const shown = carVisible && anchors[part.anchor].visible && part.mesh.visible;
        // A car's own batch draws in its frame: it needs the parts again only when they move against the car.
        let place = shown && (changed || (moved && batch.parent !== car));
        const shadow = part.shadow;
        if (shown !== part.shown) {
          part.shown = shown; batch.setVisibleAt(part.instance, shown); table.onShown(batch, shown ? 1 : -1); place = shown;
          if (shadow) { shadow.batch.setVisibleAt(shadow.instance, shown); table.onShown(shadow.batch, shown ? 1 : -1); }
        }
        if (!place) continue;
        frame.multiplyMatrices(anchors[part.anchor].frame, part.rel);
        const matrix = batch.parent === car ? frame : placed.multiplyMatrices(car.matrix, frame);
        batch.setMatrixAt(part.instance, matrix);
        shadow?.batch.setMatrixAt(shadow.instance, matrix);
      }
    },
    hide() {
      for (const part of parts) {
        if (!part.shown || !part.batch) continue;
        part.shown = false; part.batch.setVisibleAt(part.instance, false); table.onShown(part.batch, -1);
        if (part.shadow) { part.shadow.batch.setVisibleAt(part.shadow.instance, false); table.onShown(part.shadow.batch, -1); }
      }
      carVisible = false;
    },
  };
  return table;
}

/**
 * The car's own matrices from its position and rotation: the renderer's matrix walk leaves a car with a part table out, so whatever
 * reads its frame between placing it and its next `sync` (the driver cameras, the reflection probe) needs this first.
 */
export function placeCarFrame(car: Object3D): void {
  car.updateMatrix();
  if (car.parent) { car.parent.updateWorldMatrix(true, false); car.matrixWorld.multiplyMatrices(car.parent.matrixWorld, car.matrix); }
  else car.matrixWorld.copy(car.matrix);
}

/** Driver-camera (`in`) and exterior (`out`) cockpit meshes are alternatives: the GLB marks them with `extras.cockpitView`. */
export function setCockpitView(car: Object3D, view: CockpitView): void {
  const levels = levelsOf.get(car);
  if (!levels || levels.view === view) return;
  levels.view = view; levels.changed = true;
}

/**
 * Shows the parts of the car whose distance range holds the camera's distance to the car's origin: a part's simpler level takes
 * over from its full one, and small parts end at their own distance. A car starts at distance 0, every part at its full level.
 * Its parts switch at its next `sync`, and only when the distance crosses one of the car's thresholds.
 */
export function setCameraDistance(car: Object3D, distanceM: number): void {
  const levels = levelsOf.get(car);
  if (!levels) return;
  levels.distanceM = distanceM;
  let band = 0;
  while (band < levels.thresholds.length && distanceM >= levels.thresholds[band]) band++;
  if (band !== levels.band) { levels.band = band; levels.changed = true; }
}
