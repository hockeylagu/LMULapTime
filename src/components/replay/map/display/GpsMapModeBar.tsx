import React from 'react';
import { CircleDot, Compass, Disc } from 'lucide-react';
import type { MapColorMode } from '../replayMapUtils.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import type { GpsTrackMapCorner } from '../gpsTrackMapTypes.js';

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
  corners?: GpsTrackMapCorner[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
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
  corners, selectedCornerNumber, onSelectCornerNumber,
}) => {
  const modes = ['pedal', 'speed', ...(isCompareMode && hasBaseline ? (['delta'] as const) : [])] as const;

  return (
    <div
      data-testid="gps-map-mode-bar"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-lmu-strip/95 border border-lmu-border backdrop-blur-md shadow-xl select-none pointer-events-auto max-2xl:top-16 max-2xl:left-72 max-2xl:right-3 max-2xl:translate-x-0 max-2xl:justify-end ${className}`}
    >
      {corners?.length && onSelectCornerNumber ? (
        <select aria-label="Select map turn" value={selectedCornerNumber ?? ''}
          onChange={event => onSelectCornerNumber(Number(event.target.value))}
          className={`max-w-32 bg-lmu-card text-lmu-text text-xs rounded px-2 py-1 cursor-pointer ${FOCUS_RING}`}>
          <option value="" disabled>Select turn</option>
          {corners.map(corner => <option key={corner.cornerNumber} value={corner.cornerNumber}>Turn {corner.cornerNumber}</option>)}
        </select>
      ) : null}
      {onChangeColorBy && (
        <div className="flex items-center gap-1">
          {modes.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeColorBy(mode)}
              title={`Color by ${mode}`}
              aria-pressed={colorBy === mode}
              className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors cursor-pointer ${
                colorBy === mode ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text'
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
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
            showPedalMarkers
              ? 'bg-lmu-raised text-lmu-text'
              : 'text-lmu-muted hover:text-lmu-text hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <Disc className="w-3.5 h-3.5" />
          <span>Pedal Points</span>
        </button>
      )}

      {onToggleGForce && (
        <button
          type="button"
          onClick={onToggleGForce}
          aria-pressed={showGForce}
          title={showGForce ? 'Hide G-force vector (G)' : 'Show G-force vector (G)'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
            showGForce
              ? 'bg-lmu-raised text-lmu-text'
              : 'text-lmu-muted hover:text-lmu-text hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>G-Force</span>
        </button>
      )}

      {onToggleFrictionCircle && (
        <button
          type="button"
          onClick={onToggleFrictionCircle}
          aria-pressed={showFrictionCircle}
          title={showFrictionCircle ? 'Hide friction circle' : 'Show friction circle'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
            showFrictionCircle
              ? 'bg-lmu-raised text-lmu-text'
              : 'text-lmu-muted hover:text-lmu-text hover:bg-lmu-raised/50'
          } ${FOCUS_RING}`}
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span>Friction</span>
        </button>
      )}

      {hasBaseline && onToggleFadedLine && (
        <div className="flex items-center gap-1 pl-1 border-l border-lmu-border">
          <button
            type="button"
            onClick={() => onToggleFadedLine('primary')}
            aria-pressed={fadedLine === 'primary'}
            aria-label={fadedLine === 'primary' ? 'Restore primary line' : 'Fade primary line'}
            title={fadedLine === 'primary' ? 'Restore primary line' : 'Fade primary line'}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
              fadedLine === 'primary'
                ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                : 'text-lmu-text-soft hover:text-lmu-text hover:bg-lmu-raised/50'
            } ${FOCUS_RING}`}
          >
            <span className="w-2.5 h-1 rounded-sm bg-lmu-info shrink-0" />
            Primary
          </button>
          <button
            type="button"
            onClick={() => onToggleFadedLine('baseline')}
            aria-pressed={fadedLine === 'baseline'}
            aria-label={fadedLine === 'baseline' ? 'Restore baseline line' : 'Fade baseline line'}
            title={fadedLine === 'baseline' ? 'Restore baseline line' : 'Fade baseline line'}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
              fadedLine === 'baseline'
                ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                : 'text-lmu-text-soft hover:text-lmu-text hover:bg-lmu-raised/50'
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
