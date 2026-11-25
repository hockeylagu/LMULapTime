import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Box3, BufferGeometry, Group, Matrix4, Mesh, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createSlicer } from '../batching/batchedParts.js';

/** The model node the car body's fixed parts hang under, in the body's file and in its interior's. */
const CHASSIS = 'chassis';

/**
 * Prepares a parsed body for its vertices to leave the CPU: each geometry's bounds, and each part's exact box in the body's frame
 * (`userData.footprint`, min then max), which the contact shadow reads instead of the vertices.
 */
async function prepareGeometry(body: Group): Promise<void> {
  body.updateWorldMatrix(true, true);
  const toBody = new Matrix4().copy(body.matrixWorld).invert(), frame = new Matrix4(), point = new Vector3(), box = new Box3();
  const meshes: Object3D[] = [];
  body.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  // A body's vertices take tens of milliseconds to walk: the walk yields between meshes, so playback keeps its frames.
  const slice = createSlicer();
  for (const object of meshes) {
    // oxlint-disable-next-line no-await-in-loop -- yields between meshes
    await slice();
    const geometry: unknown = object instanceof Mesh ? object.geometry : null;
    if (!(geometry instanceof BufferGeometry)) continue;
    const attributes = geometry.attributes as Record<string, BufferAttribute | InterleavedBufferAttribute | undefined>, position = attributes.position;
    geometry.userData.sharedAsset = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (position) {
      frame.multiplyMatrices(toBody, object.matrixWorld); box.makeEmpty();
      for (let index = 0; index < position.count; index++) box.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(frame));
      object.userData.footprint = [...box.min.toArray(), ...box.max.toArray()];
    }
  }
}

/** Whether the node is drawn from farther than the full level only (`extras.lod`): a cabin, seen up close alone, leaves it out. */
const fartherLevel = (node: Object3D) => ((node.userData.lod as {inM: number} | undefined)?.inM ?? 0) > 0;

/** A cabin part without the levels of it drawn from farther away. */
function closeCopy(node: Object3D): Object3D {
  const copy = node.clone(true), farther: Object3D[] = [];
  copy.traverse(object => { if (object !== copy && fartherLevel(object)) farther.push(object); });
  for (const object of farther) object.removeFromParent();
  return copy;
}

export interface CarTemplates {
  /**
   * The body's parsed exterior, parsed once for every car and loader of the scene: the body's held or pending parse when there
   * is one. Every car draws it (the field's, the lap's, the followed one).
   */
  body(car: LoadedBody): Promise<Group>;
  /**
   * What the driver cameras add to the car closest to them (the lap's, the race's followed one): the interior file's parts, at their
   * full level (every car draws the exterior's parts marked interior itself). Each part, a copy, names the car node it hangs under
   * (`userData.cabinParent`) and is marked interior. The car's exterior and interior parses
   * stay until another car takes the cameras: switching between the lap view and the race, the same car builds without a parse.
   */
  cabin(car: LoadedBody): Promise<Group>;
  /** Keeps the body's exterior parse (parsing it if no parse is held or pending) until `release`: the next car of the body builds from it. */
  hold(car: LoadedBody): void;
  release(car: LoadedBody): void;
}

/**
 * A scene's parsed bodies, shared by the builds that ask for a body while its parse is pending (the cars of a body built together,
 * the lap's car and ghost): each car is a clone of its body's and batches from its vertices. Once the parse settles the next build
 * parses the file again, so a body's vertices stay only as long as its cars need them (their batches hold copies), unless the body
 * is held: the race holds the bodies with cars near the camera, the ones the next followed car most likely drives. The interior
 * file is read only for a cabin.
 */
export function createCarTemplates(): CarTemplates {
  const parses = new Map<string, Promise<Group>>(), held = new Map<string, Promise<Group>>();
  /** The parses of the car the cameras ride on (its exterior, and its interior file's when it has one), by file. */
  let ridden = new Map<string, Promise<Group>>();
  /** The pending parse of the file named `sha256`, shared until it settles. */
  const shared = (sha256: string, bytes: () => Promise<ArrayBuffer | null>): Promise<Group> => {
    let pending = parses.get(sha256);
    if (!pending) {
      pending = bytes().then(async read => {
        if (!read) throw Error(`No body file ${sha256}`);
        const model = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(read, '')).scene;
        await prepareGeometry(model);
        return model;
      });
      parses.set(sha256, pending);
      const failed = pending;
      failed.catch(() => { if (ridden.get(sha256) === failed) ridden.delete(sha256); });
      const settled = () => { if (parses.get(sha256) === pending) parses.delete(sha256); };
      pending.then(settled, settled);
    }
    return pending;
  };
  const parse = (sha256: string, bytes: () => Promise<ArrayBuffer | null>) => ridden.get(sha256) ?? shared(sha256, bytes);
  const body = (car: LoadedBody) => held.get(car.resource.sha256) ?? parse(car.resource.sha256, () => car.file());
  return {
    body,
    async cabin(car) {
      const {interior} = car.resource;
      const exteriorParse = body(car), insideParse = interior ? parse(interior.sha256, () => car.interiorFile()) : null;
      ridden = new Map([[car.resource.sha256, exteriorParse], ...(interior && insideParse ? [[interior.sha256, insideParse] as const] : [])]);
      // The exterior's parts marked interior are on every car already (at their distance levels); the exterior's parse is still read
      // (and held) for the car's next build.
      const [, inside] = await Promise.all([exteriorParse, insideParse]);
      const cabin = new Group(), add = (node: Object3D, parent: string) => {
        const copy = closeCopy(node);
        copy.userData.cabinParent = parent; copy.userData.interior = true;
        cabin.add(copy);
      };
      if (inside) {
        // The interior's parts hang under its chassis node, placed as the body's (both files place the chassis alike, so each part's
        // footprint stands).
        const chassis = inside.getObjectByName(CHASSIS);
        if (!chassis) throw Error(`Car ${car.vehicleId} has no chassis node for its interior`);
        for (const part of chassis.children) add(part, CHASSIS);
      }
      return cabin;
    },
    hold(car) {
      const key = car.resource.sha256;
      if (held.has(key)) return;
      const parse = body(car);
      held.set(key, parse);
      parse.catch(() => { if (held.get(key) === parse) held.delete(key); });
    },
    release: car => { held.delete(car.resource.sha256); },
  };
}
