export interface VehicleWheelTextureMetadata {
  asset: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
}

export interface VehicleWheelRecord {
  vehicleRecordId: string;
  rim: VehicleWheelTextureMetadata;
  tyre: VehicleWheelTextureMetadata;
}

export interface VehicleWheelTextureResource {
  revision: string;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
}

export interface VehicleWheelResource {
  vehicleRecordId: string;
  rim: VehicleWheelTextureResource;
  tyre: VehicleWheelTextureResource;
  packageRevision: string;
}
