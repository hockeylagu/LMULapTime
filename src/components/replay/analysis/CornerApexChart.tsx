import React from 'react';
import { X } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { CornerTechniqueDeck } from './CornerTechniqueDeck.js';
import { CornerSpeedGraph } from './CornerSpeedGraph.js';
import { TrackBoundaryGeometry } from '../map/useTrackBoundaryGeometry.js';

export interface CornerApexChartProps {
  corner: CornerSegmentComparison;
  primaryPoints: ReplayTrajectoryPoint[];
  primaryDists: number[];
  baselinePoints?: ReplayTrajectoryPoint[] | null;
  baselineDists?: number[];
  isCompareMode?: boolean;
  compact?: boolean;
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
  replayName?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  onOpenCornersTab?: () => void;
  onClose?: () => void;
  className?: string;
}

export const CornerApexChart: React.FC<CornerApexChartProps> = ({
  corner,
  primaryPoints,
  primaryDists,
  baselinePoints,
  baselineDists,
  isCompareMode = false,
  compact = false,
  currentIndex,
  onSelectIndex,
  onOpenCornersTab,
  onClose,
  className = '',
}) => {
  const currentDistM = currentIndex !== undefined && currentIndex >= 0 && currentIndex < primaryDists.length
    ? primaryDists[currentIndex]
    : undefined;

  if (compact) {
    return (
      <div className={`flex flex-col bg-lmu-deep border-t border-lmu-border/60 overflow-hidden px-2 py-1 gap-1 shrink-0 ${className}`}>
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="inline-flex items-center h-5 px-1.5 rounded bg-lmu-info-strong/20 text-lmu-info font-mono font-bold text-xs shrink-0 whitespace-nowrap">
              Turn {corner.cornerNumber}
            </span>
            {corner.turnDirection && corner.cornerAngleDeg !== undefined && (
              <span className="inline-flex items-center h-5 text-xs text-lmu-muted font-mono shrink-0 whitespace-nowrap">{corner.cornerAngleDeg}° {corner.turnDirection === 'left' ? '↰' : '↱'}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenCornersTab && (
              <button
                type="button"
                onClick={onOpenCornersTab}
                className="inline-flex items-center h-5 px-2 rounded bg-lmu-info-strong/35 hover:bg-lmu-info-strong/50 border border-lmu-info-strong/40 text-lmu-info-soft text-[10px] font-medium transition-colors"
                title="View in Corners Tab"
                aria-label="View corner technique in Corners tab"
              >
                Full Analysis →
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close corner detail" className="inline-flex items-center justify-center w-5 h-5 text-lmu-muted hover:text-white rounded hover:bg-lmu-raised">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Speed Trend Micro-Line with scrub */}
        <CornerSpeedGraph
          corner={corner}
          primaryPoints={primaryPoints}
          primaryDists={primaryDists}
          baselinePoints={baselinePoints ?? undefined}
          baselineDists={baselineDists}
          currentIndex={currentIndex}
          currentDistM={currentDistM}
          onSelectIndex={onSelectIndex}
          compact={true}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-lmu-deep overflow-hidden ${className}`}>
      {/* Master Unified Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-lmu-border/60 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center h-6 text-lmu-text-soft font-mono font-bold text-xs shrink-0 whitespace-nowrap" title={`Turn ${corner.cornerNumber} Apex Analysis`}>
            Turn {corner.cornerNumber}
          </span>
          {corner.turnDirection && corner.cornerAngleDeg !== undefined && (
            <span
              className="inline-flex items-center h-6 text-xs text-lmu-muted font-mono capitalize shrink-0 whitespace-nowrap"
              title={`Angle: ${corner.cornerAngleDeg}°, Direction: ${corner.turnDirection}${corner.effectiveRadiusM ? `, Radius: ~${corner.effectiveRadiusM}m` : ''}`}
            >
              {corner.cornerAngleDeg}° {corner.turnDirection === 'left' ? 'left ↰' : 'right ↱'}
              {corner.effectiveRadiusM ? ` (R≈${corner.effectiveRadiusM}m)` : ''}
            </span>
          )}
          <span className="inline-flex items-center h-6 text-xs font-mono text-lmu-muted shrink-0 whitespace-nowrap" title={`Corner length: ${corner.exitDistM - corner.entryDistM}m`}>
            {corner.exitDistM - corner.entryDistM}m
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close corner detail" className="inline-flex items-center justify-center w-6 h-6 text-lmu-muted hover:text-white rounded hover:bg-lmu-raised/60 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Speed & Handling Profile Chart with Understeer / Scrub / Oversteer overlay */}
      <div className="bg-lmu-deep">
        <CornerSpeedGraph
          corner={corner}
          primaryPoints={primaryPoints}
          primaryDists={primaryDists}
          baselinePoints={baselinePoints ?? undefined}
          baselineDists={baselineDists}
          currentIndex={currentIndex}
          currentDistM={currentDistM}
          onSelectIndex={onSelectIndex}
        />
      </div>

      {/* Comprehensive Phase-Based Telemetry & Technique Deck */}
      <CornerTechniqueDeck corner={corner} isCompareMode={isCompareMode} />
    </div>
  );
};
