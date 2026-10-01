import React, { useState } from 'react';
import { MousePointer2, ZoomIn, Expand, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
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
    <div className="px-2 py-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 bg-lmu-surface border-b border-lmu-border/40 shrink-0 select-none z-[60]">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {headerContent && (
          <div className="min-w-0 flex items-center shrink-0">
            {headerContent}
          </div>
        )}

        {isZoomed && (
          <span className="text-[10px] font-mono text-lmu-muted" title={`Zoomed: Frames ${viewStart + 1}–${viewEnd + 1}`}>
            Zoomed: {spanTimeSec !== undefined ? `${spanTimeSec.toFixed(2)}s` : 'selected range'}
          </span>
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

        {/* What dragging the chart does; restoring the full lap stays beside it. */}
        <div role="group" aria-label="Chart drag mode" className="flex items-center gap-0.5 text-[10px] font-mono">
          <span className="text-lmu-muted mr-1">Drag:</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInteractionMode('scrub');
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
              interactionMode === 'scrub'
                ? 'bg-lmu-raised text-white font-bold'
                : 'text-lmu-muted hover:text-white'
            }`}
            aria-pressed={interactionMode === 'scrub'}
            title="Click or drag to move the cursor. Shift + drag selects a zoom range."
          >
            <MousePointer2 className="w-3 h-3" />
            Move cursor
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInteractionMode('zoom');
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
              interactionMode === 'zoom'
                ? 'bg-lmu-raised text-white font-bold'
                : 'text-lmu-muted hover:text-white'
            }`}
            aria-pressed={interactionMode === 'zoom'}
            title="Drag across the chart to zoom into a range. Double-click to show the full lap."
          >
            <ZoomIn className="w-2.5 h-2.5" />
            Zoom range
          </button>
          <button type="button" disabled={!isZoomed}
            onClick={(event) => { event.stopPropagation(); onResetZoom(); }}
            title="Show the full lap. You can also double-click the chart."
            className="ml-1 pl-2 pr-1 py-0.5 border-l border-lmu-border flex items-center gap-1 text-lmu-muted hover:text-white disabled:opacity-40 disabled:cursor-default">
            <Expand className="w-3 h-3" /> Full lap
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
              className={`px-2 py-0.5 rounded flex items-center gap-1 font-mono text-[10px] cursor-pointer text-lmu-muted hover:text-white ${isResPopoverOpen ? 'bg-lmu-raised text-white' : ''}`}
              title="Inspect replay telemetry resolution and configure recording fidelity"
            >
              <Activity className="w-2.5 h-2.5 text-lmu-muted" />
              <span className="whitespace-nowrap">
                <span className={source === 'duckdb' ? 'text-lmu-warn-soft' : 'text-lmu-muted'}>{rawSampleRateHz ? `${rawSampleRateHz}Hz` : 'Rate'}</span>{isFullResolution || telemetryResolution === 'full' ? ' • Full Raw' : ''}
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
            className="p-1 rounded hover:bg-white/5 text-lmu-muted hover:text-lmu-info-soft disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer"
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
            className="p-1 rounded hover:bg-white/5 text-lmu-muted hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer"
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
