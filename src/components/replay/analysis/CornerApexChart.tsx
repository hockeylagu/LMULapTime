import React from 'react';
import { X } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../server/core/types';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
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

function formatCornerType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
      <div className={`flex flex-col bg-[#060910] rounded-xl border border-lmu-border/70 overflow-hidden shadow-lg p-2 gap-1.5 shrink-0 ${className}`}>
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="inline-flex items-center h-5 px-1.5 rounded bg-sky-500/20 text-sky-400 font-mono font-bold text-xs shrink-0 whitespace-nowrap">
              Turn {corner.cornerNumber}
            </span>
            {corner.cornerType && <span className="inline-flex items-center h-5 text-xs font-medium text-slate-300 shrink-0 whitespace-nowrap">{formatCornerType(corner.cornerType)}</span>}
            {corner.turnDirection && corner.cornerAngleDeg !== undefined && (
              <span className="inline-flex items-center h-5 text-xs text-lmu-muted font-mono shrink-0 whitespace-nowrap">{corner.cornerAngleDeg}° {corner.turnDirection === 'left' ? '↰' : '↱'}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenCornersTab && (
              <button
                type="button"
                onClick={onOpenCornersTab}
                className="inline-flex items-center h-5 px-2 rounded bg-sky-600/35 hover:bg-sky-600/50 border border-sky-500/40 text-sky-300 text-[10px] font-medium transition-colors"
                title="View in Corners Tab"
                aria-label="View corner technique in Corners tab"
              >
                Full Analysis →
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close corner detail" className="inline-flex items-center justify-center w-5 h-5 text-slate-400 hover:text-white rounded hover:bg-slate-800">
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
    <div className={`flex flex-col bg-[#060910] overflow-hidden ${className}`}>
      {/* Master Unified Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0f1d] border-b border-lmu-border/60 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center h-6 px-2 rounded bg-sky-500/20 border border-sky-500/40 text-sky-400 font-mono font-bold text-xs shrink-0 whitespace-nowrap" title={`Turn ${corner.cornerNumber} Apex Analysis`}>
            Turn {corner.cornerNumber}
          </span>
          {corner.cornerType && (
            <span className="inline-flex items-center h-6 text-xs font-semibold text-white shrink-0 whitespace-nowrap">{formatCornerType(corner.cornerType)}</span>
          )}
          {corner.turnDirection && corner.cornerAngleDeg !== undefined && (
            <span
              className="inline-flex items-center h-6 text-xs text-slate-300 font-mono capitalize shrink-0 whitespace-nowrap"
              title={`Angle: ${corner.cornerAngleDeg}°, Direction: ${corner.turnDirection}${corner.effectiveRadiusM ? `, Radius: ~${corner.effectiveRadiusM}m` : ''}`}
            >
              {corner.cornerAngleDeg}° {corner.turnDirection === 'left' ? 'left ↰' : 'right ↱'}
              {corner.effectiveRadiusM ? ` (R≈${corner.effectiveRadiusM}m)` : ''}
            </span>
          )}
          <span className="inline-flex items-center h-6 px-2 rounded bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300 shrink-0 whitespace-nowrap" title={`Corner length: ${corner.exitDistM - corner.entryDistM}m`}>
            {corner.exitDistM - corner.entryDistM}m
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {corner.cornerQualityScore !== undefined && (
            <span className={`inline-flex items-center h-6 px-2.5 rounded text-xs font-mono font-bold border whitespace-nowrap ${
              corner.cornerQualityScore >= 80 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              corner.cornerQualityScore >= 60 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
              'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              Score {corner.cornerQualityScore}/100
            </span>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close corner detail" className="inline-flex items-center justify-center w-6 h-6 text-slate-400 hover:text-white rounded hover:bg-slate-800/60 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Speed & Handling Profile Chart with Understeer / Scrub / Oversteer overlay */}
      <div className="p-2 bg-[#060910]">
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
