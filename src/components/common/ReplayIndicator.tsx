import React from 'react';
import { Link } from 'react-router';
import { Video, Zap, LoaderCircle, Clock3, AlertCircle } from 'lucide-react';
import { useSessionDataContext } from '../../api/sessionDataContext.js';
import { FOCUS_RING } from './buttonStyles.js';
import { linkClickHandler } from '../../utils/linkClick.js';

export interface ReplayIndicatorProps {
  replay?: {
    name: string;
    path?: string;
    hasDuckDbTelemetry?: boolean;
    duckdbFilename?: string;
    hasRain?: boolean;
    maxRainIntensity?: number;
    weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
  } | null;
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  hideIfEmpty?: boolean;
  className?: string;
  to?: string;
  onClick?: () => void;
}

export const ReplayIndicator: React.FC<ReplayIndicatorProps> = ({
  replay,
  hasDuckDbTelemetry = false,
  duckdbFilename,
  hideIfEmpty = false,
  className = '',
  to,
  onClick,
}) => {
  const { scan } = useSessionDataContext();
  const job = scan?.replayJobs?.find(candidate => candidate.name === replay?.name);
  const processing = job?.status === 'processing' || Boolean(replay && ((scan?.running && scan.currentFile === replay.name) ||
    (scan?.replayUpgrade?.running && scan.replayUpgrade.currentFile === replay.name)));
  const isDuckDb = Boolean(hasDuckDbTelemetry || replay?.hasDuckDbTelemetry);
  const usableDespiteFailure = Boolean(job?.playable || isDuckDb);
  const partialFailure = job?.status === 'failed' && usableDespiteFailure;
  // A replay left queued for a retry (an interrupted driver) still opens if its own laps are stored.
  const queued = job?.status === 'queued' && !usableDespiteFailure;

  if (!replay) {
    if (hideIfEmpty) return null;
    return <span className="text-lmu-muted text-xs">-</span>;
  }

  if (processing || queued || (job?.status === 'failed' && !usableDespiteFailure)) {
    const state = processing ? 'processing' : queued ? 'queued' : 'failed';
    const label = state === 'processing' ? 'Replay processing' : state === 'queued' ? 'Replay queued' : 'Replay processing failed. Refresh to retry.';
    const stage = scan?.running ? scan.currentStage : scan?.replayUpgrade?.currentStage;
    const percent = scan?.running ? scan.filePercent : scan?.replayUpgrade?.filePercent;
    return (
      <span role="status" aria-label={label} title={`${label}: ${replay.name}${processing && stage ? ` — ${stage}${percent != null ? ` (${Math.round(percent)}%)` : ''}` : ''}${job?.error ? ` — ${job.error}` : ''}`}
        onClick={event => event.stopPropagation()}
        className={`inline-flex p-1.5 rounded-lg bg-lmu-raised text-lmu-info border border-lmu-border shrink-0 ${className}`}>
        {processing ? <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />
          : state === 'queued' ? <Clock3 aria-hidden="true" className="w-4 h-4" />
          : <AlertCircle aria-hidden="true" className="w-4 h-4 text-lmu-warn" />}
      </span>
    );
  }

  const activeDuckFilename = duckdbFilename || replay.duckdbFilename;

  const indicatorClassName = isDuckDb
    ? `inline-flex items-center gap-1 p-1.5 rounded-lg bg-lmu-warn-strong/15 text-lmu-warn-soft border border-lmu-warn-strong/40 shrink-0 ${className}`
    : `inline-flex p-1.5 rounded-lg bg-lmu-gain/10 text-lmu-gain border border-lmu-gain/20 shrink-0 ${className}`;

  const title = isDuckDb
    ? `⚡ 100Hz DuckDB Telemetry & Replay: ${replay.name}${activeDuckFilename ? ` (${activeDuckFilename})` : ''}`
    : `Replay VCR: ${replay.name}`;
  const partialWarning = partialFailure
    ? `${job?.playable ? 'Some replay drivers are unavailable' : 'Replay cache unavailable; DuckDB telemetry is available'}${job?.error ? ` — ${job.error}` : ''}`
    : '';
  const indicatorTitle = partialWarning ? `${title} — ${partialWarning}` : title;

  if (to) {
    return (
      <Link
        to={to}
        onClick={linkClickHandler(onClick, { stop: true })}
        className={`${indicatorClassName} ${isDuckDb ? 'hover:bg-lmu-warn-strong/25' : 'hover:bg-lmu-gain/20'} transition-colors cursor-pointer ${FOCUS_RING}`}
        title={`${indicatorTitle} - Open telemetry`}
        aria-label={partialFailure ? `Open replay telemetry; ${partialWarning}` : 'Open replay telemetry'}
      >
        {isDuckDb ? (
          <>
            <Zap className="w-3.5 h-3.5 text-lmu-warn fill-lmu-warn/20" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline">100Hz</span>
          </>
        ) : (
          <Video className="w-4 h-4" />
        )}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={`${indicatorClassName} ${isDuckDb ? 'hover:bg-lmu-warn-strong/25' : 'hover:bg-lmu-gain/20'} transition-colors cursor-pointer ${FOCUS_RING}`}
        title={`${indicatorTitle} - Open telemetry`}
        aria-label={partialFailure ? `Open replay telemetry; ${partialWarning}` : 'Open replay telemetry'}
      >
        {isDuckDb ? (
          <>
            <Zap className="w-3.5 h-3.5 text-lmu-warn fill-lmu-warn/20" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline">100Hz</span>
          </>
        ) : (
          <Video className="w-4 h-4" />
        )}
      </button>
    );
  }

  return (
    <span className={indicatorClassName} title={indicatorTitle}>
      {isDuckDb ? (
        <>
          <Zap className="w-3.5 h-3.5 text-lmu-warn fill-lmu-warn/20" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline">100Hz</span>
        </>
      ) : (
        <Video className="w-4 h-4" />
      )}
    </span>
  );
};
