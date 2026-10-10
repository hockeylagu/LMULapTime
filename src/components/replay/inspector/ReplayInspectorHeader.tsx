import React from 'react';
import type { CompareLapPagination } from './compare/CompareLapPagination.js';
import { X, Play, Pause, RotateCcw, Flag, ArrowLeftRight, Users, ChevronDown, LoaderCircle } from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ComparableLap } from '../../../../shared/types/index.js';
import { CompareLapFilter, ReplayCompareLapPicker } from './compare/ReplayCompareLapPicker.js';
import { ReplayCompareButton } from './compare/ReplayCompareButton.js';
import { ReplayInspectorTitle } from './ReplayInspectorTitle.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface ReplayInspectorHeaderProps {
  onClose: () => void;
  sessionId: string | null;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
  onSelectLap: (lapNum: number) => void;
  drivers: ReplayDriverEntry[];
  selectedDriverSlot: number | null;
  onSelectDriver: (slot: number) => void;
  isCompareMode: boolean;
  onToggleCompare: () => void;
  onSwapBaseline?: () => void;
  onRemoveCompare: () => void;
  baselineSessionId: string | null;
  baselineLapNumber: number | null;
  baselineDriverName?: string | null;
  baselineTrajectory?: ReplayTrajectoryData | null;
  isComparePickerOpen: boolean;
  onCloseComparePicker: () => void;
  availableCompareLaps: ComparableLap[];
  compareLapFilter: CompareLapFilter;
  isCompareLapsLoading: boolean;
  comparePagination?: CompareLapPagination;
  compareLapsError?: string | null;
  onRetryCompareLaps?: () => void;
  onRetryBaseline?: () => void;
  onChangeCompareLapFilter: (filter: CompareLapFilter) => void;
  onSelectCompareLap: (lap: ComparableLap) => void;
  isBaselineLoading: boolean;
  baselineError?: string | null;
  isTrajLoading: boolean;
  isLoading?: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRewind: () => void;
  playbackSpeed: number;
  onSelectPlaybackSpeed: (speed: number) => void;
  formatLapTime: (sec?: number | null) => string;
}

