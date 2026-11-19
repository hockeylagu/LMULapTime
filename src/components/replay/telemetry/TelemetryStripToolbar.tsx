import React, { useCallback, useId, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { ChartZoomControls, toolbarButton } from './ChartZoomControls.js';

const DIVIDER = <span aria-hidden="true" className="mx-1.5 h-4 w-px shrink-0 bg-lmu-border" />;
import { GpsMapPlaybackStrip } from '../map/telemetry/GpsMapPlaybackStrip.js';
import { TelemetryResolutionPopover } from './TelemetryResolutionPopover.js';
import { TelemetryPreset } from './presets/telemetryPresets.js';
import { TelemetryPresetSelector } from './presets/TelemetryPresetSelector.js';
import { DEFAULT_TELEMETRY_RESOLUTION, TelemetryResolution } from './telemetryResolution.js';
import { ReplayShortcutHelp } from '../ReplayShortcutHelp.js';
import { useOutsidePress } from '../../common/dropdown/useAnchoredPanel.js';

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
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  isFullResolution?: boolean;
  /** Lap time at the cursor. */
  currentTimeSec?: number;
  /** Distance from the start line at the cursor. */
  currentDistM?: number;
  currentFrame?: number;
  totalFrames?: number;
  headerContent?: React.ReactNode;
  markerButton?: React.ReactNode;
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
  vcrRawPointsCount,
  vcrRawSampleRateHz,
  duckdbRawPointsCount,
  duckdbRawSampleRateHz,
  isFullResolution,
  currentTimeSec,
  currentDistM,
  currentFrame,
  totalFrames,
  headerContent,
  markerButton,
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
  const resolutionRef = useRef<HTMLDivElement>(null);
  const resolutionTriggerRef = useRef<HTMLButtonElement>(null);
  const resolutionId = useId();
  const closeResolution = useCallback(() => setIsResPopoverOpen(false), []);
  useOutsidePress(isResPopoverOpen, [resolutionRef], closeResolution);
  const servedRate = source === 'duckdb' ? duckdbRawSampleRateHz : vcrRawSampleRateHz;

  return (
    // Short of room, the controls move below the lap readout as one group, instead of cutting or covering it.
    <div className="px-2 py-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 whitespace-nowrap bg-lmu-surface border-b border-lmu-border/40 shrink-0 select-none z-[60]">
      <div className="flex items-center gap-2">
        {headerContent && (
          <div className="flex items-center">
            {headerContent}
          </div>
        )}

        {isZoomed && (
          <span className="text-[11px] text-lmu-muted" title={`Zoomed: Frames ${viewStart + 1}–${viewEnd + 1}`}>
            Zoomed: <span className="font-mono">{spanTimeSec !== undefined ? `${spanTimeSec.toFixed(2)} s` : 'selected range'}</span>
          </span>
        )}
      </div>

      {/* One compact scale (24px controls, 11px semibold labels, monospace only for numbers), groups split by a hairline. */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {presets && presets.length > 0 && activePresetId && onSelectPreset && onOpenManageModal && <>
          <TelemetryPresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSelectPreset={onSelectPreset}
            onOpenManageModal={onOpenManageModal}
          />
          {DIVIDER}
        </>}

        <ChartZoomControls compact interactionMode={interactionMode} onChangeInteractionMode={onChangeInteractionMode} isZoomed={isZoomed} onResetZoom={onResetZoom} />
        {markerButton}
        {DIVIDER}
        {onChangeResolution && (
          <div ref={resolutionRef} className="relative z-[70]" onKeyDown={(event) => {
            if (event.key !== 'Escape' || !isResPopoverOpen) return;
            event.preventDefault();
            event.stopPropagation();
            closeResolution();
            resolutionTriggerRef.current?.focus();
          }}>
            <button
              ref={resolutionTriggerRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsResPopoverOpen(prev => !prev);
              }}
              aria-haspopup="dialog"
              aria-expanded={isResPopoverOpen}
              aria-controls={resolutionId}
              className={`${toolbarButton(true)} ${isResPopoverOpen ? 'bg-lmu-raised text-lmu-text' : ''}`}
              title="Inspect replay telemetry resolution and configure recording fidelity"
            >
              <Activity aria-hidden="true" className="w-3 h-3" />
              <span className="whitespace-nowrap">
                <span className={`font-mono ${source === 'duckdb' ? 'text-lmu-warn-soft' : ''}`}>{servedRate ? `${servedRate} Hz` : 'Rate'}</span>{isFullResolution || telemetryResolution === 'full' ? ' · Full raw' : ''}
              </span>
            </button>

            {isResPopoverOpen && (
              <TelemetryResolutionPopover
                id={resolutionId}
                isOpen={isResPopoverOpen}
                onClose={() => { closeResolution(); resolutionTriggerRef.current?.focus(); }}
                telemetryResolution={telemetryResolution ?? DEFAULT_TELEMETRY_RESOLUTION}
                onChangeResolution={onChangeResolution ?? (() => {})}
                pointsCount={pointsCount ?? 0}
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

        <ReplayShortcutHelp className="h-6 w-6 text-[11px]" />
        {DIVIDER}
        <GpsMapPlaybackStrip compact elapsedSec={currentTimeSec ?? 0} distanceM={currentDistM ?? 0}
          onStep={onStepIndex} atStart={(currentFrame ?? 1) <= 1} atEnd={totalFrames !== undefined && (currentFrame ?? 1) >= totalFrames} />
      </div>
    </div>
  );
});
