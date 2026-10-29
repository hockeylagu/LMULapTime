import type { MeshAsset } from './meshAsset.js';

/** Visible game model, bound to one resolved vehicle record, not a class-wide approximation. */
export interface VehicleMesh extends MeshAsset {
  schemaVersion: 1;
  vehicleRecordId: string;
  coordinates: 'vehicle-local-xyz-metres-forward-minus-z';
  representation: 'render';
  originCalibration: 'unverified';
  parts: Array<'body' | 'chassis' | 'exterior' | 'wing' | 'glass' | 'tyres' | 'rims'>;
}

export interface VehicleMeshResource extends Omit<VehicleMesh, 'asset'> {
  packageRevision: string;
}
