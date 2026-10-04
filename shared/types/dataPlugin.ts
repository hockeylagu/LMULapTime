import type { TrackBoundaryGeometry, TrackMapDisplay } from './trackGeometry.js';

export interface VehicleDataRecord {
  id: string;
  model: string;
  carClass: string;
  vehicleIds: string[];
  dimensions?: { lengthM: number; widthM: number; heightM?: number };
  /** Metres in vehicle-local X/Z; native forward is -Z. Origin is never recentered. */
  outlineXZ?: Array<[number, number]>;
  /** Translation from mesh-local to replay pose origin, established by the data provider. */
  replayOriginOffsetXZ?: [number, number];
}
export interface DataPluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  tracks?: { catalog: string };
  vehicles?: { catalog: string };
}
export interface DataPluginStatus {
  state: 'absent' | 'invalid' | 'ready';
  revision: string;
  tracks: boolean;
  vehicles: boolean;
}
export interface PluginTrackResource {
  packageRevision: string;
  geometry: TrackBoundaryGeometry;
  display: TrackMapDisplay | null;
}
