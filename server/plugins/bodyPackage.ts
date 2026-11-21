import { normalizeVehicleId, type VehicleBody } from '../../shared/packageContract/index.js';

/** Validated 3D vehicle bodies of a package: by upper-case VEH id and by folder. */
export interface BodyStore { rows: Map<string, VehicleBody>; folders: Map<string, VehicleBody> }

/**
 * Indexes the bodies of the vehicle catalog (`parseVehicleCatalog` has checked their rows and that they serve every vehicle id exactly once). The
 * descriptor, GLB, texture and start files are pregenerated, checked by the pipeline before it publishes, and served as is: startup does not read them.
 */
export function loadBodyPackage(bodies: readonly VehicleBody[]): BodyStore {
  const rows = new Map<string, VehicleBody>(), folders = new Map<string, VehicleBody>();
  for (const body of bodies) {
    folders.set(body.folder, body);
    for (const id of body.vehicleIds) rows.set(normalizeVehicleId(id), body);
  }
  return { rows, folders };
}
