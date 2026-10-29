import type { VehicleDataRecord } from '../../shared/types/dataPlugin.js';
import type { VehicleMesh } from '../../shared/types/scenes/vehicleMesh.js';
import { registerMeshAsset, type RegisteredMesh } from './meshAsset.js';

export function loadVehicleMeshPackage(root: string, catalog: unknown, vehicles: VehicleDataRecord[]): Map<string, RegisteredMesh<VehicleMesh>> {
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 128) throw Error('Invalid vehicle mesh catalog');
  const ids = new Set(vehicles.map(vehicle => vehicle.id)), result = new Map<string, RegisteredMesh<VehicleMesh>>();
  const fields = new Set(['schemaVersion', 'vehicleRecordId', 'coordinates', 'representation', 'originCalibration', 'parts', 'revision', 'asset', 'sha256', 'byteLength', 'bounds', 'triangles']);
  const parts = new Set(['body', 'chassis', 'exterior', 'wing', 'glass', 'tyres', 'rims']);
  let bytes = 0;
  for (const value of catalog as unknown[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid vehicle mesh');
    const mesh = value as VehicleMesh;
    if (Object.keys(mesh).some(key => !fields.has(key)) || mesh.schemaVersion !== 1 || !ids.has(mesh.vehicleRecordId) || result.has(mesh.vehicleRecordId) || mesh.coordinates !== 'vehicle-local-xyz-metres-forward-minus-z' || mesh.representation !== 'render' || mesh.originCalibration !== 'unverified' || mesh.revision !== `mesh-${mesh.sha256}` || !Array.isArray(mesh.parts) || !mesh.parts.includes('body') || mesh.parts.some(part => !parts.has(part)) || new Set(mesh.parts).size !== mesh.parts.length) throw Error('Invalid vehicle mesh binding');
    const registered = registerMeshAsset(root, mesh, true);
    const size = mesh.bounds.max.map((n, i) => n - mesh.bounds.min[i]);
    if (size[0] < 1 || size[0] > 3.5 || size[1] < 0.3 || size[1] > 4 || size[2] < 3 || size[2] > 7 || [...mesh.bounds.min, ...mesh.bounds.max].some(n => Math.abs(n) > 10)) throw Error('Invalid vehicle mesh dimensions');
    bytes += mesh.byteLength;
    if (bytes > 256_000_000) throw Error('Vehicle mesh budget exceeded');
    result.set(mesh.vehicleRecordId, registered);
  }
  return result;
}
