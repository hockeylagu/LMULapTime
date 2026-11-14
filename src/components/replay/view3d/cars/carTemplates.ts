import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Box3, BufferGeometry, Matrix4, Mesh, Vector3, type BufferAttribute, type Group, type InterleavedBufferAttribute, type Object3D } from 'three';
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

export interface CarTemplates {
  /** The body's parsed model (its interior joined under the chassis), parsed once for every car and loader of the scene. */
  body(car: LoadedBody): Promise<Group>;
  /** Keeps the body's parse (parsing it if no parse is held or pending) until `release`: the next car of the body builds from it. */
  hold(car: LoadedBody): void;
  release(car: LoadedBody): void;
}

/**
 * A scene's parsed bodies, shared by the builds that ask for a body while its parse is pending (the cars of a body built together,
 * the lap's car and ghost): each car is a clone of its body's and batches from its vertices. Once the parse settles the next build
 * parses the file again, so a body's vertices stay only as long as its cars need them (their batches hold copies), unless the body
 * is held: the race holds the bodies with cars near the camera, the ones the next followed car most likely drives.
 */
export function createCarTemplates(): CarTemplates {
  const templates = new Map<string, Promise<Group>>(), held = new Map<string, Promise<Group>>();
  const keyOf = (car: LoadedBody) => `${car.resource.sha256}:${car.resource.interior?.sha256 ?? ''}`;
  const body = (car: LoadedBody): Promise<Group> => {
    const key = keyOf(car);
    let pending = templates.get(key) ?? held.get(key);
    if (!pending) {
      const parse = (bytes: ArrayBuffer) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '').then(result => result.scene);
      pending = car.files().then(({bytes, interiorBytes}) => Promise.all([parse(bytes), interiorBytes ? parse(interiorBytes) : null])).then(async ([model, interior]) => {
        // The interior's parts hang under its chassis node and join the body's: one model, whose driver-camera parts the
        // cockpit view switches.
        if (interior) {
          const chassis = model.getObjectByName(CHASSIS), parts = interior.getObjectByName(CHASSIS);
          if (!chassis || !parts) throw Error(`Car ${car.vehicleId} has no chassis node for its interior`);
          chassis.add(...parts.children);
        }
        await prepareGeometry(model);
        return model;
      });
      templates.set(key, pending);
      const settled = () => { if (templates.get(key) === pending) templates.delete(key); };
      pending.then(settled, settled);
    }
    return pending;
  };
  return {
    body,
    hold(car) {
      const key = keyOf(car);
      if (held.has(key)) return;
      const parse = body(car);
      held.set(key, parse);
      parse.catch(() => { if (held.get(key) === parse) held.delete(key); });
    },
    release: car => { held.delete(keyOf(car)); },
  };
}
