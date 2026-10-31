export interface VehicleLiveryMetadata {
  liveryKey: string;
  vehicleRecordId: string;
  vehicleIds: string[];
  revision: string;
  asset: string;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
}

export interface VehicleLiveryResource {
  liveryKey: string;
  vehicleRecordId: string;
  vehicleIds: string[];
  revision: string;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  packageRevision: string;
}
