import React from 'react';
import { Plus, Minus, RotateCcw, Crosshair } from 'lucide-react';

export interface MapControlsOverlayProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  zoomDisplay?: string;
  followCar?: boolean;
  onToggleFollowCar?: () => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export const MapControlsOverlay: React.FC<MapControlsOverlayProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  zoomDisplay,
  followCar,
  onToggleFollowCar,
  orientation = 'horizontal',
  className = '',
}) => {
  const isVert = orientation === 'vertical';

  return (
    <div
      data-testid="map-controls-overlay"
      className={`absolute bottom-3 right-3 z-30 flex ${
        isVert ? 'flex-col items-center gap-1 p-1' : 'items-center gap-1.5 p-1.5'
      } bg-lmu-strip/90 backdrop-blur-md rounded-xl border border-white/10 shadow-xl ${className}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer shrink-0"
        title="Zoom In"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer shrink-0"
        title="Zoom Out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {onToggleFollowCar && (
        <button
          type="button"
          onClick={onToggleFollowCar}
          aria-label="Follow car"
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
            followCar
              ? 'bg-lmu-accent text-white shadow-sm'
              : 'bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white'
          }`}
          title={followCar ? 'Follow Car (Active)' : 'Follow Car'}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onReset}
        aria-label="Reset zoom and pan"
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer shrink-0"
        title="Reset View"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {zoomDisplay && (
        <span
          className={`${
            isVert ? 'w-7 h-4.5 text-[9px]' : 'w-11 h-7 text-[10px]'
          } flex items-center justify-center font-mono text-slate-400 font-bold select-none tabular-nums shrink-0`}
        >
          {zoomDisplay}
        </span>
      )}
    </div>
  );
};

