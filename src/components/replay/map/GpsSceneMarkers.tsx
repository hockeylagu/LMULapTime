import React from 'react';

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
}

export interface GpsSceneMarkersProps {
  cornerMarkers?: CornerMarkerPoint[];
  markers?: SceneCornerMarker[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  onSelectIndex?: (index: number) => void;
  pedalMarkers: PedalMarkerPoint[];
}

export const GpsSceneMarkers: React.FC<GpsSceneMarkersProps> = ({
  cornerMarkers,
  markers,
  selectedCornerNumber,
  onSelectCornerNumber,
  onSelectIndex,
  pedalMarkers,
}) => {
  const cornersToRender = cornerMarkers ?? markers ?? [];

  return (
    <>
      {cornersToRender.map(m => {
        const isSelected = m.cornerNumber === selectedCornerNumber;
        return (
          <g
            key={`corner-${m.cornerNumber}`}
            data-testid={`corner-flag-${m.cornerNumber}`}
            transform={`translate(${m.sx.toFixed(1)}, ${m.sy.toFixed(1)})`}
            className="cursor-pointer group"
            onClick={e => {
              e.stopPropagation();
              onSelectCornerNumber?.(m.cornerNumber);
              onSelectIndex?.(m.idx);
            }}
          >
            <line
              x1={0}
              y1={0}
              x2={(m.actualSx - m.sx).toFixed(1)}
              y2={(m.actualSy - m.sy).toFixed(1)}
              stroke={isSelected ? '#f43f5e' : '#94a3b8'}
              strokeWidth={isSelected ? '1.5' : '1'}
              strokeDasharray={isSelected ? undefined : '3 3'}
              opacity={isSelected ? 0.9 : 0.55}
              pointerEvents="none"
            />
            <circle
              r={isSelected ? 10 : 7.5}
              fill={isSelected ? '#f43f5e' : '#0f172a'}
              stroke={isSelected ? '#ffffff' : '#94a3b8'}
              strokeWidth={isSelected ? 2 : 1.5}
              className={isSelected ? 'animate-pulse' : 'transition-transform group-hover:scale-110'}
            />
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-mono font-bold select-none pointer-events-none ${
                isSelected ? 'fill-white text-[9.5px]' : 'fill-slate-200 text-[8px]'
              }`}
            >
              T{m.cornerNumber}
            </text>
          </g>
        );
      })}

      {pedalMarkers.map((m, i) => {
        const isBrake = m.kind === 'brake';
        const color = isBrake ? '#f43f5e' : '#10b981';
        const label = isBrake ? 'B' : 'T';

        // Normal vector perpendicular to the trajectory
        const nx = m.nx ?? 0;
        const ny = m.ny ?? 1;

        // Line extending perpendicular across the track and visibly outside the racing line.
        // Scaled down to a sleek, refined proportion:
        const lineHalfLen = 14;
        const x1 = m.sx - nx * lineHalfLen;
        const y1 = m.sy - ny * lineHalfLen;
        const x2 = m.sx + nx * lineHalfLen;
        const y2 = m.sy + ny * lineHalfLen;

        // Badge position positioned outside the racing line
        const tagDist = lineHalfLen + 5.5;
        const tagX = m.sx + nx * tagDist;
        const tagY = m.sy + ny * tagDist;

        return (
          <g
            key={`pedal-${m.kind}-${m.cornerNumber}-${i}`}
            data-testid={`pedal-marker-${m.kind}-${m.cornerNumber}`}
            className="pointer-events-none select-none"
          >
            {/* Subtle outer glow line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.3"
            />
            {/* Crisp perpendicular marker line across and outside racing line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.95"
            />
            {/* Outer tips */}
            <circle cx={x1} cy={y1} r="1.4" fill={color} />
            <circle cx={x2} cy={y2} r="1.4" fill={color} />

            {/* In-line intersection dot on the racing line */}
            <circle cx={m.sx} cy={m.sy} r="1.8" fill={color} stroke="#000" strokeWidth="0.8" />

            {/* Distinct external indicator badge outside the racing line */}
            <g transform={`translate(${tagX.toFixed(1)}, ${tagY.toFixed(1)})`}>
              <circle
                r="5.5"
                fill="#060912"
                stroke={color}
                strokeWidth="1.4"
              />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize="6"
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
