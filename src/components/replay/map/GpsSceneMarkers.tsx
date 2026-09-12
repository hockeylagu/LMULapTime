import React, { useMemo } from 'react';
import { PEDAL_MARKER_LINE_HALF_LEN, PEDAL_MARKER_TAG_BASE_OFFSET, PEDAL_MARKER_TAG_STAGGER_OFFSET } from './replayMapUtils.js';

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
}

export const GpsSceneMarkers: React.FC<GpsSceneMarkersProps> = ({
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
}) => {
  const cornersToRender = cornerMarkers ?? markers ?? [];

  const cornerPositions = useMemo(() => {
    const effectiveZoom = zoomLevel ?? (markerScale > 0 ? 1 / markerScale : 1);
    return cornersToRender.map(m => {
      const isSelected = m.cornerNumber === selectedCornerNumber;
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
        posX: Number((m.actualSx + uX * dSvg).toFixed(1)),
        posY: Number((m.actualSy + uY * dSvg).toFixed(1)),
      };
    });
  }, [cornersToRender, selectedCornerNumber, zoomLevel, markerScale]);

  return (
    <>
      {cornerPositions.map(m => (
        <g
          key={`corner-${m.cornerNumber}`}
          data-testid={`corner-flag-${m.cornerNumber}`}
          className="cursor-pointer group"
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
            stroke={m.isSelected ? '#f43f5e' : '#94a3b8'}
            strokeWidth={m.isSelected ? '2' : '1.3'}
            strokeDasharray={m.isSelected ? undefined : '3 3'}
            opacity={m.isSelected ? 0.9 : 0.6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {/* Badge anchored at (posX, posY), scaled to constant screen size */}
          <g transform={`translate(${m.posX}, ${m.posY}) scale(${markerScale})`}>
            <circle
              r={m.isSelected ? 16.5 : 13.5}
              fill={m.isSelected ? '#f43f5e' : '#0f172a'}
              stroke={m.isSelected ? '#ffffff' : '#94a3b8'}
              strokeWidth={m.isSelected ? 2.2 : 1.6}
              className={m.isSelected ? 'animate-pulse' : 'transition-transform group-hover:scale-110'}
            />
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-mono font-bold select-none pointer-events-none ${
                m.isSelected ? 'fill-white text-[13.5px]' : 'fill-slate-100 text-[12px]'
              }`}
            >
              T{m.cornerNumber}
            </text>
          </g>
        </g>
      ))}

      {pedalMarkers.map((m, i) => {
        const isBrake = m.kind === 'brake';
        const isBase = Boolean(m.isBaseline);
        const opacity = (isBase ? baselineOpacity : primaryOpacity) ?? 1;

        // Colors: primary uses solid red/green, baseline uses distinct tinted red/green styling
        const primaryColor = isBrake ? '#f43f5e' : '#10b981';
        const baselineColor = isBrake ? '#f87171' : '#4ade80';
        const strokeColor = isBase ? baselineColor : primaryColor;
        const textColor = isBase ? baselineColor : primaryColor;
        const label = isBrake ? 'B' : 'T';

        // Normal vector perpendicular to the trajectory
        const nx = m.nx ?? 0;
        const ny = m.ny ?? 1;

        // Line extending perpendicular across the track (enlarged for better readability)
        const lineHalfLen = PEDAL_MARKER_LINE_HALF_LEN;
        const x1 = m.sx - nx * lineHalfLen;
        const y1 = m.sy - ny * lineHalfLen;
        const x2 = m.sx + nx * lineHalfLen;
        const y2 = m.sy + ny * lineHalfLen;

        // Overlap staggering: if baseline is close to primary, place at tier 2
        const tagDist = lineHalfLen + (m.isStaggered ? PEDAL_MARKER_TAG_STAGGER_OFFSET : PEDAL_MARKER_TAG_BASE_OFFSET);

        // Check if placing badge on default side (+nx, +ny) collides with any corner marker badge
        const defTagX = m.sx + nx * tagDist;
        const defTagY = m.sy + ny * tagDist;
        const distToCornerDef = cornerPositions.reduce(
          (minD, c) => Math.min(minD, Math.hypot(defTagX - c.posX, defTagY - c.posY)),
          Infinity
        );

        // If default side is within 34px of a corner marker, flip badge to opposite side (-nx, -ny)
        const side = distToCornerDef < 34 ? -1 : 1;
        const tagX = m.sx + nx * side * tagDist;
        const tagY = m.sy + ny * side * tagDist;

        // Extension stem connecting the baseline badge to the track when staggered
        const stemX1 = m.sx + nx * side * (lineHalfLen + 1);
        const stemY1 = m.sy + ny * side * (lineHalfLen + 1);
        const stemX2 = m.sx + nx * side * (tagDist - 9.5);
        const stemY2 = m.sy + ny * side * (tagDist - 9.5);

        return (
          <g
            key={`pedal-${isBase ? 'base' : 'prim'}-${m.kind}-${m.cornerNumber}-${i}`}
            data-testid={`pedal-marker-${isBase ? 'baseline-' : ''}${m.kind}-${m.cornerNumber}`}
            transform={`translate(${m.sx}, ${m.sy}) scale(${markerScale}) translate(${-m.sx}, ${-m.sy})`}
            opacity={opacity}
            className="pointer-events-none select-none"
          >
            <title>
              {isBase ? 'Baseline' : 'My'} {isBrake ? 'Braking Point' : 'Throttle On'}
              {m.distM !== undefined ? ` (${m.distM.toFixed(0)}m)` : ''}
            </title>

            {/* Subtle outer glow line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={strokeColor}
              strokeWidth="3.6"
              strokeLinecap="round"
              opacity="0.25"
            />

            {/* Connecting dashed guide stem for staggered tier 2 badge */}
            {m.isStaggered && (
              <line
                x1={stemX1}
                y1={stemY1}
                x2={stemX2}
                y2={stemY2}
                stroke={strokeColor}
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.85"
              />
            )}

            {/* Perpendicular marker line across racing line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={strokeColor}
              strokeWidth={isBase ? '2.0' : '2.4'}
              strokeDasharray={isBase ? '4 3' : undefined}
              strokeLinecap="round"
              opacity={isBase ? '0.9' : '0.95'}
            />

            {/* Outer tips */}
            <circle cx={x1} cy={y1} r="2" fill={strokeColor} />
            <circle cx={x2} cy={y2} r="2" fill={strokeColor} />

            {/* In-line intersection dot on racing line */}
            <circle
              cx={m.sx}
              cy={m.sy}
              r={isBase ? 2.8 : 2.4}
              fill={isBase ? '#060912' : primaryColor}
              stroke={isBase ? strokeColor : '#000'}
              strokeWidth={isBase ? 1.6 : 0.9}
            />

            {/* Indicator badge outside racing line */}
            <g transform={`translate(${tagX.toFixed(1)}, ${tagY.toFixed(1)})`}>
              <circle
                r="9.5"
                fill="#060912"
                stroke={strokeColor}
                strokeWidth="1.8"
                strokeDasharray={isBase ? '3.5 2.5' : undefined}
              />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={textColor}
                fontSize="10.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {label}
              </text>
            </g>
          </g>
        );
      })}
    </>
  );
};
