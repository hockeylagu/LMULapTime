import React, { useMemo } from 'react';
import { GpsScenePedalMarker } from './GpsScenePedalMarker.js';
import { CHART_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';

export interface CornerMarkerPoint {
  cornerNumber: number;
  sx: number;
  sy: number;
  idx: number;
  actualSx: number;
  actualSy: number;
}

export type SceneCornerMarker = CornerMarkerPoint;

export interface PedalMarkerPoint {
  cornerNumber: number;
  distM?: number;
  kind: 'brake' | 'throttle';
  sx: number;
  sy: number;
  nx?: number;
  ny?: number;
  isBaseline?: boolean;
  isStaggered?: boolean;
}

export interface GpsSceneMarkersProps {
  cornerMarkers?: CornerMarkerPoint[];
  markers?: SceneCornerMarker[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  onSelectIndex?: (index: number) => void;
  pedalMarkers: PedalMarkerPoint[];
  markerScale?: number;
  zoomLevel?: number;
  primaryOpacity?: number;
  baselineOpacity?: number;
  dimNonSelectedTrack?: boolean;
  showCornerFlags?: boolean;
}

export const GpsSceneMarkers: React.FC<GpsSceneMarkersProps> = React.memo(({
  cornerMarkers,
  markers,
  selectedCornerNumber,
  onSelectCornerNumber,
  onSelectIndex,
  pedalMarkers,
  markerScale = 1,
  zoomLevel,
  primaryOpacity = 1,
  baselineOpacity = 1,
  dimNonSelectedTrack = false,
  showCornerFlags = true,
}) => {
  const cornersToRender = useMemo(() => {
    return cornerMarkers ?? markers ?? [];
  }, [cornerMarkers, markers]);

  const cornerPositions = useMemo(() => {
    const effectiveZoom = zoomLevel ?? (markerScale > 0 ? 1 / markerScale : 1);
    const hasSelection = selectedCornerNumber != null;
    return cornersToRender.map(m => {
      const isSelected = m.cornerNumber === selectedCornerNumber;
      const isDimmed = hasSelection && !isSelected;
      const dirX = m.sx - m.actualSx;
      const dirY = m.sy - m.actualSy;
      const distWorld = Math.hypot(dirX, dirY) || 1;
      const uX = dirX / distWorld;
      const uY = dirY / distWorld;

      // When unzoomed, keep exact world positions
      if (effectiveZoom <= 1.01 || distWorld <= 1e-4) {
        return {
          ...m,
          isSelected,
          isDimmed,
          posX: m.sx,
          posY: m.sy,
        };
      }

      // When zoomed in, keep badge at a comfortable screen distance (50-56px) rather than drifting hundreds of pixels away
      const maxScreenDist = (isSelected ? 56 : 50) + Math.sqrt(effectiveZoom) * 2;
      const targetScreenDist = Math.min(distWorld * effectiveZoom, maxScreenDist);
      const dSvg = targetScreenDist / effectiveZoom;

      return {
        ...m,
        isSelected,
        isDimmed,
        posX: Number((m.actualSx + uX * dSvg).toFixed(1)),
        posY: Number((m.actualSy + uY * dSvg).toFixed(1)),
      };
    });
  }, [cornersToRender, selectedCornerNumber, zoomLevel, markerScale]);

  const visiblePedalMarkers = useMemo(() => {
    if (!dimNonSelectedTrack || selectedCornerNumber == null) return pedalMarkers;
    return pedalMarkers.filter(p => p.cornerNumber === selectedCornerNumber);
  }, [pedalMarkers, dimNonSelectedTrack, selectedCornerNumber]);

  return (
    <>
      {!showCornerFlags && cornerPositions.map(m => {
        const dirX = m.sx - m.actualSx;
        const dirY = m.sy - m.actualSy;
        const distWorld = Math.hypot(dirX, dirY);
        const uX = distWorld > 1e-4 ? dirX / distWorld : 0;
        const uY = distWorld > 1e-4 ? dirY / distWorld : -1;
        const labelDist = 22 * markerScale;
        const labelX = Number((m.actualSx + uX * labelDist).toFixed(1));
        const labelY = Number((m.actualSy + uY * labelDist).toFixed(1));

        return (
          <g
            key={`apex-${m.cornerNumber}`}
            data-testid={`apex-marker-${m.cornerNumber}`}
            opacity={m.isDimmed ? 0.6 : 1}
            className={`cursor-pointer group transition-opacity duration-150 ${m.isDimmed ? 'hover:opacity-100' : ''}`}
            onClick={e => {
              e.stopPropagation();
              onSelectCornerNumber?.(m.cornerNumber);
              onSelectIndex?.(m.idx);
            }}
          >
            <line x1={m.actualSx} y1={m.actualSy} x2={labelX} y2={labelY} stroke={MAP_COLORS.apex} strokeWidth="1.2" strokeDasharray="2.5 2" opacity={m.isDimmed ? 0.5 : 0.8} vectorEffect="non-scaling-stroke" />
            {/* Zoom-agnostic apex red dot anchored at trajectory point */}
            <g transform={`translate(${m.actualSx}, ${m.actualSy}) scale(${markerScale})`} pointerEvents="none">
              <circle r="4" fill={MAP_COLORS.apex} stroke={CHART_COLORS.white} strokeWidth="1.5" />
            </g>
            <g transform={`translate(${labelX}, ${labelY}) scale(${markerScale})`}>
              <rect x="-16" y="-7" width="32" height="14" rx="3" fill={MAP_COLORS.markerBg} stroke={MAP_COLORS.apex} strokeWidth="1.2" opacity={m.isDimmed ? 0.75 : 0.95} className="transition-transform group-hover:scale-110" />
              <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill={MAP_COLORS.apexText} fontSize="7.5" fontFamily="monospace" fontWeight="bold" letterSpacing="0.06em" className="select-none pointer-events-none">
                APEX
              </text>
            </g>
          </g>
        );
      })}

      {showCornerFlags && cornerPositions.map(m => (
        <g
          key={`corner-${m.cornerNumber}`}
          data-testid={`corner-flag-${m.cornerNumber}`}
          opacity={m.isDimmed ? 0.6 : 1}
          className={`cursor-pointer group transition-opacity duration-150 ${m.isDimmed ? 'hover:opacity-100' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onSelectCornerNumber?.(m.cornerNumber);
            onSelectIndex?.(m.idx);
          }}
        >
          {/* Guide tether connecting badge to apex in world coordinates */}
          <line
            x1={m.posX}
            y1={m.posY}
            x2={m.actualSx}
            y2={m.actualSy}
            stroke={m.isSelected ? MAP_COLORS.apex : MAP_COLORS.markerMuted}
            strokeWidth={m.isSelected ? '2' : '1.3'}
            strokeDasharray={m.isSelected ? undefined : '3 3'}
            opacity={m.isSelected ? 0.9 : m.isDimmed ? 0.45 : 0.6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {/* Zoom-agnostic apex dot and APEX pill on trajectory for selected corner */}
          {m.isSelected && (
            <g
              data-testid={`apex-marker-${m.cornerNumber}`}
              transform={`translate(${m.actualSx}, ${m.actualSy}) scale(${markerScale})`}
              pointerEvents="none"
            >
              <circle r="8" fill={MAP_COLORS.apex} opacity="0.3" className="animate-ping" />
              <circle r="4.5" fill={MAP_COLORS.apex} stroke={CHART_COLORS.white} strokeWidth="1.5" />
              <g transform="translate(0, 14)">
                <rect x="-16" y="-7" width="32" height="14" rx="3" fill={MAP_COLORS.markerBg} stroke={MAP_COLORS.apex} strokeWidth="1.2" opacity="0.95" />
                <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill={MAP_COLORS.apexText} fontSize="7.5" fontFamily="monospace" fontWeight="bold" letterSpacing="0.06em" className="select-none">
                  APEX
                </text>
              </g>
            </g>
          )}
          {/* Badge anchored at (posX, posY), scaled to constant screen size */}
          <g transform={`translate(${m.posX}, ${m.posY}) scale(${markerScale})`}>
            <circle
              r={m.isSelected ? 16.5 : 13.5}
              fill={m.isSelected ? MAP_COLORS.apex : MAP_COLORS.markerUnselected}
              stroke={m.isSelected ? CHART_COLORS.white : m.isDimmed ? MAP_COLORS.markerDimmed : MAP_COLORS.markerMuted}
              strokeWidth={m.isSelected ? 2.2 : 1.6}
              className={m.isSelected ? 'animate-pulse' : 'transition-transform group-hover:scale-110'}
            />
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-mono font-bold select-none pointer-events-none ${
                m.isSelected ? 'fill-white text-sm' : m.isDimmed ? 'fill-lmu-text text-xs' : 'fill-lmu-text text-xs'
              }`}
            >
              T{m.cornerNumber}
            </text>
          </g>
        </g>
      ))}

      {visiblePedalMarkers.map((m, i) => (
        <GpsScenePedalMarker
          key={`pedal-${m.isBaseline ? 'base' : 'prim'}-${m.kind}-${m.cornerNumber}-${i}`}
          marker={m}
          cornerBadgePositions={cornerPositions}
          markerScale={markerScale}
          opacity={(m.isBaseline ? baselineOpacity : primaryOpacity) ?? 1}
        />
      ))}
    </>
  );
});
