import { bodyDescriptorPath, bodyGlbPath, bodyTexturePath, normalizeVehicleId, parseBodyDescriptor, type VehicleBody } from '../../shared/packageContract/index.js';
import { readPackageFile, registerPackageFile, type PackageFile } from './packageFiles.js';

/** Validated 3D vehicle bodies of a package: by upper-case VEH id and by folder. */
export interface BodyStore { rows: Map<string, VehicleBody>; folders: Map<string, VehicleBody> }

const MAX_GLB_BYTES = 256_000_000, MAX_TEXTURE_BYTES = 64_000_000, MAX_DESCRIPTOR_BYTES = 8_000_000;

/**
 * Loads the bodies of the vehicle catalog (`parseVehicleCatalog` has checked their rows and that they serve every vehicle id exactly once): registers each
 * GLB, texture and start file at its derived path (existence and size) and reads the descriptor, which `parseBodyDescriptor` checks against the body's row.
 */
export function loadBodyPackage(root: string, bodies: readonly VehicleBody[]): BodyStore {
  const rows = new Map<string, VehicleBody>(), folders = new Map<string, VehicleBody>(), files = new Map<string, PackageFile>();
  const register = (relative: string, hash: string, byteLength: number | null, max: number) => {
    const known = files.get(relative);
    if (known) {
      if (known.sha256 !== hash || (byteLength !== null && known.byteLength !== byteLength)) throw Error(`Conflicting body file ${relative}`);
      return known;
    }
    const file = registerPackageFile(root, relative, hash, byteLength, max);
    files.set(relative, file);
    return file;
  };
  for (const body of bodies) {
    folders.set(body.folder, body);
    for (const id of body.vehicleIds) rows.set(normalizeVehicleId(id), body);
    register(bodyGlbPath(body.sha256), body.sha256, body.byteLength, MAX_GLB_BYTES);
    if (body.interior) register(bodyGlbPath(body.interior.sha256), body.interior.sha256, body.interior.byteLength, MAX_GLB_BYTES);
    for (const texture of body.textures) {
      register(bodyTexturePath(texture.sha256), texture.sha256, texture.byteLength, MAX_TEXTURE_BYTES);
      if (texture.start) register(bodyTexturePath(texture.start.sha256), texture.start.sha256, texture.start.byteLength, MAX_TEXTURE_BYTES);
    }
    const descriptor = register(bodyDescriptorPath(body.folder), body.descriptorSha256, null, MAX_DESCRIPTOR_BYTES);
    parseBodyDescriptor(JSON.parse(readPackageFile(root, descriptor).toString('utf8')) as unknown, body);
  }
  return { rows, folders };
}
