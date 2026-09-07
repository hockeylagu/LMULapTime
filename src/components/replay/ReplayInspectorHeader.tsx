import React from 'react';
import {
  X, Play, Pause, RotateCcw, Video, Clock, HardDrive, Flag, ArrowLeft, Scale, ArrowLeftRight,
} from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../server/types.js';
import { ComparableLap } from '../../utils/lapComparison.js';
import { ReplayCompareLapPicker } from './ReplayCompareLapPicker.js';

export interface ReplayInspectorHeaderProps {
  onClose: () => void;
  replayName: string | null;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
  onSelectLap: (lapNum: number) => void;
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
  compareLapFilter: 'player' | 'all';
  isCompareLapsLoading: boolean;
  onChangeCompareLapFilter: (filter: 'player' | 'all') => void;
  onSelectCompareLap: (lap: ComparableLap) => void;
  isBaselineLoading: boolean;
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
  isCompareMode, onToggleCompare, onSwapBaseline, onRemoveCompare,
  baselineReplayName, baselineLapNumber, baselineDriverName, baselineTrajectory, isComparePickerOpen, onCloseComparePicker, availableCompareLaps, compareLapFilter,
  isCompareLapsLoading, onChangeCompareLapFilter, onSelectCompareLap,
  isBaselineLoading, isStationary, isTrajLoading,
  isPlaying, onTogglePlay, onRewind, playbackSpeed, onSelectPlaybackSpeed, formatLapTime,
}) => {
  const formatBytes = (b: number): string => b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const formatDuration = (s: number): string => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  const baselineSummary = baselineTrajectory?.laps?.find(l => l.lapNumber === (baselineTrajectory.currentLap ?? baselineLapNumber)) || baselineTrajectory?.laps?.[0];

  return (
    <header className="relative h-14 px-4 bg-[#0a0e17] border-b border-lmu-border flex items-center justify-between shrink-0 z-[80]">
      {/* Left: Back button + Title & Info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-white font-medium text-xs border border-lmu-border transition-colors shrink-0 cursor-pointer"
          title="Return to Lap Times"
        >
          <ArrowLeft className="w-4 h-4 text-lmu-muted group-hover:text-white" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-lmu-accent/10 border border-lmu-accent/30 text-lmu-accent shrink-0">
            <Video className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                Replay Intelligence: {replayName}
              </span>
              {metadata?.eventInfo?.eventTitle && (
                <span className="hidden md:inline px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-[10px] shrink-0">
                  {metadata.eventInfo.eventTitle}
                  {typeof metadata.eventInfo.splitNo === 'number' && ` (Split ${metadata.eventInfo.splitNo})`}
                </span>
              )}
              {trajectory?.validation && (
                <span
                  className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-semibold text-[10px] shrink-0"
                  title={`Validated against Session Log ${trajectory.validation.matchedSessionId} (${trajectory.validation.totalSessionLaps} laps)`}
                >
                  ✓ Log Validated
                </span>
              )}
            </div>
            <div className="hidden lg:flex items-center gap-3 text-[11px] text-lmu-muted">
              {(metadata?.displayTrack || metadata?.trackCourse || metadata?.trackName) && (
                <span className="flex items-center gap-1">
                  <Flag className="w-3 h-3 text-lmu-accent" />
                  {metadata.displayTrack || metadata.trackCourse || metadata.trackName}
                </span>
              )}
              {metadata?.durationSec ? (
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {formatDuration(metadata.durationSec)}
                </span>
              ) : null}
              {metadata?.fileSizeBytes ? (
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-lmu-muted" />
                  {formatBytes(metadata.fileSizeBytes)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Lap Selector & Live State */}
      <div className="flex items-center gap-2">
        {trajectory?.laps && trajectory.laps.length > 0 && (
          <div className="flex items-center gap-1 bg-lmu-card border border-lmu-border rounded-xl px-2 py-0.5 shadow-sm">
            <span className="hidden lg:flex items-center gap-1 text-[11px] text-lmu-muted">
              <Flag className="w-3 h-3 text-lmu-accent" />
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
                <option key={l.lapNumber} value={l.lapNumber} className="bg-[#0b101d] text-white">
                  Lap {l.lapNumber} ({formatLapTime(l.lapTimeSec)}){l.validatedTimeSec ? ` [Log ${formatLapTime(l.validatedTimeSec)}]` : ''}{l.isBest ? ' ★' : l.isOutlap ? ' • Out' : ''}
                </option>
              ))}
              {trajectory.validation?.officialLaps?.filter(ol => !trajectory.laps?.some(tl => tl.lapNumber === ol.lapNumber)).map(ol => (
                <option key={`log-${ol.lapNumber}`} value={ol.lapNumber} className="bg-[#0b101d] text-lmu-muted" disabled>
                  Lap {ol.lapNumber} ({formatLapTime(ol.lapTimeSec)}) [Log only]
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
          <button
            type="button"
            onClick={onToggleCompare}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold text-xs border transition-all cursor-pointer bg-lmu-card hover:bg-white/10 border-lmu-border text-lmu-muted hover:text-white"
            title="Choose a lap for telemetry comparison"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>
        ) : !isComparePickerOpen && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-lmu-accent/10 border border-lmu-accent/30 px-2 py-1 text-[10px] font-mono text-lmu-accent max-w-[250px]" title="Selected comparison lap">
              <span className="font-bold">vs</span>
              <span className="truncate">{baselineDriverName || baselineReplayName || 'Baseline'} L{baselineTrajectory?.currentLap ?? baselineLapNumber ?? '?'}</span>
              {baselineSummary?.lapTimeSec ? <span className="text-white">({formatLapTime(baselineSummary.lapTimeSec)})</span> : null}
              <button
                type="button"
                onClick={onRemoveCompare}
                className="ml-1 rounded text-lmu-muted hover:text-rose-300"
                title="Remove comparison lap"
                aria-label="Remove comparison lap"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
            <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSwapBaseline}
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-lmu-accent/15 hover:bg-lmu-accent/25 border border-lmu-accent/40 text-lmu-accent text-xs font-bold transition-all cursor-pointer"
              title="Swap the compared and baseline laps"
              aria-label="Swap comparison laps"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Swap</span>
            </button>
          </div>
          </div>
        )}

        {isComparePickerOpen && (
          <ReplayCompareLapPicker
            laps={availableCompareLaps}
            selectedReplayName={baselineReplayName}
            selectedLapNumber={baselineLapNumber}
            selectedDriverName={baselineDriverName}
            filter={compareLapFilter}
            isLoading={isCompareLapsLoading || isBaselineLoading}
            onChangeFilter={onChangeCompareLapFilter}
            onClose={onCloseComparePicker}
            onSelectLap={onSelectCompareLap}
          />
        )}

        {isStationary ? (
          <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Garage
          </span>
        ) : (
          <span className="hidden sm:flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Track
          </span>
        )}

        {isTrajLoading && (
          <span className="text-[10px] text-lmu-muted animate-pulse hidden md:inline">
            Loading driver...
          </span>
        )}
      </div>

      {/* Right: Playback Controls & Close */}
      <div className="flex items-center gap-2 sm:gap-3">
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lmu-accent hover:bg-lmu-accent/90 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
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
                  ? 'bg-lmu-accent text-white shadow'
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
