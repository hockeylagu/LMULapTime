import React, { useState } from 'react';
import { Play, ZoomIn, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { TelemetryResolutionPopover } from './TelemetryResolutionPopover.js';
import { TelemetryPreset } from './presets/telemetryPresets.js';
import { TelemetryPresetSelector } from './presets/TelemetryPresetSelector.js';
import { DEFAULT_TELEMETRY_RESOLUTION, TelemetryResolution } from './telemetryResolution.js';

export interface TelemetryStripToolbarProps {
  interactionMode: 'scrub' | 'zoom';
  onChangeInteractionMode: (mode: 'scrub' | 'zoom') => void;
  isZoomed: boolean;
  viewStart: number;
  viewEnd: number;
  spanTimeSec?: number;
  onResetZoom: () => void;
  onStepIndex?: (delta: number) => void;
  telemetryResolution?: TelemetryResolution;
  onChangeResolution?: (res: TelemetryResolution) => void;
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
            <span className="px-1.5 py-px rounded bg-lmu-info-strong/20 text-lmu-info-soft font-bold">
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
              className="px-2 py-0.5 rounded bg-lmu-loss-strong/20 hover:bg-lmu-loss-strong/30 border border-lmu-loss-strong/50 text-lmu-loss-soft font-bold transition-all text-[10px] flex items-center gap-1"
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
                ? 'bg-lmu-info-strong text-lmu-deep font-bold'
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
                ? 'bg-lmu-info-strong text-lmu-deep font-bold'
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
                telemetryResolution === 'standard' && !isFullResolution
                  ? isResPopoverOpen
                    ? 'bg-lmu-info-strong/30 border-lmu-info/70 text-lmu-info-soft font-bold'
                    : 'bg-lmu-info-strong/10 border-lmu-info-strong/30 text-lmu-info-soft hover:bg-lmu-info-strong/20'
                  : telemetryResolution === 'high' && !isFullResolution
                  ? isResPopoverOpen
                    ? 'bg-lmu-gain-strong/30 border-lmu-gain/70 text-lmu-gain-soft font-bold'
                    : 'bg-lmu-gain-strong/15 border-lmu-gain-strong/40 text-lmu-gain-soft hover:bg-lmu-gain-strong/25'
                  : isResPopoverOpen
                  ? 'bg-lmu-purple-strong/40 border-lmu-purple/80 text-lmu-purple-soft font-bold'
                  : 'bg-lmu-purple-strong/10 border-lmu-purple-strong/30 text-lmu-purple-soft hover:bg-lmu-purple-strong/20'
              }`}
              title="Inspect replay telemetry resolution and configure recording fidelity"
            >
              <Activity className={`w-2.5 h-2.5 ${
                telemetryResolution === 'standard' && !isFullResolution
                  ? 'text-lmu-info'
                  : telemetryResolution === 'high' && !isFullResolution
                  ? 'text-lmu-gain'
                  : 'text-lmu-purple'
              }`} />
              <span className="whitespace-nowrap">
                {rawSampleRateHz ? `${rawSampleRateHz}Hz` : 'Rate'} • {isFullResolution || telemetryResolution === 'full' ? 'Full Raw' : `${(pointsCount || 0).toLocaleString()} pts`}
              </span>
            </button>

            {isResPopoverOpen && (
              <TelemetryResolutionPopover
                isOpen={isResPopoverOpen}
                onClose={() => setIsResPopoverOpen(false)}
                telemetryResolution={telemetryResolution ?? DEFAULT_TELEMETRY_RESOLUTION}
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
            className="p-1 rounded bg-black/40 hover:bg-lmu-info-strong/20 text-lmu-muted hover:text-lmu-info-soft disabled:opacity-25 disabled:pointer-events-none transition-all border border-white/10 cursor-pointer"
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
            className="p-1 rounded bg-black/40 hover:bg-lmu-info-strong/20 text-lmu-muted hover:text-lmu-info-soft disabled:opacity-25 disabled:pointer-events-none transition-all border border-white/10 cursor-pointer"
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
