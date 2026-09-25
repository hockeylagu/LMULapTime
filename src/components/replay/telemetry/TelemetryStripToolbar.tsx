import React, { useState } from 'react';
import { Play, ZoomIn, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { TelemetryResolutionPopover } from './TelemetryResolutionPopover.js';
import { TelemetryPreset } from './telemetryPresets.js';
import { TelemetryPresetSelector } from './TelemetryPresetSelector.js';

export interface TelemetryStripToolbarProps {
  interactionMode: 'scrub' | 'zoom';
  onChangeInteractionMode: (mode: 'scrub' | 'zoom') => void;
  isZoomed: boolean;
  viewStart: number;
  viewEnd: number;
  spanTimeSec?: number;
  onResetZoom: () => void;
  onStepIndex?: (delta: number) => void;
  telemetryResolution?: number;
  onChangeResolution?: (res: number) => void;
  pointsCount?: number;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  isFullResolution?: boolean;
  currentTimeSec?: number;
  currentFrame?: number;
  totalFrames?: number;
  headerContent?: React.ReactNode;
  presets?: TelemetryPreset[];
  activePresetId?: string;
  onSelectPreset?: (presetId: string) => void;
  onOpenManageModal?: () => void;
  source?: 'vcr' | 'duckdb';
  duckdbFilename?: string;
  hasDuckDb?: boolean;
  duckdbUnavailableReason?: string;
  onSelectSource?: (source: 'duckdb' | 'vcr') => void;
}

export const TelemetryStripToolbar: React.FC<TelemetryStripToolbarProps> = React.memo(({
  interactionMode,
  onChangeInteractionMode,
  isZoomed,
  viewStart,
  viewEnd,
  spanTimeSec,
  onResetZoom,
  onStepIndex,
  telemetryResolution,
  onChangeResolution,
  pointsCount,
  rawPointsCount,
  rawSampleRateHz,
  vcrRawPointsCount,
  vcrRawSampleRateHz,
  duckdbRawPointsCount,
  duckdbRawSampleRateHz,
  isFullResolution,
  currentTimeSec,
  currentFrame,
  totalFrames,
  headerContent,
  presets,
  activePresetId,
  onSelectPreset,
  onOpenManageModal,
  source,
  duckdbFilename,
  hasDuckDb,
  duckdbUnavailableReason,
  onSelectSource,
}) => {
  const [isResPopoverOpen, setIsResPopoverOpen] = useState<boolean>(false);

  const formatElapsed = (sec?: number): string => {
    const s = sec !== undefined && isFinite(sec) && sec >= 0 ? sec : 0;
    const mins = Math.floor(s / 60);
    const rem = (s % 60).toFixed(3).padStart(6, '0');
    return `${mins}:${rem}`;
  };

  return (
    <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 bg-lmu-surface border-b border-lmu-border/40 shrink-0 select-none z-[60]">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {headerContent && (
          <div className="min-w-0 flex items-center shrink-0">
            {headerContent}
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

      <div className="flex items-center gap-2 shrink-0">
        {presets && presets.length > 0 && activePresetId && onSelectPreset && onOpenManageModal && (
          <TelemetryPresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSelectPreset={onSelectPreset}
            onOpenManageModal={onOpenManageModal}
          />
        )}

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
                telemetryResolution === 1200 && !isFullResolution
                  ? isResPopoverOpen
                    ? 'bg-sky-500/30 border-sky-400/70 text-sky-200 font-bold shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                    : 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                  : telemetryResolution === 2400 && !isFullResolution
                  ? isResPopoverOpen
                    ? 'bg-emerald-500/30 border-emerald-400/70 text-emerald-200 font-bold shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                  : isResPopoverOpen
                  ? 'bg-purple-600/40 border-purple-400/80 text-purple-200 font-bold shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                  : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
              }`}
              title="Inspect replay telemetry resolution and configure recording fidelity"
            >
              <Activity className={`w-2.5 h-2.5 ${
                telemetryResolution === 1200 && !isFullResolution
                  ? 'text-sky-400'
                  : telemetryResolution === 2400 && !isFullResolution
                  ? 'text-emerald-400'
                  : 'text-purple-400'
              }`} />
              <span className="whitespace-nowrap">
                {rawSampleRateHz ? `${rawSampleRateHz}Hz` : 'Rate'} • {isFullResolution || telemetryResolution === 0 ? 'Full Raw' : `${(pointsCount || telemetryResolution || 0).toLocaleString()} pts`}
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
                vcrRawPointsCount={vcrRawPointsCount}
                vcrRawSampleRateHz={vcrRawSampleRateHz}
                duckdbRawPointsCount={duckdbRawPointsCount}
                duckdbRawSampleRateHz={duckdbRawSampleRateHz}
                isFullResolution={isFullResolution}
                isZoomed={isZoomed}
                zoomedPointsCount={isZoomed ? viewEnd - viewStart + 1 : undefined}
                source={source}
                duckdbFilename={duckdbFilename}
                hasDuckDb={hasDuckDb}
                duckdbUnavailableReason={duckdbUnavailableReason}
                onSelectSource={onSelectSource}
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-lmu-muted pl-2 border-l border-white/10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStepIndex?.(-1);
            }}
            disabled={currentFrame !== undefined && currentFrame <= 1}
            className="p-1 rounded bg-black/40 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 disabled:opacity-25 disabled:pointer-events-none transition-all border border-white/10 cursor-pointer"
            title="Move scrub line backward (Left Arrow, Shift for 10 frames)"
            aria-label="Step backward (Left Arrow)"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span className="text-white font-bold">{formatElapsed(currentTimeSec)}</span>
          <span className="hidden sm:inline">
            Frame {currentFrame ?? 1} / {totalFrames ?? 1}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStepIndex?.(1);
            }}
            disabled={currentFrame !== undefined && totalFrames !== undefined && currentFrame >= totalFrames}
            className="p-1 rounded bg-black/40 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 disabled:opacity-25 disabled:pointer-events-none transition-all border border-white/10 cursor-pointer"
            title="Move scrub line forward (Right Arrow, Shift for 10 frames)"
            aria-label="Step forward (Right Arrow)"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
});
