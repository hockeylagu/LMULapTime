import type { CarBody } from '../../shared/types/scenes/car.js';
import { readPackageFile, registerPackageFile, type PackageFile } from './packageFiles.js';
import { array, count, exactKeys, finite, record, sha256, text, vec3 } from './strict.js';

/** Validated textured car bodies of a package: by upper-case VEH id and by folder, and every file by package-relative path. */
export interface CarStore { rows: Map<string, CarBody>; folders: Map<string, CarBody> }

const MAX_GLB_BYTES = 256_000_000, MAX_TEXTURE_BYTES = 64_000_000, MAX_DESCRIPTOR_BYTES = 8_000_000;
const CORNERS = ['fl', 'fr', 'rl', 'rr'];
const TEXTURE_PATH = /^textures\/[a-f0-9]{64}\.ktx2\.zst$/;
const FOLDER = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
/** Option part nodes: unique GLB node names that three.js keeps as they are (no characters it would sanitise). */
const OPTION_NODE = /^option_[A-Za-z0-9_]+$/;

export const normalizeVehicleId = (id: string): string => id.trim().replace(/\.veh$/i, '').toUpperCase();

/** One body as a vehicle record lists it: `vehicleIds` is the part of the record's ids this body serves. */
function parseBody(value: unknown, what: string): CarBody {
  const row = record(value, what);
  exactKeys(row, ['folder', 'vehicleIds', 'descriptor', 'descriptorSha256', 'asset', 'sha256', 'byteLength', 'triangles', 'vertices', 'textures'], what);
  const folder = text(row.folder, `${what}.folder`, 120);
  if (!FOLDER.test(folder)) throw Error(`${what}: invalid body folder`);
  if (row.descriptor !== `vehicles/bodies/${folder}.json`) throw Error(`${what}: descriptor is not vehicles/bodies/<folder>.json`);
  sha256(row.descriptorSha256, `${what}.descriptorSha256`);
  if (row.asset !== `vehicles/${sha256(row.sha256, `${what}.sha256`)}.glb`) throw Error(`${what}: asset is not the content-named GLB`);
  for (const key of ['byteLength', 'triangles', 'vertices']) if (count(row[key], `${what}.${key}`) === 0) throw Error(`${what}.${key}: must be positive`);
  const ids = array(row.vehicleIds, `${what}.vehicleIds`, 5000).map((id, i) => normalizeVehicleId(text(id, `${what}.vehicleIds[${i}]`, 160)));
  if (!ids.length || ids.some(id => !/^[A-Z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) throw Error(`${what}: invalid vehicle ids`);
  array(row.textures, `${what}.textures`, 4096).forEach((value, i) => {
    const texture = record(value, `${what}.textures[${i}]`);
    exactKeys(texture, ['asset', 'sha256', 'byteLength'], `${what}.textures[${i}]`);
    if (texture.asset !== `vehicles/textures/${sha256(texture.sha256, `${what}.textures[${i}].sha256`)}.ktx2.zst`) throw Error(`${what}.textures[${i}]: asset is not the content-named KTX2`);
    if (count(texture.byteLength, `${what}.textures[${i}].byteLength`) === 0) throw Error(`${what}.textures[${i}]: empty texture`);
  });
  return { ...structuredClone(row), vehicleIds: ids } as unknown as CarBody;
}

/** The descriptor fields the viewer reads, checked against the catalog row (docs/VEHICLE_PIPELINE.md: four wheel rigs, zero rest-vertex error). */
export function validateCarDescriptor(bytes: Buffer, row: CarBody): void {
  const what = `${row.folder} descriptor`, descriptor = record(JSON.parse(bytes.toString('utf8')) as unknown, what);
  exactKeys(descriptor, ['vehicleFolder', 'aliases', 'wheelPivots', 'optionNodes', 'wheelRig', 'appearances', 'materials', 'cameras'], what);
  // A further geometry of an installed folder is `<folder>.<hash>`; the descriptor names the installed folder.
  if (typeof descriptor.vehicleFolder !== 'string' || (row.folder !== descriptor.vehicleFolder && !row.folder.startsWith(`${descriptor.vehicleFolder}.`))) throw Error(`${what}: describes another car`);
  const sorted = (ids: string[]) => JSON.stringify([...ids].sort());
  if (!Array.isArray(descriptor.aliases) || sorted(descriptor.aliases as string[]) !== sorted(row.vehicleIds)) throw Error(`${what}: aliases differ from the vehicle catalog`);
  const pivots = record(descriptor.wheelPivots, `${what}.wheelPivots`);
  exactKeys(pivots, CORNERS, `${what}.wheelPivots`);
  for (const corner of CORNERS) vec3(pivots[corner], `${what}.wheelPivots.${corner}`, 10);
  const optionNodes = (value: unknown, at: string) => {
    const names = array(value, at, 4096).map((name, i) => text(name, `${at}[${i}]`, 200));
    if (names.some((name, i) => !OPTION_NODE.test(name) || (i > 0 && names[i - 1] >= name))) throw Error(`${at}: expected sorted, unique option_ node names`);
    return names;
  };
  const options = new Set(optionNodes(descriptor.optionNodes, `${what}.optionNodes`));
  const rig = record(descriptor.wheelRig, `${what}.wheelRig`);
  if (rig.passed !== true || rig.rigs !== 4 || !(finite(rig.maxRestVertexErrorM, `${what}.wheelRig.maxRestVertexErrorM`) < 0.00001)) throw Error(`${what}: the wheel rig check did not pass`);
  const aliases = array(descriptor.appearances, `${what}.appearances`, 5000).map((value, i) => {
    const appearance = record(value, `${what}.appearances[${i}]`);
    const alias = text(appearance.alias, `${what}.appearances[${i}].alias`, 160);
    if (typeof appearance.albedo !== 'string' || !TEXTURE_PATH.test(appearance.albedo)) throw Error(`${what}.appearances[${i}]: invalid albedo`);
    const paint = record(appearance.paint, `${what}.appearances[${i}].paint`);
    text(paint.kind, `${what}.appearances[${i}].paint.kind`); record(paint.maps, `${what}.appearances[${i}].paint.maps`);
    if (optionNodes(appearance.optionNodes, `${what}.appearances[${i}].optionNodes`).some(name => !options.has(name))) {
      throw Error(`${what}.appearances[${i}].optionNodes: names a node the body does not list`);
    }
    if (appearance.materialTextures !== undefined) {
      for (const path of Object.values(record(appearance.materialTextures, `${what}.appearances[${i}].materialTextures`))) {
        if (typeof path !== 'string' || !TEXTURE_PATH.test(path)) throw Error(`${what}.appearances[${i}]: invalid livery texture`);
      }
    }
    return alias;
  });
  if (sorted(aliases) !== sorted(row.vehicleIds)) throw Error(`${what}: appearances do not cover exactly the body's vehicle ids`);
  array(descriptor.materials, `${what}.materials`, 4096).forEach((value, i) => {
    const material = record(value, `${what}.materials[${i}]`);
    text(material.id, `${what}.materials[${i}].id`, 200); text(material.name, `${what}.materials[${i}].name`, 200);
    if (typeof material.paint !== 'boolean') throw Error(`${what}.materials[${i}].paint: expected a boolean`);
    if (!material.paint) {
      const surface = record(material.surface, `${what}.materials[${i}].surface`);
      text(surface.kind, `${what}.materials[${i}].surface.kind`); record(surface.maps, `${what}.materials[${i}].surface.maps`);
    }
  });
  const cameras = new Set(array(record(descriptor.cameras, `${what}.cameras`).list, `${what}.cameras.list`, 64).map((value, i) => {
    const camera = record(value, `${what}.cameras.list[${i}]`), at = `${what}.cameras.list[${i}]`;
    vec3(camera.position, `${at}.position`, 10); vec3(camera.orientation, `${at}.orientation`, 10);
    const fov = array(camera.fov, `${at}.fov`, 2).map(degrees => finite(degrees, `${at}.fov`));
    const clip = array(camera.clipPlanes, `${at}.clipPlanes`, 2).map(metres => finite(metres, `${at}.clipPlanes`));
    if (fov.length !== 2 || fov.some(degrees => degrees <= 5 || degrees >= 175)) throw Error(`${at}.fov: expected two angles in degrees`);
    if (clip.length !== 2 || !(clip[0] > 0 && clip[1] > clip[0])) throw Error(`${at}.clipPlanes: expected near < far`);
    if (camera.cockpitView !== 'in' && camera.cockpitView !== 'out') throw Error(`${at}.cockpitView: expected in or out`);
    return text(camera.name, `${at}.name`, 64);
  }));
  for (const role of ['cockpit', 'hood', 'roof']) if (!cameras.has(role)) throw Error(`${what}: no ${role} camera`);
  const declared = new Set(row.textures.map(texture => texture.asset));
  for (const match of bytes.toString('utf8').match(/textures\/[0-9a-f]{64}\.ktx2\.zst/g) ?? []) if (!declared.has(`vehicles/${match}`)) throw Error(`${what}: uses undeclared texture ${match}`);
}

/**
 * Loads the bodies of the vehicle records (the raw `vehicles` rows of the catalog, already validated as records).
 * A body listed under several records (one car folder serving two models) loads once, with the union of its ids; every record id
 * belongs to exactly one body of its record, and no id to two bodies.
 */
export function loadCarPackage(root: string, vehicles: unknown[]): CarStore {
  const rows = new Map<string, CarBody>(), folders = new Map<string, CarBody>(), files = new Map<string, PackageFile>();
  const register = (asset: string, hash: string, byteLength: number | null, max: number) => {
    const known = files.get(asset);
    if (known) {
      if (known.sha256 !== hash || (byteLength !== null && known.byteLength !== byteLength)) throw Error(`Conflicting car file ${asset}`);
      return;
    }
    files.set(asset, registerPackageFile(root, asset, hash, byteLength, max));
  };
  vehicles.forEach((value, i) => {
    const what = `vehicles[${i}]`, vehicle = record(value, what);
    const recordIds = array(vehicle.vehicleIds, `${what}.vehicleIds`, 5000).map(id => normalizeVehicleId(text(id, `${what}.vehicleIds`, 160)));
    const bodies = array(vehicle.bodies, `${what}.bodies`, 256).map((body, j) => parseBody(body, `${what}.bodies[${j}]`));
    if (!bodies.length) throw Error(`${what}: no car bodies`);
    const listed = bodies.flatMap(body => body.vehicleIds);
    if (listed.length !== recordIds.length || new Set(listed).size !== listed.length || listed.some(id => !recordIds.includes(id))) throw Error(`${what}: bodies do not partition the vehicle ids`);
    for (const body of bodies) {
      const known = folders.get(body.folder);
      if (!known) { folders.set(body.folder, body); continue; }
      const same = (a: CarBody, b: CarBody) => JSON.stringify({ ...a, vehicleIds: 0 }) === JSON.stringify({ ...b, vehicleIds: 0 });
      if (!same(known, body)) throw Error(`${body.folder}: listed with different files`);
      known.vehicleIds.push(...body.vehicleIds);
    }
  });
  for (const body of folders.values()) {
    for (const id of body.vehicleIds) {
      if (rows.has(id)) throw Error(`${id}: vehicle id served by two car bodies`);
      rows.set(id, body);
    }
    register(body.asset, body.sha256, body.byteLength, MAX_GLB_BYTES);
    for (const texture of body.textures) register(texture.asset, texture.sha256, texture.byteLength, MAX_TEXTURE_BYTES);
    register(body.descriptor, body.descriptorSha256, null, MAX_DESCRIPTOR_BYTES);
    validateCarDescriptor(readPackageFile(root, files.get(body.descriptor)!), body);
  }
  return { rows, folders };
}
