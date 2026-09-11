import React from 'react';
import { Plus, Minus, RotateCcw, Crosshair } from 'lucide-react';

export interface MapControlsOverlayProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  zoomDisplay?: string;
  followCar?: boolean;
  onToggleFollowCar?: () => void;
  className?: string;
}

export const MapControlsOverlay: React.FC<MapControlsOverlayProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  zoomDisplay,
  followCar,
  onToggleFollowCar,
  className = '',
}) => {
  return (
    <div
      className={`absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-[#0a0e17]/90 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-xl ${className}`}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer"
        title="Zoom In"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer"
        title="Zoom Out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {onToggleFollowCar && (
        <button
          type="button"
          onClick={onToggleFollowCar}
          aria-label="Follow car"
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
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
        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer"
        title="Reset View"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {zoomDisplay && (
        <span className="text-[10px] font-mono text-lmu-muted px-1.5 font-bold select-none">
          {zoomDisplay}
        </span>
      )}
    </div>
  );
};
