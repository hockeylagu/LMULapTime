import React from 'react';
import { ArrowLeft, Clock, CloudDrizzle, CloudRain, Flag, HardDrive, Sun, Thermometer, Video } from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';

export interface ReplayInspectorTitleProps {
  onClose: () => void;
  replayName: string | null;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
}

const formatBytes = (b: number): string => b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const formatDuration = (s: number): string => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

/** The replay's weather, from the loaded lap when it carries one, else from the replay header. */
function WeatherBadge({ metadata, trajectory }: Pick<ReplayInspectorTitleProps, 'metadata' | 'trajectory'>) {
  const condition = trajectory?.weatherCondition || metadata?.weatherCondition;
  if (!condition) return null;
  const maxRain = trajectory?.maxRainIntensity || metadata?.maxRainIntensity;
  const rainSuffix = trajectory?.maxRainIntensity ? `(${trajectory.maxRainIntensity})` : '';
  const tone = condition === 'Wet'
    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
    : condition === 'Dynamic Weather'
    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
    : 'bg-amber-500/10 border-amber-500/30 text-amber-400';

  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] shrink-0 border ${tone}`}
      title={maxRain ? `Max Rain Intensity: ${trajectory?.maxRainIntensity ?? metadata?.maxRainIntensity}/25` : 'Track Weather Condition'}
    >
      {condition === 'Wet' ? (
        <>
          <CloudRain className="w-3 h-3 text-blue-400" />
          <span>Wet Track {rainSuffix}</span>
        </>
      ) : condition === 'Dynamic Weather' ? (
        <>
          <CloudDrizzle className="w-3 h-3 text-cyan-400" />
          <span>Dynamic Rain {rainSuffix}</span>
        </>
      ) : (
        <>
          <Sun className="w-3 h-3 text-amber-400" />
          <span>Dry Track</span>
        </>
      )}
    </span>
  );
}

/** The inspector header's left side: back, the replay's name and event, weather, track, length and temperatures. */
export const ReplayInspectorTitle: React.FC<ReplayInspectorTitleProps> = ({ onClose, replayName, metadata, trajectory }) => (
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
          <WeatherBadge metadata={metadata} trajectory={trajectory} />
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
          {(trajectory?.ambientTemp !== undefined || metadata?.ambientTemp !== undefined) && (
            <span className="flex items-center gap-1 font-mono text-cyan-300" title="Session Atmospheric & Track Temperature">
              <Thermometer className="w-3 h-3 text-cyan-400" />
              <span>
                {(trajectory?.ambientTemp ?? metadata?.ambientTemp)?.toFixed(1)}°C Air
                {(trajectory?.trackTemp !== undefined || metadata?.trackTemp !== undefined) &&
                  ` · ${(trajectory?.trackTemp ?? metadata?.trackTemp)?.toFixed(1)}°C Track`}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  </div>
);
