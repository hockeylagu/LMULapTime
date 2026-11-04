import type { CarCatalogRow } from '../../shared/types/scenes/car.js';
import { readPackageFile, registerPackageFile, type PackageFile } from './packageFiles.js';
import { array, count, exactKeys, finite, record, sha256, text, vec3 } from './strict.js';

/** Validated textured cars of a package: catalog rows by upper-case VEH id and by folder, and every file by package-relative path. */
export interface CarStore { rows: Map<string, CarCatalogRow>; folders: Map<string, CarCatalogRow>; files: Map<string, PackageFile> }

const MAX_GLB_BYTES = 256_000_000, MAX_TEXTURE_BYTES = 64_000_000, MAX_DESCRIPTOR_BYTES = 8_000_000;
const CORNERS = ['fl', 'fr', 'rl', 'rr'];
const TEXTURE_PATH = /^textures\/[a-f0-9]{64}\.ktx2$/;

export const normalizeVehicleId = (id: string): string => id.trim().replace(/\.veh$/i, '').toUpperCase();

function parseRow(value: unknown, what: string): CarCatalogRow {
  const row = record(value, what);
  exactKeys(row, ['schemaVersion', 'vehicleFolder', 'vehicleIds', 'descriptor', 'descriptorSha256', 'asset', 'sha256', 'byteLength', 'triangles', 'vertices', 'textures'], what);
  if (row.schemaVersion !== 1) throw Error(`${what}: unsupported car row version`);
  const folder = text(row.vehicleFolder, `${what}.vehicleFolder`, 120);
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(folder)) throw Error(`${what}: invalid vehicle folder`);
  if (row.descriptor !== `cars/${folder}.json`) throw Error(`${what}: descriptor is not cars/<vehicleFolder>.json`);
  sha256(row.descriptorSha256, `${what}.descriptorSha256`);
  if (row.asset !== `cars/${sha256(row.sha256, `${what}.sha256`)}.glb`) throw Error(`${what}: asset is not the content-named GLB`);
  for (const key of ['byteLength', 'triangles', 'vertices']) if (count(row[key], `${what}.${key}`) === 0) throw Error(`${what}.${key}: must be positive`);
  const ids = array(row.vehicleIds, `${what}.vehicleIds`, 5000).map((id, i) => text(id, `${what}.vehicleIds[${i}]`, 160));
  if (!ids.length || ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) throw Error(`${what}: invalid vehicle ids`);
  array(row.textures, `${what}.textures`, 4096).forEach((value, i) => {
    const texture = record(value, `${what}.textures[${i}]`);
    exactKeys(texture, ['asset', 'sha256', 'byteLength'], `${what}.textures[${i}]`);
    if (texture.asset !== `cars/textures/${sha256(texture.sha256, `${what}.textures[${i}].sha256`)}.ktx2`) throw Error(`${what}.textures[${i}]: asset is not the content-named KTX2`);
    if (count(texture.byteLength, `${what}.textures[${i}].byteLength`) === 0) throw Error(`${what}.textures[${i}]: empty texture`);
  });
  return structuredClone(row) as unknown as CarCatalogRow;
}

