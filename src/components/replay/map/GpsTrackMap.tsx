import React from 'react';
import { GpsTrackMapScene } from './scene/GpsTrackMapScene.js';
import type { GpsTrackMapProps } from './gpsTrackMapTypes.js';

export type {
  GpsTrackMapCorner,
  GpsTrackMapPedalMarker,
  GpsTrackMapProps,
} from './gpsTrackMapTypes.js';

export const GpsTrackMap: React.FC<GpsTrackMapProps> = props => <GpsTrackMapScene {...props} />;
