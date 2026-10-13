import React, { useMemo } from 'react';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface GpsCircuitMinimapProps {
  layoutPathD?: string;
  trackBoundaryPathD?: string;
  currentPos?: { sx: number; sy: number };
  baselineGhostPos?: { sx: number; sy: number } | null;
  currentViewBox?: string;
  onPanTo?: (targetX: number, targetY: number) => void;
  isExpanded?: boolean;
  className?: string;
}

export const GpsCircuitMinimap: React.FC<GpsCircuitMinimapProps> = ({
  layoutPathD,
  trackBoundaryPathD,
  currentPos,
  baselineGhostPos,
  currentViewBox,
  onPanTo,
  isExpanded = false,
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

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPanTo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const targetX = Math.max(0, Math.min(800, (e.clientX - rect.left) * (800 / rect.width)));
    const targetY = Math.max(0, Math.min(800, (e.clientY - rect.top) * (800 / rect.height)));
    onPanTo(targetX, targetY);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !onPanTo) return;
    e.stopPropagation();
    handlePointer(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPanTo || (e.buttons & 1) !== 1) return;
    e.stopPropagation();
    handlePointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    }
  };

  if (!activePathD) return null;

  const sizeClass = isExpanded
    ? 'w-52 h-52 sm:w-60 sm:h-60 md:w-64 md:h-64 top-3.5 left-3.5'
    : 'w-36 h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 top-2.5 left-2.5';

  return (
    <div
      data-testid="gps-circuit-minimap"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`absolute z-20 ${sizeClass} select-none flex items-center justify-center cursor-crosshair active:cursor-grabbing ${className}`}
    >
      <svg
        viewBox="0 0 800 800"
        shapeRendering="geometricPrecision"
        className="w-full h-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <path
          d={activePathD}
          stroke={MAP_COLORS.minimapBorder}
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d={activePathD}
          stroke="#64748B"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {viewportBox && (
          <rect
            data-testid="minimap-viewport-box"
            x={viewportBox.vx}
            y={viewportBox.vy}
            width={viewportBox.vw}
            height={viewportBox.vh}
            fill={TELEMETRY_COLORS.primary}
            fillOpacity="0.08"
            stroke={TELEMETRY_COLORS.primary}
            strokeWidth="4"
            strokeOpacity="0.75"
            strokeDasharray="12 8"
            rx="14"
          />
        )}

        {baselineGhostPos && (
          <circle
            cx={baselineGhostPos.sx}
            cy={baselineGhostPos.sy}
            r="14"
            fill={TELEMETRY_COLORS.baseline}
            stroke={CHART_COLORS.white}
            strokeWidth="2.5"
          />
        )}

        {currentPos && (
          <circle
            cx={currentPos.sx}
            cy={currentPos.sy}
            r="16"
            fill={TELEMETRY_COLORS.primary}
            stroke={CHART_COLORS.white}
            strokeWidth="3"
          />
        )}
      </svg>
    </div>
  );
};
