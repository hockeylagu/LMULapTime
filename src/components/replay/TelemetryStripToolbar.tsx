import React, { useState } from 'react';
import { Play, ZoomIn, Activity } from 'lucide-react';
import { TelemetryResolutionPopover } from './TelemetryResolutionPopover.js';

export interface TelemetryStripToolbarProps {
  interactionMode: 'scrub' | 'zoom';
  onChangeInteractionMode: (mode: 'scrub' | 'zoom') => void;
  isZoomed: boolean;
  viewStart: number;
  viewEnd: number;
  spanTimeSec?: number;
  onResetZoom: () => void;
  hasBaseline: boolean;
  baselineLabel?: string;
  telemetryResolution?: number;
  onChangeResolution?: (res: number) => void;
  pointsCount?: number;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  isFullResolution?: boolean;
}

export const TelemetryStripToolbar: React.FC<TelemetryStripToolbarProps> = React.memo(({
  interactionMode,
  onChangeInteractionMode,
  isZoomed,
  viewStart,
  viewEnd,
  spanTimeSec,
  onResetZoom,
  hasBaseline,
  baselineLabel,
  telemetryResolution,
  onChangeResolution,
  pointsCount,
  rawPointsCount,
  rawSampleRateHz,
  isFullResolution,
}) => {
  const [isResPopoverOpen, setIsResPopoverOpen] = useState<boolean>(false);

  return (
    <div className="pt-3.5 px-3 py-1 flex items-center justify-between bg-[#080c14] border-b border-lmu-border/40 shrink-0 select-none z-[60]">
      <div className="flex items-center gap-2">
        {/* Mode Switch Pills */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInteractionMode('scrub');
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
              interactionMode === 'scrub'
                ? 'bg-sky-500 text-white font-bold shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                : 'text-lmu-muted hover:text-white'
            }`}
            title="Scrub timeline (Tip: hold Shift while dragging to zoom)"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            Scrub
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInteractionMode('zoom');
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
              interactionMode === 'zoom'
                ? 'bg-sky-500 text-white font-bold shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                : 'text-lmu-muted hover:text-white'
            }`}
            title="Drag to zoom into a track section"
          >
            <ZoomIn className="w-2.5 h-2.5" />
            Zoom Range
          </button>
        </div>

        {onChangeResolution && (
          <div className="relative z-[70]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsResPopoverOpen(prev => !prev);
              }}
              className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono text-[10px] transition-all cursor-pointer border ${
                isResPopoverOpen
                  ? 'bg-purple-600/40 border-purple-400/80 text-purple-200 font-bold shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                  : isFullResolution || telemetryResolution === 0
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
              }`}
              title="Inspect replay telemetry resolution and configure recording fidelity"
            >
              <Activity className="w-2.5 h-2.5 text-purple-400" />
              <span>
                {rawSampleRateHz ? `${rawSampleRateHz}Hz` : 'Rate'} • {isFullResolution || telemetryResolution === 0 ? 'Full Raw' : `${telemetryResolution || pointsCount || 0} pts`}
              </span>
            </button>

          {isResPopoverOpen && (
            <TelemetryResolutionPopover
              isOpen={isResPopoverOpen}
              onClose={() => setIsResPopoverOpen(false)}
              telemetryResolution={telemetryResolution ?? 2400}
              onChangeResolution={onChangeResolution ?? (() => {})}
              pointsCount={pointsCount ?? 0}
              rawPointsCount={rawPointsCount}
              rawSampleRateHz={rawSampleRateHz}
              isFullResolution={isFullResolution}
              isZoomed={isZoomed}
              zoomedPointsCount={isZoomed ? viewEnd - viewStart + 1 : undefined}
            />
          )}
        </div>
      )}

        {/* Zoomed State Indicator */}
        {isZoomed && (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10 text-[10px] font-mono">
            <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
              Zoomed: Frames {viewStart + 1}–{viewEnd + 1}
            </span>
            {spanTimeSec !== undefined && (
              <span className="text-lmu-muted hidden sm:inline">
                ({spanTimeSec.toFixed(2)}s window)
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetZoom();
              }}
              className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-bold transition-all text-[10px] flex items-center gap-1"
              title="Reset zoom to full lap (or double-click chart)"
            >
              ✕ Reset Lap
            </button>
          </div>
        )}
      </div>

      {/* Comparison Legend Indicator */}
      {hasBaseline && (
        <div className="flex items-center gap-2 text-[10px] font-mono select-none">
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#38bdf8] rounded" />
            <span className="text-sky-400 font-bold">Primary</span>
          </div>
          <span className="text-white/20">vs</span>
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#f59e0b] rounded border-b border-dashed border-[#f59e0b]" />
            <span className="text-amber-400 font-bold truncate max-w-[140px]">
              {baselineLabel || 'Baseline'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