/** The descriptor fields the viewer reads, checked against the catalog row (docs/VEHICLE_PIPELINE.md: four wheel rigs, zero rest-vertex error). */
export function validateCarDescriptor(bytes: Buffer, row: CarCatalogRow): void {
  const what = `${row.vehicleFolder} descriptor`, descriptor = record(JSON.parse(bytes.toString('utf8')) as unknown, what);
  exactKeys(descriptor, ['schemaVersion', 'vehicleFolder', 'aliases', 'wheelPivots', 'wheelRig', 'appearances', 'materials', 'cameras'], what);
  if (descriptor.schemaVersion !== 1 || descriptor.vehicleFolder !== row.vehicleFolder) throw Error(`${what}: describes another car`);
  if (JSON.stringify(descriptor.aliases) !== JSON.stringify(row.vehicleIds)) throw Error(`${what}: aliases differ from the catalog row`);
  const pivots = record(descriptor.wheelPivots, `${what}.wheelPivots`);
  exactKeys(pivots, CORNERS, `${what}.wheelPivots`);
  for (const corner of CORNERS) vec3(pivots[corner], `${what}.wheelPivots.${corner}`, 10);
  const rig = record(descriptor.wheelRig, `${what}.wheelRig`);
  if (rig.passed !== true || rig.rigs !== 4 || !(finite(rig.maxRestVertexErrorM, `${what}.wheelRig.maxRestVertexErrorM`) < 0.00001)) throw Error(`${what}: the wheel rig check did not pass`);
  const aliases = array(descriptor.appearances, `${what}.appearances`, 5000).map((value, i) => {
    const appearance = record(value, `${what}.appearances[${i}]`);
    const alias = text(appearance.alias, `${what}.appearances[${i}].alias`, 160);
    if (typeof appearance.albedo !== 'string' || !TEXTURE_PATH.test(appearance.albedo)) throw Error(`${what}.appearances[${i}]: invalid albedo`);
    const paint = record(appearance.paint, `${what}.appearances[${i}].paint`);
    text(paint.kind, `${what}.appearances[${i}].paint.kind`); record(paint.maps, `${what}.appearances[${i}].paint.maps`);
    if (appearance.materialTextures !== undefined) {
      for (const path of Object.values(record(appearance.materialTextures, `${what}.appearances[${i}].materialTextures`))) {
        if (typeof path !== 'string' || !TEXTURE_PATH.test(path)) throw Error(`${what}.appearances[${i}]: invalid livery texture`);
      }
    }
    return alias;
  });
  if (JSON.stringify([...aliases].sort()) !== JSON.stringify([...row.vehicleIds].sort())) throw Error(`${what}: appearances do not cover exactly the catalog aliases`);
  array(descriptor.materials, `${what}.materials`, 4096).forEach((value, i) => {
    const material = record(value, `${what}.materials[${i}]`);
    text(material.id, `${what}.materials[${i}].id`, 200); text(material.name, `${what}.materials[${i}].name`, 200);
    if (typeof material.paint !== 'boolean') throw Error(`${what}.materials[${i}].paint: expected a boolean`);
    if (!material.paint) {
      const surface = record(material.surface, `${what}.materials[${i}].surface`);
      text(surface.kind, `${what}.materials[${i}].surface.kind`); record(surface.maps, `${what}.materials[${i}].surface.maps`);
    }
  });
  const declared = new Set(row.textures.map(texture => texture.asset));
  for (const match of bytes.toString('utf8').match(/textures\/[0-9a-f]{64}\.ktx2/g) ?? []) if (!declared.has(`cars/${match}`)) throw Error(`${what}: uses undeclared texture ${match}`);
}

/** `knownVehicleIds` (upper-case catalog aliases) is null when the package has no vehicle catalog to bind to. */
export function loadCarPackage(root: string, catalog: unknown, knownVehicleIds: Set<string> | null): CarStore {
  const rows = new Map<string, CarCatalogRow>(), folders = new Map<string, CarCatalogRow>(), files = new Map<string, PackageFile>();
  const register = (asset: string, hash: string, byteLength: number | null, max: number) => {
    const known = files.get(asset);
    if (known) {
      if (known.sha256 !== hash || (byteLength !== null && known.byteLength !== byteLength)) throw Error(`Conflicting car file ${asset}`);
      return;
    }
    files.set(asset, registerPackageFile(root, asset, hash, byteLength, max));
  };
  const list = array(catalog, 'car catalog', 256);
  if (!list.length) throw Error('car catalog: empty');
  list.forEach((value, i) => {
    const row = parseRow(value, `cars[${i}]`);
    if (folders.has(row.vehicleFolder)) throw Error(`${row.vehicleFolder}: car listed twice`);
    for (const id of row.vehicleIds.map(normalizeVehicleId)) {
      if (rows.has(id)) throw Error(`${id}: vehicle id served by two cars`);
      if (knownVehicleIds && !knownVehicleIds.has(id)) throw Error(`${row.vehicleFolder}: ${id} is not in the vehicle catalog`);
      rows.set(id, row);
    }
    register(row.asset, row.sha256, row.byteLength, MAX_GLB_BYTES);
    for (const texture of row.textures) register(texture.asset, texture.sha256, texture.byteLength, MAX_TEXTURE_BYTES);
    register(row.descriptor, row.descriptorSha256, null, MAX_DESCRIPTOR_BYTES);
    validateCarDescriptor(readPackageFile(root, files.get(row.descriptor)!), row);
    folders.set(row.vehicleFolder, row);
  });
  return { rows, folders, files };
}
