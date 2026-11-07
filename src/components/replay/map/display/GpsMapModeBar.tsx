import React from 'react';
import { CircleDot, Compass } from 'lucide-react';
import type { MapColorMode } from '../replayMapUtils.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { GHOST_SYNC_MODES, type GhostSyncMode } from '../ghostSync.js';

const SYNC_LABELS: Record<GhostSyncMode, string> = { distance: 'Distance', time: 'Time', anchored: 'From A' };
const syncTitle = (mode: GhostSyncMode, anchorSet: boolean) => mode === 'distance'
  ? 'Ghost at the same lap distance: compare lines and brake points (V)'
  : mode === 'time' ? 'Ghost at the same lap time: see the gap on track over the whole lap (V)'
    : anchorSet ? 'Both cars start together at marker A, then run on time: who carries more speed (V)'
      : 'Both cars start together at marker A, then run on time (V). Alt-click the telemetry trace to set A; until then it runs from the lap start';

export interface GpsMapModeBarProps {
  colorBy?: MapColorMode;
  onChangeColorBy?: (mode: MapColorMode) => void;
  isCompareMode?: boolean;
  hasBaseline?: boolean;
  fadedLine?: 'none' | 'primary' | 'baseline';
  onToggleFadedLine?: (line: 'primary' | 'baseline') => void;
  showGForce?: boolean;
  onToggleGForce?: () => void;
  showFrictionCircle?: boolean;
  onToggleFrictionCircle?: () => void;
  /** Where the ghost follows the primary car; the toggle shows with a baseline and a handler. */
  ghostSync?: GhostSyncMode;
  onChangeGhostSync?: (mode: GhostSyncMode) => void;
  ghostAnchorSet?: boolean;
  className?: string;
  embedded?: boolean;
}

export const GpsMapModeBar: React.FC<GpsMapModeBarProps> = ({
  colorBy = 'pedal',
  onChangeColorBy,
  isCompareMode = false,
  hasBaseline = false,
  fadedLine = 'none',
  onToggleFadedLine,
  showGForce = false,
  onToggleGForce,
  showFrictionCircle = false,
  onToggleFrictionCircle,
  ghostSync = 'distance',
  onChangeGhostSync,
  ghostAnchorSet = false,
  className = '',
  embedded = false,
}) => {
  const modes = ['pedal', 'speed', ...(isCompareMode && hasBaseline ? (['delta', 'gainLoss'] as const) : [])] as const;

  return (
    <div
      data-testid="gps-map-mode-bar"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`relative z-30 flex w-max max-w-full flex-wrap items-center justify-center gap-1.5 select-none pointer-events-auto ${embedded ? '' : 'px-2 py-1 rounded-xl bg-lmu-strip/95 border border-lmu-border backdrop-blur-md shadow-xl'} ${className}`}
    >
      {onChangeColorBy && (
        <div className="flex items-center gap-1">
          {modes.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeColorBy(colorBy === mode ? 'default' : mode)}
              title={colorBy === mode ? 'Turn off heat map and show normal line colors'
                : mode === 'gainLoss' ? 'Local time gained or lost against baseline' : `Color by ${mode}`}
              aria-pressed={colorBy === mode}
              className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors cursor-pointer ${
                colorBy === mode ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text'
              } ${FOCUS_RING}`}
            >
              {mode === 'pedal' ? 'Pedal' : mode === 'speed' ? 'Speed' : mode === 'delta' ? 'Delta' : 'Gain / Loss'}
            </button>
          ))}
        </div>
      )}

      {hasBaseline && onChangeGhostSync && (
        <div role="group" aria-label="Ghost sync" data-testid="ghost-sync-toggle" className="flex items-center gap-0.5 pl-1 border-l border-lmu-border">
          {GHOST_SYNC_MODES.map(mode => (
            <button key={mode} type="button" onClick={() => onChangeGhostSync(mode)} aria-pressed={ghostSync === mode}
              title={syncTitle(mode, ghostAnchorSet)}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                ghostSync === mode ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text'
              } ${FOCUS_RING}`}>
              {SYNC_LABELS[mode]}
            </button>
          ))}
        </div>
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
          aria-label={showFrictionCircle ? 'Hide friction circle' : 'Show friction circle'}
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
