import React from 'react';
import { Link } from 'react-router';
import { LoaderCircle, Clock3, AlertCircle } from 'lucide-react';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { ReplayGlyph, REPLAY_ACTION, REPLAY_BUSY, REPLAY_COMPACT } from './ReplayGlyph.js';

export interface ReplayIndicatorProps {
  sessionId?: string;
  hasReplay?: boolean;
  hasDuckDbTelemetry?: boolean;
  hideIfEmpty?: boolean;
  className?: string;
  to?: string;
  onClick?: () => void;
}

/** The compact replay action of a session row: the replay glyph alone, or the replay's decoding status. */
export const ReplayIndicator: React.FC<ReplayIndicatorProps> = ({
  sessionId,
  hasReplay = false,
  hasDuckDbTelemetry = false,
  hideIfEmpty = false,
  className = '',
  to,
  onClick,
}) => {
  const { scan } = useSessionDataContext();
  const job = scan?.sessionReplayJobs?.find(candidate => candidate.sessionId === sessionId);
  const processing = job?.status === 'processing';
  const isDuckDb = Boolean(hasDuckDbTelemetry);
  const usableDespiteFailure = Boolean(job?.playable || isDuckDb);
  const partialFailure = job?.status === 'failed' && usableDespiteFailure;
  // A queued replay waits for its turn even with 100Hz telemetry; one left queued for a retry
  // (an interrupted driver) still opens if its own laps are stored.
  const queued = job?.status === 'queued' && !job.playable;

  if (!hasReplay) {
    if (hideIfEmpty) return null;
    return <span className="text-lmu-muted text-xs">-</span>;
  }

  if (processing || queued || (job?.status === 'failed' && !usableDespiteFailure)) {
    const state = processing ? 'processing' : queued ? 'queued' : 'failed';
    const label = state === 'processing' ? 'Replay processing' : state === 'queued' ? 'Replay queued' : 'Replay processing failed. Refresh to retry.';
    const stage = job?.stage;
    const percent = job?.filePercent;
    return (
      <span role="status" aria-label={label} title={`${label}${processing && stage ? ` — ${stage}${percent != null ? ` (${Math.round(percent)}%)` : ''}` : ''}${job?.error ? ` — ${job.error}` : ''}`}
        onClick={event => event.stopPropagation()}
        className={`${REPLAY_BUSY} ${REPLAY_COMPACT} ${className}`}>
        {processing ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 text-lmu-info animate-spin motion-reduce:animate-none" />
          : state === 'queued' ? <Clock3 aria-hidden="true" className="w-3.5 h-3.5" />
          : <AlertCircle aria-hidden="true" className="w-3.5 h-3.5 text-lmu-warn" />}
      </span>
    );
  }

  const title = isDuckDb ? 'Replay + telemetry' : 'Replay';
  const partialWarning = partialFailure
    ? `${job?.playable ? 'Some replay drivers are unavailable' : 'Replay cache unavailable; DuckDB telemetry is available'}${job?.error ? ` — ${job.error}` : ''}`
    : '';
  const indicatorTitle = partialWarning ? `${title} — ${partialWarning}` : title;
  const ariaLabel = partialFailure ? `Open replay telemetry; ${partialWarning}` : 'Open replay telemetry';
  const glyph = <ReplayGlyph telemetry={isDuckDb} />;

  if (to) {
    return (
      <Link
        to={to}
        onClick={linkClickHandler(onClick, { stop: true })}
        className={`${REPLAY_ACTION} ${REPLAY_COMPACT} ${className}`}
        title={`${indicatorTitle} - Open telemetry`}
        aria-label={ariaLabel}
      >
        {glyph}
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
        className={`${REPLAY_ACTION} ${REPLAY_COMPACT} ${className}`}
        title={`${indicatorTitle} - Open telemetry`}
        aria-label={ariaLabel}
      >
        {glyph}
      </button>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center text-lmu-text ${REPLAY_COMPACT} ${className}`} title={indicatorTitle}>
      {glyph}
    </span>
  );
};
