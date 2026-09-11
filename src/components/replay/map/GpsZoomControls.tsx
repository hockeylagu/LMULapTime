import React from 'react';
import { Plus, Minus, RotateCcw } from 'lucide-react';

export interface GpsZoomControlsProps {
  zoomRadius: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSelectRadius: (radius: number) => void;
  onRecenter: () => void;
  isPanned: boolean;
}

export const GpsZoomControls: React.FC<GpsZoomControlsProps> = ({
  zoomRadius,
  onZoomIn,
  onZoomOut,
  onSelectRadius,
  onRecenter,
  isPanned,
}) => {
  return (
    <div className="flex items-center gap-1 bg-[#0a0e17]/90 p-0.5 rounded-lg border border-white/10 backdrop-blur-sm pointer-events-auto">
      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in closer (+)"
        className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out wider (-)"
        className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <div className="w-[1px] h-3 bg-white/10 mx-0.5" />
      {[40, 80, 150].map((r) => (
        <button
          key={r}
          onClick={() => onSelectRadius(r)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
            zoomRadius === r ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
          }`}
        >
          {r}m
        </button>
      ))}
      {isPanned && (
        <button
          onClick={onRecenter}
          aria-label="Recenter"
          title="Recenter view on car"
          className="p-1 rounded text-cyan-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
