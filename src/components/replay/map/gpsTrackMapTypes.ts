import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { MapColorMode } from './replayMapUtils.js';
import { TrackBoundaryGeometry } from './useTrackBoundaryGeometry.js';
import type { TrackMapDisplay } from '../../../../shared/types/trackGeometry.js';

export interface GpsTrackMapCorner {
  cornerNumber: number;
  minDistM: number;
}

export interface GpsTrackMapPedalMarker {
  cornerNumber: number;
  distM: number;
  kind: 'brake' | 'throttle';
  isBaseline?: boolean;
}

export interface GpsTrackMapProps {
  points: ReplayTrajectoryPoint[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; spanX: number; spanZ: number };
  currentIndex: number;
  onSelectIndex?: (index: number) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  colorBy?: MapColorMode;
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
  primaryVehicleData?: import('../../../../shared/types/dataPlugin.js').VehicleDataRecord;
  baselineVehicleData?: import('../../../../shared/types/dataPlugin.js').VehicleDataRecord;
  primaryCarClass?: string;
  baselineCarClass?: string;
  corners?: GpsTrackMapCorner[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  primaryOpacity?: number;
  baselineOpacity?: number;
  pedalMarkers?: GpsTrackMapPedalMarker[];
  showPedalMarkers?: boolean;
  onChangeColorBy?: (mode: MapColorMode) => void;
  onTogglePedalMarkers?: () => void;
  fadedLine?: 'none' | 'primary' | 'baseline';
  onToggleFadedLine?: (line: 'primary' | 'baseline') => void;
  showFrictionCircle?: boolean;
  onToggleFrictionCircle?: () => void;
  showMinimap?: boolean;
  showLegend?: boolean;
  showControls?: boolean;
  controlsOrientation?: 'vertical' | 'horizontal';
  highlightDistRange?: { startDistM: number; endDistM: number } | null;
  dimNonSelectedTrack?: boolean;
  showCornerFlags?: boolean;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
  dataPluginRevision?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  mapDisplay?: TrackMapDisplay | null;
  // Length of the track the trajectories' stations are measured on (trajectory.trackLengthM):
  // the map aligns laps with it exactly as the telemetry channels and corner analysis do.
  trackLengthM?: number;
}

export type GpsTrackMapSceneProps = GpsTrackMapProps;
