import React, { useMemo } from 'react';

export interface GpsCircuitMinimapProps {
  layoutPathD?: string;
  trackBoundaryPathD?: string;
  currentPos?: { sx: number; sy: number };
  baselineGhostPos?: { sx: number; sy: number } | null;
  currentViewBox?: string;
  className?: string;
}

export const GpsCircuitMinimap: React.FC<GpsCircuitMinimapProps> = ({
  layoutPathD,
  trackBoundaryPathD,
  currentPos,
  baselineGhostPos,
  currentViewBox,
  className = '',
}) => {
  const activePathD = trackBoundaryPathD || layoutPathD;

  const viewportBox = useMemo(() => {
    if (!currentViewBox) return null;
    const parts = currentViewBox.split(' ').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return null;
    const [vx, vy, vw, vh] = parts;
    if (vw >= 530 && vh >= 530) return null;
    return { vx, vy, vw, vh };
  }, [currentViewBox]);

  if (!activePathD) return null;

  return (
    <div
      data-testid="gps-circuit-minimap"
      className={`absolute top-2.5 left-2.5 z-20 w-28 h-28 sm:w-32 sm:h-32 bg-[#060910]/85 border border-lmu-border/70 backdrop-blur-md rounded-xl p-1 shadow-lg pointer-events-none select-none flex items-center justify-center ${className}`}
    >
      <svg viewBox="0 0 800 800" className="w-full h-full drop-shadow-sm">
        <path
          d={activePathD}
          stroke="#1e293b"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d={activePathD}
          stroke="#475569"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {viewportBox && (
          <rect
            x={viewportBox.vx}
            y={viewportBox.vy}
            width={viewportBox.vw}
            height={viewportBox.vh}
            fill="#38bdf8"
            fillOpacity="0.08"
            stroke="#38bdf8"
            strokeWidth="5"
            strokeDasharray="14 10"
            rx="16"
          />
        )}

        {baselineGhostPos && (
          <circle
            cx={baselineGhostPos.sx}
            cy={baselineGhostPos.sy}
            r="16"
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth="3.5"
          />
        )}

        {currentPos && (
          <circle
            cx={currentPos.sx}
            cy={currentPos.sy}
            r="18"
            fill="#38bdf8"
            stroke="#ffffff"
            strokeWidth="4"
          />
        )}
      </svg>
    </div>
  );
};
