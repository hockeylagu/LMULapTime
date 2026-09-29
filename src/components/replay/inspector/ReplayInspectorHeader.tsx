import React from 'react';
import { X, Play, Pause, RotateCcw, Flag, ArrowLeftRight, Users } from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData, ReplayDriverEntry, ComparableLap } from '../../../../shared/types/index.js';
import { CompareLapFilter, ReplayCompareLapPicker } from './ReplayCompareLapPicker.js';
import { ReplayCompareButton } from './ReplayCompareButton.js';
import { ReplayInspectorTitle } from './ReplayInspectorTitle.js';

export interface ReplayInspectorHeaderProps {
  onClose: () => void;
  replayName: string | null;
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
  baselineReplayName: string | null;
  baselineLapNumber: number | null;
  baselineDriverName?: string | null;
  baselineTrajectory?: ReplayTrajectoryData | null;
  isComparePickerOpen: boolean;
  onCloseComparePicker: () => void;
  availableCompareLaps: ComparableLap[];
  compareLapFilter: CompareLapFilter;
  isCompareLapsLoading: boolean;
  onChangeCompareLapFilter: (filter: CompareLapFilter) => void;
  onSelectCompareLap: (lap: ComparableLap) => void;
  isBaselineLoading: boolean;
  baselineError?: string | null;
  isStationary: boolean;
  isTrajLoading: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRewind: () => void;
  playbackSpeed: number;
  onSelectPlaybackSpeed: (speed: number) => void;
  formatLapTime: (sec?: number | null) => string;
}

