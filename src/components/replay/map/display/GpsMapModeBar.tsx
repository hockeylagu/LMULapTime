import React from 'react';
import { CircleDot, Compass, Disc } from 'lucide-react';
import type { MapColorMode } from '../replayMapUtils.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface GpsMapModeBarProps {
  colorBy?: MapColorMode;
  onChangeColorBy?: (mode: MapColorMode) => void;
  showPedalMarkers?: boolean;
  onTogglePedalMarkers?: () => void;
  hasCorners?: boolean;
  isCompareMode?: boolean;
  hasBaseline?: boolean;
  fadedLine?: 'none' | 'primary' | 'baseline';
  onToggleFadedLine?: (line: 'primary' | 'baseline') => void;
  showGForce?: boolean;
  onToggleGForce?: () => void;
  showFrictionCircle?: boolean;
  onToggleFrictionCircle?: () => void;
  className?: string;
}

export const GpsMapModeBar: React.FC<GpsMapModeBarProps> = ({
  colorBy = 'pedal',
  onChangeColorBy,
  showPedalMarkers = false,
  onTogglePedalMarkers,
  hasCorners = false,
  isCompareMode = false,
  hasBaseline = false,
  fadedLine = 'none',
  onToggleFadedLine,
  showGForce = false,
  onToggleGForce,
  showFrictionCircle = false,
  onToggleFrictionCircle,
  className = '',
}) => {
  const modes = ['pedal', 'speed', ...(isCompareMode && hasBaseline ? (['delta'] as const) : [])] as const;

  return (
    <div
      data-testid="gps-map-mode-bar"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-white/15 backdrop-blur-md shadow-xl select-none pointer-events-auto ${className}`}
    >
      {onChangeColorBy && (
        <div className="flex items-center gap-1">
          {modes.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeColorBy(mode)}
              title={`Color by ${mode}`}
              aria-pressed={colorBy === mode}
              className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-all cursor-pointer ${
                colorBy === mode ? 'bg-lmu-raised text-white' : 'text-lmu-muted hover:text-white'
              } ${FOCUS_RING}`}
            >
              {mode === 'pedal' ? 'Pedal' : mode === 'speed' ? 'Speed' : 'Delta'}
            </button>
          ))}
        </div>
      )}

      {hasCorners && onTogglePedalMarkers && (
        <button
          type="button"
          onClick={onTogglePedalMarkers}
          aria-pressed={showPedalMarkers}
          title={showPedalMarkers ? 'Hide brake/throttle points' : 'Show brake/throttle points'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
            showPedalMarkers
              ? 'bg-lmu-raised text-white'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <Disc className="w-3.5 h-3.5 text-lmu-loss" />
          <span>Pedal Points</span>
        </button>
      )}

      {onToggleGForce && (
        <button
          type="button"
          onClick={onToggleGForce}
          aria-pressed={showGForce}
          title={showGForce ? 'Hide G-force vector (G)' : 'Show G-force vector (G)'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
            showGForce
              ? 'bg-lmu-raised text-white'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <Compass className="w-3.5 h-3.5 text-sky-400" />
          <span>G-Force</span>
        </button>
      )}

      {onToggleFrictionCircle && (
        <button
          type="button"
          onClick={onToggleFrictionCircle}
          aria-pressed={showFrictionCircle}
          title={showFrictionCircle ? 'Hide friction circle' : 'Show friction circle'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
            showFrictionCircle
              ? 'bg-lmu-raised text-white'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
          <span>Friction</span>
        </button>
      )}

      {hasBaseline && onToggleFadedLine && (
        <div className="flex items-center gap-1 pl-1 border-l border-white/10">
          <button
            type="button"
            onClick={() => onToggleFadedLine('primary')}
            title={fadedLine === 'primary' ? 'Show my line' : 'Fade my line'}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer ${
              fadedLine === 'primary'
                ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
            } ${FOCUS_RING}`}
          >
            <span className="w-2.5 h-1 rounded-sm bg-lmu-info shrink-0" />
            Mine
          </button>
          <button
            type="button"
            onClick={() => onToggleFadedLine('baseline')}
            title={fadedLine === 'baseline' ? 'Show baseline line' : 'Fade baseline line'}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-all cursor-pointer ${
              fadedLine === 'baseline'
                ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
            } ${FOCUS_RING}`}
          >
            <span className="w-2.5 h-0 border-b-2 border-dashed border-lmu-warn shrink-0" />
            Baseline
          </button>
        </div>
      )}
    </div>
  );
};
