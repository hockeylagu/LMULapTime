import React from 'react';
import { Play, ZoomIn } from 'lucide-react';

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
}

export const TelemetryStripToolbar: React.FC<TelemetryStripToolbarProps> = ({
  interactionMode,
  onChangeInteractionMode,
  isZoomed,
  viewStart,
  viewEnd,
  spanTimeSec,
  onResetZoom,
  hasBaseline,
  baselineLabel,
}) => {
  return (
    <div className="pt-3.5 px-3 py-1 flex items-center justify-between bg-[#080c14] border-b border-lmu-border/40 shrink-0 select-none z-20">
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
            title="Click and drag to select a range to zoom into"
          >
            <ZoomIn className="w-2.5 h-2.5" />
            Zoom Range
          </button>
        </div>

        {/* Zoom status indicator & Reset Button */}
        {isZoomed ? (
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Zoomed: Frames {viewStart + 1}–{viewEnd + 1}
              {spanTimeSec !== undefined && (
                <span className="text-lmu-muted">({spanTimeSec.toFixed(2)}s)</span>
              )}
            </span>
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
            <span className="hidden xl:inline text-[9px] text-lmu-muted/70 italic">
              (Double-click chart to reset)
            </span>
          </div>
        ) : (
          <span className="hidden sm:inline text-[9px] text-lmu-muted font-mono">
            {interactionMode === 'scrub' ? 'Drag to scrub • Hold Shift to zoom range' : 'Drag across chart to select zoom range'}
          </span>
        )}
      </div>

      {/* Comparison Legend Overlay */}
      {hasBaseline && (
        <div className="flex items-center gap-2 bg-[#090d16] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-mono">
          <div className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[#38bdf8] rounded" />
            <span className="text-sky-300 font-bold">Primary</span>
          </div>
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
};
