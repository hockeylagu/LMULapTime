import React from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { MapColorMode } from './replayMapUtils.js';
import { GpsTrackMapScene } from './GpsTrackMapScene.js';

export interface GpsTrackMapCorner {
  cornerNumber: number;
  minDistM: number;
}

export interface GpsTrackMapPedalMarker {
  cornerNumber: number;
  distM: number;
  kind: 'brake' | 'throttle';
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
}

export const GpsTrackMap: React.FC<GpsTrackMapProps> = props => <GpsTrackMapScene {...props} />;
