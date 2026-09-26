import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { MapColorMode } from './replayMapUtils.js';
import { TrackBoundaryGeometry } from './useTrackBoundaryGeometry.js';

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
  colorBy?: MapColorMode;
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
  corners?: GpsTrackMapCorner[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  primaryOpacity?: number;
  baselineOpacity?: number;
  pedalMarkers?: GpsTrackMapPedalMarker[];
  showPedalMarkers?: boolean;
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
  replayName?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
}

export type GpsTrackMapSceneProps = GpsTrackMapProps;
