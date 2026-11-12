import type { VehicleHandlingData, VehicleRecord } from '../packageContract/index.js';
import type { TrackBoundaryGeometry } from './trackGeometry.js';

// The vehicle record is the package's (docs/PACKAGE_FORMAT.md, Vehicles).
export type { VehicleHandlingData };
export type VehicleDataRecord = VehicleRecord;

export interface VehicleHandlingCalibration {
  wheelbaseM: number;
  steeringRatio: number;
  steeringWheelRangeDeg: number;
  wheelbaseSource: 'plugin' | 'fallback';
  steeringSource: 'plugin-default' | 'fallback';
}

export interface DataPluginCounts {
  tracks?: number;
  vehicles?: number;
  logos?: number;
  scenery?: number;
  bodies?: number;
}

export interface DataPluginStatus {
  state: 'absent' | 'invalid' | 'ready';
  revision: string;
  tracks: boolean;
  vehicles: boolean;
  logos?: boolean;
  scenery?: boolean;
  bodies?: boolean;
  packageId?: string;
  packageVersion?: string;
  counts?: DataPluginCounts;
}
export interface PluginTrackResource {
  packageRevision: string;
  /** Includes the map `surfaces` and `brakeMarkers`. */
  geometry: TrackBoundaryGeometry;
}
