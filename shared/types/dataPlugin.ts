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
  /** `setup`: the run's own steering lock, read from its telemetry recording (`SetupSteeringCalibration`). */
  steeringSource: 'setup' | 'plugin-default' | 'fallback';
}

/** A run's steering lock from its car setup: the steering wheel's rotation (lock to lock) and the ratio it gives. */
export interface SetupSteeringCalibration {
  steeringWheelRangeDeg: number;
  steeringRatio: number;
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
