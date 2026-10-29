import type { TrackBoundaryGeometry, TrackMapDisplay } from './trackGeometry.js';

/** Base physics defaults, not the setup or upgrade selected for a recorded lap. */
export interface VehicleHandlingData {
  wheelbaseM?: number;
  steeringRatio?: number;
  defaultSteeringWheelRangeDeg?: number;
  defaultSteeringLockDeg?: number;
}

export interface VehicleHandlingCalibration {
  wheelbaseM: number;
  steeringRatio: number;
  steeringWheelRangeDeg: number;
  wheelbaseSource: 'plugin' | 'fallback';
  steeringSource: 'plugin-default' | 'fallback';
}

export interface VehicleDataRecord {
  id: string;
  model: string;
  carClass: string;
  vehicleIds: string[];
  dimensions?: { lengthM: number; widthM: number; heightM?: number };
  handling?: VehicleHandlingData;
  /** Metres in vehicle-local X/Z; native forward is -Z. Origin is never recentered. */
  outlineXZ?: Array<[number, number]>;
  /** Translation from mesh-local to replay pose origin, established by the data provider. */
  replayOriginOffsetXZ?: [number, number];
  /** Hybrid deployment settings in kW as the game's MFD labels them, ascending. */
  deploymentKw?: number[];
}
export interface VehicleLogosCatalog {
  schemaVersion: 1;
  logos: Record<string, string>;
}
export interface DataPluginManifest {
  schemaVersion: 1 | 2;
  id: string;
  version: string;
  tracks?: { catalog: string };
  vehicles?: { catalog: string; logos?: string };
  scenes?: { catalog: string };
  vehicleMeshes?: { catalog: string };
}
export interface DataPluginStatus {
  state: 'absent' | 'invalid' | 'ready';
  revision: string;
  tracks: boolean;
  vehicles: boolean;
  logos?: boolean;
  scenes?: boolean;
  vehicleMeshes?: boolean;
}
export interface PluginTrackResource {
  packageRevision: string;
  geometry: TrackBoundaryGeometry;
  display: TrackMapDisplay | null;
}