export const ReplayInspectorHeader: React.FC<ReplayInspectorHeaderProps> = React.memo(({
  onClose, replayName, metadata, trajectory, onSelectLap,
  drivers, selectedDriverSlot, onSelectDriver,
  isCompareMode, onToggleCompare, onSwapBaseline, onRemoveCompare,
  baselineReplayName, baselineLapNumber, baselineDriverName, baselineTrajectory, isComparePickerOpen, onCloseComparePicker, availableCompareLaps, compareLapFilter,
  isCompareLapsLoading, onChangeCompareLapFilter, onSelectCompareLap,
  isBaselineLoading, baselineError, isStationary, isTrajLoading,
  isPlaying, onTogglePlay, onRewind, playbackSpeed, onSelectPlaybackSpeed, formatLapTime,
}) => {
  const baselineSummary = baselineTrajectory?.laps?.find(l => l.lapNumber === (baselineTrajectory.currentLap ?? baselineLapNumber)) || baselineTrajectory?.laps?.[0];

  return (
    <header className="relative h-14 px-4 bg-lmu-strip border-b border-lmu-border grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center shrink-0 z-[80]">
      {/* Left: Back button + Title & Info */}
      <ReplayInspectorTitle onClose={onClose} replayName={replayName} metadata={metadata} trajectory={trajectory} />

      {/* Center: Driver Selector, Lap Selector & Live State */}
      <div className="flex items-center gap-2 justify-self-center min-w-0">
        {drivers.length > 0 && (
          <label className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-xl bg-lmu-card border border-lmu-border hover:border-lmu-accent/50 transition-colors shrink-0">
            <Users className="w-3.5 h-3.5 text-lmu-accent-text shrink-0" />
            <select
              aria-label="Select Driver"
              value={selectedDriverSlot ?? ''}
              onChange={e => onSelectDriver(parseInt(e.target.value, 10))}
              className="bg-transparent text-[11px] font-bold text-white focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[180px] truncate py-0.5"
            >
              {drivers.filter(driver => typeof driver.slot === 'number').map(driver => (
                <option key={driver.slot} value={driver.slot} className="bg-lmu-bg text-white">
                  {driver.carNumber ? `#${driver.carNumber} ` : ''}{driver.name}{driver.isPlayer ? ' (You)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {trajectory?.laps && trajectory.laps.length > 0 && (
          <div className="flex items-center gap-1 bg-lmu-card border border-lmu-border rounded-xl px-2 py-0.5">
            <span className="hidden lg:flex items-center gap-1 text-[11px] text-lmu-muted">
              <Flag className="w-3 h-3 text-lmu-accent-text" />
              Lap:
            </span>
            <button
              onClick={() => onSelectLap(Math.max(1, (trajectory.currentLap ?? 1) - 1))}
              disabled={(trajectory.currentLap ?? 1) <= 1}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer"
              title="Previous Lap"
            >
              ‹
            </button>
            <select
              aria-label="Select Lap"
              value={trajectory.currentLap ?? 1}
              onChange={e => onSelectLap(parseInt(e.target.value, 10))}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer max-w-[140px] sm:max-w-[200px] truncate py-0.5"
            >
              {trajectory.laps.map(l => (
                <option key={l.lapNumber} value={l.lapNumber} className="bg-lmu-bg text-white">
                  Lap {l.lapNumber} ({formatLapTime(l.lapTimeSec)}){l.isBest ? ' ★' : l.isOutlap ? ' • Out' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onSelectLap(Math.min(trajectory.laps!.length, (trajectory.currentLap ?? 1) + 1))}
              disabled={(trajectory.currentLap ?? 1) >= trajectory.laps.length}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-lmu-muted hover:text-white disabled:opacity-25 disabled:cursor-not-allowed text-xs font-bold transition-colors cursor-pointer"
              title="Next Lap"
            >
              ›
            </button>
          </div>
        )}

        {!isCompareMode ? (
          <ReplayCompareButton
            replayName={replayName}
            driverName={drivers.find(d => d.slot === selectedDriverSlot)?.name ?? trajectory?.driverName ?? null}
            trajectory={trajectory}
            availableCompareLaps={availableCompareLaps}
            onToggleCompare={onToggleCompare}
            onSelectCompareLap={onSelectCompareLap}
            formatLapTime={formatLapTime}
          />
        ) : !isComparePickerOpen && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleCompare}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono max-w-[250px] transition-colors cursor-pointer ${baselineError ? 'bg-lmu-loss-strong/10 border border-lmu-loss-strong/40 text-lmu-loss hover:bg-lmu-loss-strong/20' : 'bg-lmu-warn-strong/10 border border-lmu-warn-strong/30 text-lmu-warn hover:bg-lmu-warn-strong/20 hover:border-lmu-warn-strong/50'}`}
              title={baselineError ? `${baselineError}. Click to pick another comparison lap` : 'Click to change the comparison lap'}
            >
              <span className="font-bold">vs</span>
              <span className="truncate">{baselineDriverName || baselineReplayName || 'Baseline'} L{baselineTrajectory?.currentLap ?? baselineLapNumber ?? '?'}</span>
              {baselineError ? <span className="font-sans font-semibold">(unavailable)</span> : null}
              {baselineSummary?.lapTimeSec ? <span className="text-white">({formatLapTime(baselineSummary.lapTimeSec)})</span> : null}
            </button>
            <button
              type="button"
              onClick={onRemoveCompare}
              className="p-1 rounded text-lmu-muted hover:text-lmu-loss-soft hover:bg-white/10"
              title="Remove comparison lap"
              aria-label="Remove comparison lap"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onSwapBaseline}
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-lmu-warn-strong/15 hover:bg-lmu-warn-strong/25 border border-lmu-warn-strong/40 text-lmu-warn text-xs font-bold transition-all cursor-pointer"
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
            selectedReplayName={baselineReplayName}
            selectedLapNumber={baselineLapNumber}
            selectedDriverName={baselineDriverName}
            currentReplayName={replayName || metadata?.filename || null}
            currentLapNumber={trajectory?.currentLap ?? null}
            currentDriverName={drivers.find(d => d.slot === selectedDriverSlot)?.name || trajectory?.driverName || null}
            filter={compareLapFilter}
            isLoading={isCompareLapsLoading || isBaselineLoading}
            onChangeFilter={onChangeCompareLapFilter}
            onClose={onCloseComparePicker}
            onSelectLap={onSelectCompareLap}
          />
        )}

        {isStationary ? (
          <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-lmu-warn-strong/10 border border-lmu-warn-strong/30 text-lmu-warn-soft text-[10px] font-semibold items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-lmu-warn animate-pulse" />
            Garage
          </span>
        ) : (
          <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-lmu-gain-strong/10 border border-lmu-gain-strong/30 text-lmu-gain text-[10px] font-semibold items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-lmu-gain animate-pulse" />
            Track
          </span>
        )}

        <span className={`min-w-[92px] text-[10px] text-lmu-muted animate-pulse hidden md:inline ${isTrajLoading ? '' : 'invisible'}`}>
            Loading driver...
        </span>
      </div>

      {/* Right: Playback Controls & Close */}
      <div className="flex items-center gap-2 sm:gap-3 justify-self-end">
        <button
          onClick={onRewind}
          aria-label="Rewind to start"
          className="p-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-lmu-muted hover:text-white border border-lmu-border transition-colors cursor-pointer"
          title="Rewind to start"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lmu-accent hover:bg-lmu-accent/90 text-white font-bold text-xs transition-all cursor-pointer"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <div className="hidden md:flex items-center gap-1 text-xs">
          {[0.5, 1, 2].map(spd => (
            <button
              key={spd}
              onClick={() => onSelectPlaybackSpeed(spd)}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                playbackSpeed === spd
                  ? 'bg-lmu-accent text-white'
                  : 'bg-lmu-card text-lmu-muted hover:text-white border border-lmu-border'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-xl text-lmu-muted hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
});