export const ReplayInspectorHeader: React.FC<ReplayInspectorHeaderProps> = React.memo(({
  onClose, sessionId, metadata, trajectory, onSelectLap,
  drivers, selectedDriverSlot, onSelectDriver,
  isCompareMode, onToggleCompare, onSwapBaseline, onRemoveCompare,
  baselineSessionId, baselineLapNumber, baselineDriverName, baselineTrajectory, isComparePickerOpen, onCloseComparePicker, availableCompareLaps, compareLapFilter,
  isCompareLapsLoading, comparePagination, compareLapsError, onRetryCompareLaps, onRetryBaseline, onChangeCompareLapFilter, onSelectCompareLap,
  isBaselineLoading, baselineError, isTrajLoading, isLoading = false,
  isPlaying, onTogglePlay, onRewind, playbackSpeed, onSelectPlaybackSpeed, formatLapTime,
}) => {
  const baselineSummary = baselineTrajectory?.laps?.find(l => l.lapNumber === (baselineTrajectory.currentLap ?? baselineLapNumber)) || baselineTrajectory?.laps?.[0];
  const isPrimaryBusy = isLoading || isTrajLoading;
  const selectedDriver = drivers.find(driver => driver.slot === selectedDriverSlot);
  const driverLabel = selectedDriver ? `${selectedDriver.carNumber ? `#${selectedDriver.carNumber} ` : ''}${selectedDriver.name}${selectedDriver.isPlayer ? ' (You)' : ''}` : '';

  return (
    <header className="relative min-h-14 py-1.5 px-4 bg-lmu-strip border-b border-lmu-border grid grid-cols-[minmax(320px,1fr)_auto_auto] gap-6 items-center shrink-0 z-[80]">
      {/* Left: Back button + Title & Info */}
      <ReplayInspectorTitle
        onClose={onClose}
        metadata={metadata}
        trajectory={trajectory}
        selectedDriver={selectedDriver}
      />

      {/* Center: Driver Selector, Lap Selector & Live State */}
      <div className="flex items-center gap-2 justify-self-center min-w-0">
          <label aria-busy={isPrimaryBusy} className="relative flex h-8 items-center gap-2 pl-2.5 rounded-lg bg-lmu-bg border border-lmu-border hover:border-lmu-rule-strong transition-colors w-[220px] shrink-0 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-lmu-accent-text has-[select:disabled]:text-lmu-faint">
            {isPrimaryBusy ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 text-lmu-muted animate-spin shrink-0" /> : <Users aria-hidden="true" className="w-3.5 h-3.5 text-lmu-accent-text shrink-0" />}
            <select
              aria-label="Select Driver"
              title={driverLabel || (isLoading ? 'Loading drivers…' : 'No drivers available')}
              disabled={isPrimaryBusy || drivers.length === 0}
              value={selectedDriverSlot ?? ''}
              onChange={e => onSelectDriver(parseInt(e.target.value, 10))}
              className="appearance-none bg-transparent text-xs font-semibold text-white outline-none cursor-pointer min-w-0 w-full h-full pr-7 truncate disabled:cursor-wait"
            >
              {selectedDriverSlot === null && <option value="" disabled>{isLoading ? 'Loading drivers…' : drivers.length ? 'Select driver' : 'No drivers available'}</option>}
              {drivers.filter(driver => typeof driver.slot === 'number').map(driver => (
                <option key={driver.slot} value={driver.slot} className="bg-lmu-bg text-white">
                  {driver.carNumber ? `#${driver.carNumber} ` : ''}{driver.name}{driver.isPlayer ? ' (You)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="absolute right-2.5 w-3.5 h-3.5 text-lmu-muted pointer-events-none" />
          </label>

        {trajectory?.laps && trajectory.laps.length > 0 && (
          <div className="flex items-center gap-1 bg-lmu-card border border-lmu-border rounded-xl px-2 py-0.5 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-lmu-accent-text">
            <span className="hidden lg:flex items-center gap-1 text-[11px] text-lmu-muted">
              <Flag className="w-3 h-3 text-lmu-accent-text" />
              Lap:
            </span>
            <button
              onClick={() => onSelectLap(Math.max(1, (trajectory.currentLap ?? 1) - 1))}
              disabled={isPrimaryBusy || (trajectory.currentLap ?? 1) <= 1}
              className={`w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:hover:bg-transparent disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
              title="Previous Lap"
            >
              ‹
            </button>
            <select
              aria-label="Select Lap"
              disabled={isPrimaryBusy}
              value={trajectory.currentLap ?? 1}
              onChange={e => onSelectLap(parseInt(e.target.value, 10))}
              className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer max-w-[140px] sm:max-w-[200px] truncate py-0.5"
            >
              {trajectory.laps.map(l => (
                <option key={l.lapNumber} value={l.lapNumber} className="bg-lmu-bg text-white">
                  Lap {l.lapNumber} ({formatLapTime(l.lapTimeSec)}){l.isBest ? ' ★' : l.isOutlap ? ' • Out' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onSelectLap(Math.min(trajectory.laps!.length, (trajectory.currentLap ?? 1) + 1))}
              disabled={isPrimaryBusy || (trajectory.currentLap ?? 1) >= trajectory.laps.length}
              className={`w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:hover:bg-transparent disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
              title="Next Lap"
            >
              ›
            </button>
          </div>
        )}

        {!isCompareMode ? (
          <ReplayCompareButton
            sessionId={sessionId}
            driverName={drivers.find(d => d.slot === selectedDriverSlot)?.name ?? trajectory?.driverName ?? null}
            trajectory={trajectory}
            availableCompareLaps={availableCompareLaps}
            onToggleCompare={onToggleCompare}
            onSelectCompareLap={onSelectCompareLap}
            formatLapTime={formatLapTime}
            disabled={isPrimaryBusy || !trajectory}
          />
        ) : !isComparePickerOpen && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleCompare}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs max-w-[330px] border transition-colors cursor-pointer ${baselineError ? 'bg-lmu-loss-strong/10 border-lmu-loss-strong/40 text-lmu-loss hover:bg-lmu-loss-strong/20' : 'bg-lmu-bg border-lmu-border hover:bg-lmu-card'} ${FOCUS_RING}`}
              style={baselineError ? undefined : { color: TELEMETRY_COLORS.baseline }}
              aria-busy={isBaselineLoading}
              title={baselineError ? `${baselineError}. Click to pick another comparison lap` : 'Click to change the comparison lap'}
            >
              {isBaselineLoading ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <span aria-hidden="true" className="w-3 shrink-0 border-t-2 border-dashed border-current" />}
              <span className="font-bold">vs </span>
              <span className="truncate">{baselineDriverName || baselineTrajectory?.driverName || 'Baseline'} L{baselineTrajectory?.currentLap ?? baselineLapNumber ?? '?'} </span>
              {baselineError ? <span className="font-sans font-semibold">(unavailable)</span> : null}
              {isBaselineLoading ? <span role="status" className="shrink-0 text-[11px]">Loading…</span> : baselineSummary?.lapTimeSec ? <span className="font-mono shrink-0">({formatLapTime(baselineSummary.lapTimeSec)})</span> : null}
            </button>
            {baselineError && onRetryBaseline && <button type="button" onClick={onRetryBaseline} className={`text-xs text-lmu-text-soft underline underline-offset-4 ${FOCUS_RING}`} aria-label="Retry comparison lap">Retry</button>}
            <button
              type="button"
              onClick={onRemoveCompare}
              className={`p-1 rounded text-lmu-muted hover:text-lmu-loss-soft hover:bg-white/10 ${FOCUS_RING}`}
              title="Remove comparison lap"
              aria-label="Remove comparison lap"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onSwapBaseline}
              disabled={isPrimaryBusy || isBaselineLoading || !baselineTrajectory || Boolean(baselineError)}
              className={`flex items-center gap-1 px-2 py-1 rounded bg-transparent hover:bg-lmu-raised text-lmu-muted hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:hover:bg-transparent disabled:cursor-not-allowed ${FOCUS_RING}`}
              title="Swap the compared and baseline laps"
              aria-label="Swap comparison laps"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Swap</span>
            </button>
          </div>
        )}

        {isComparePickerOpen && (
          <ReplayCompareLapPicker
            laps={availableCompareLaps}
            selectedSessionId={baselineSessionId}
            selectedLapNumber={baselineLapNumber}
            selectedDriverName={baselineDriverName}
            currentLapNumber={trajectory?.currentLap ?? null}
            currentDriverName={drivers.find(d => d.slot === selectedDriverSlot)?.name || trajectory?.driverName || null}
            currentWeatherCondition={trajectory?.weatherCondition ?? metadata?.weatherCondition}
            filter={compareLapFilter}
            isLoading={isCompareLapsLoading}
            pagination={comparePagination}
            currentSessionId={sessionId}
            error={compareLapsError}
            onRetry={onRetryCompareLaps}
            onChangeFilter={onChangeCompareLapFilter}
            onClose={onCloseComparePicker}
            onSelectLap={onSelectCompareLap}
          />
        )}

        {isTrajLoading && <span role="status" className="text-[11px] text-lmu-muted">Loading lap…</span>}

      </div>

      {/* Right: Playback controls */}
      <div role="group" aria-label="Playback" className="flex items-center gap-2 justify-self-end pl-5 border-l border-lmu-border">
        <button
          onClick={onRewind}
          disabled={isPrimaryBusy || !trajectory?.points.length}
          aria-label="Rewind to start"
          className={`p-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-lmu-muted hover:text-white border border-lmu-border transition-colors cursor-pointer disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:cursor-not-allowed disabled:hover:bg-lmu-card ${FOCUS_RING}`}
          title="Rewind to start"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onTogglePlay}
          disabled={isPrimaryBusy || !trajectory?.points.length}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded bg-lmu-raised hover:bg-lmu-raised/80 text-white font-semibold text-xs transition-all cursor-pointer disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:cursor-not-allowed disabled:hover:bg-lmu-raised ${FOCUS_RING}`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <select
          aria-label="Playback speed"
          value={playbackSpeed}
          onChange={event => onSelectPlaybackSpeed(Number(event.target.value))}
          className="h-8 px-2 rounded-lg bg-lmu-card border border-lmu-border text-[11px] font-mono text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
        >
          {[0.5, 1, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </div>
    </header>
  );
});
