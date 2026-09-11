import React from 'react';

export interface CornerMarkerPoint {
  cornerNumber: number;
  sx: number;
  sy: number;
  idx: number;
  actualSx: number;
  actualSy: number;
}

export interface PedalMarkerPoint {
  cornerNumber: number;
  kind: 'brake' | 'throttle';
  sx: number;
  sy: number;
}

export interface GpsSceneMarkersProps {
  cornerMarkers: CornerMarkerPoint[];
  pedalMarkers: PedalMarkerPoint[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  onSelectIndex?: (index: number) => void;
}

export const GpsSceneMarkers: React.FC<GpsSceneMarkersProps> = ({
  cornerMarkers,
  pedalMarkers,
  selectedCornerNumber,
  onSelectCornerNumber,
  onSelectIndex,
}) => {
  return (
    <>
      {cornerMarkers.map((m) => {
        const isSelected = m.cornerNumber === selectedCornerNumber;
        return (
          <g
            key={`corner-${m.cornerNumber}`}
            transform={`translate(${m.sx.toFixed(1)}, ${m.sy.toFixed(1)})`}
            className="cursor-pointer"
            onClick={() => {
              onSelectCornerNumber?.(m.cornerNumber);
              onSelectIndex?.(m.idx);
            }}
          >
            <line
              x1={0}
              y1={0}
              x2={(m.sx - m.actualSx).toFixed(1)}
              y2={(m.sy - m.actualSy).toFixed(1)}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity={0.55}
              pointerEvents="none"
            />
            <circle
              r={isSelected ? 10 : 7}
              fill={isSelected ? '#f43f5e' : '#0f172a'}
              stroke={isSelected ? '#ffffff' : '#94a3b8'}
              strokeWidth={isSelected ? 2 : 1.5}
              className={isSelected ? 'animate-pulse' : ''}
            />
            <text
              y="3.5"
              textAnchor="middle"
              className={`font-mono font-bold pointer-events-none ${
                isSelected ? 'fill-white text-[9px]' : 'fill-slate-300 text-[7.5px]'
              }`}
            >
              T{m.cornerNumber}
            </text>
          </g>
        );
      })}

      {pedalMarkers.map((m, i) => (
        <g
          key={`pedal-${m.kind}-${m.cornerNumber}-${i}`}
          transform={`translate(${m.sx.toFixed(1)}, ${m.sy.toFixed(1)})`}
          className="pointer-events-none"
        >
          {m.kind === 'brake' ? (
            <polygon points="0,-5 -4.5,4 4.5,4" fill="#ef4444" stroke="#000" strokeWidth="0.75" opacity="0.9" />
          ) : (
            <polygon points="0,-5.5 5.5,0 0,5.5 -5.5,0" fill="#22c55e" stroke="#000" strokeWidth="0.75" opacity="0.9" />
          )}
        </g>
      ))}
    </>
  );
};
