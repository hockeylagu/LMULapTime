import React from 'react';
import { Plus, Minus, RotateCcw, Crosshair, LocateFixed, Play, Pause } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface MapControlsOverlayProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  zoomDisplay?: string;
  followCar?: boolean;
  onToggleFollowCar?: () => void;
  onCenterCar?: () => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  children?: React.ReactNode;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
}

export const MapControlsOverlay: React.FC<MapControlsOverlayProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  zoomDisplay,
  followCar,
  onToggleFollowCar,
  onCenterCar,
  orientation = 'horizontal',
  className = '',
  children,
  isPlaying,
  onTogglePlay,
}) => {
  const isVert = orientation === 'vertical';

  return (
    <div data-map-control="navigation"
      data-testid="map-controls-overlay"
      className={`absolute bottom-3 right-3 z-30 flex ${
        isVert ? 'flex-col items-center gap-1 p-1' : 'items-center gap-1.5 p-1.5'
      } bg-lmu-strip/90 backdrop-blur-md rounded-xl border border-lmu-border shadow-xl ${className}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      {onTogglePlay && (
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause · Space' : 'Play · Space'}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
            isPlaying
              ? 'bg-lmu-accent text-lmu-text hover:bg-lmu-accent/80'
              : 'bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text'
          } ${FOCUS_RING}`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-0.5" />}
        </button>
      )}
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
        title="Zoom In"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
        title="Zoom Out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {onCenterCar && (
        <button
          type="button"
          onClick={onCenterCar}
          aria-label="Center car"
          title="Center car · C"
          className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>
      )}
      {onToggleFollowCar && (
        <button
          type="button"
          onClick={onToggleFollowCar}
          aria-label="Follow car"
          aria-pressed={Boolean(followCar)}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
            followCar
              ? 'bg-lmu-accent text-lmu-text'
              : 'bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text'
          } ${FOCUS_RING}`}
          title={followCar ? 'Follow car · F (active)' : 'Follow car · F'}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onReset}
        aria-label="Reset zoom and pan"
        className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
        title="Reset View"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {children}
      {zoomDisplay && (
        <span
          className={`${
            isVert ? 'w-7 h-4.5 text-[10px]' : 'w-11 h-7 text-[10px]'
          } flex items-center justify-center font-mono text-lmu-muted font-bold select-none tabular-nums shrink-0`}
        >
          {zoomDisplay}
        </span>
      )}
    </div>
  );
};

