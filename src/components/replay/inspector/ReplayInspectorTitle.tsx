import React, { useRef } from 'react';
import { ArrowLeft, CloudRain, CloudSun, Info } from 'lucide-react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { formatRain } from '../../../../shared/domain/lapConditions.js';

export interface ReplayInspectorTitleProps {
  onClose: () => void;
  replayName: string | null;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
}

const formatBytes = (b: number): string => b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const formatDuration = (s: number): string => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

/** Track context stays visible; replay metadata is available in a keyboard-accessible disclosure. */
export const ReplayInspectorTitle: React.FC<ReplayInspectorTitleProps> = ({ onClose, replayName, metadata, trajectory }) => {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const track = metadata?.displayTrack || metadata?.trackCourse || metadata?.trackName || 'Telemetry';
  const eventTitle = metadata?.eventInfo?.eventTitle || metadata?.eventTitle;
  const weather = trajectory?.weatherCondition || metadata?.weatherCondition;
  const rain = trajectory?.maxRainIntensity ?? metadata?.maxRainIntensity;
  const air = trajectory?.ambientTemp ?? metadata?.ambientTemp;
  const surface = trajectory?.trackTemp ?? metadata?.trackTemp;
  const conditions = [
    weather,
    typeof rain === 'number' && Number.isFinite(rain) && rain > 0 ? `${formatRain(rain)} rain` : null,
    typeof air === 'number' && Number.isFinite(air) ? `${air.toFixed(1)}°C air` : null,
    typeof surface === 'number' && Number.isFinite(surface) ? `${surface.toFixed(1)}°C track` : null,
  ].filter(Boolean).join(' · ');
  const hasRain = weather === 'Wet' || weather === 'Dynamic Weather' || (rain ?? 0) > 0;

  return (
    <div className="flex items-center gap-4 min-w-0">
      <button type="button" onClick={onClose} title="Return to previous page"
        className="flex items-center gap-1.5 py-1.5 text-lmu-muted hover:text-white text-xs shrink-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="min-w-0">
        <h1 className="text-sm font-bold text-white truncate" title={track}>{track}</h1>
        {conditions && <div aria-label="Track conditions" className="flex items-center gap-1.5 text-[11px] leading-4 text-lmu-text-soft" title={conditions}>
          {hasRain ? <CloudRain aria-hidden="true" className="w-3 h-3 shrink-0 text-lmu-azure" /> : <CloudSun aria-hidden="true" className="w-3 h-3 shrink-0 text-lmu-muted" />}
          <span className="truncate">{conditions}</span>
        </div>}
      </div>
      <details ref={detailsRef} className="relative shrink-0" onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (detailsRef.current) detailsRef.current.open = false;
          summaryRef.current?.focus();
        }
      }}>
        <summary ref={summaryRef} className="list-none flex items-center gap-1.5 text-[11px] text-lmu-muted hover:text-white cursor-pointer rounded px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text [&::-webkit-details-marker]:hidden">
          <Info className="w-3.5 h-3.5" /> Info
        </summary>
        <div className="absolute top-full left-0 mt-2 w-[360px] max-h-[70vh] overflow-y-auto bg-lmu-card border border-lmu-border rounded-xl p-4 text-xs shadow-lg">
          <h2 className="font-semibold text-white mb-3">Replay information</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lmu-text-soft">
            {eventTitle && <><dt className="text-lmu-muted">Event</dt><dd>{eventTitle}</dd></>}
            {typeof metadata?.eventInfo?.splitNo === 'number' && <><dt className="text-lmu-muted">Split</dt><dd className="font-mono">Split {metadata.eventInfo.splitNo}</dd></>}
            <dt className="text-lmu-muted">File</dt><dd className="break-all">{replayName || metadata?.filename || 'Loading…'}</dd>
            {metadata && <>
              <dt className="text-lmu-muted">Duration</dt><dd className="font-mono">{formatDuration(metadata.durationSec)}</dd>
              <dt className="text-lmu-muted">File size</dt><dd className="font-mono">{formatBytes(metadata.fileSizeBytes)}</dd>
            </>}
          </dl>
        </div>
      </details>
    </div>
  );
};
