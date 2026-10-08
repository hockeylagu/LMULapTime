import React from 'react';
import { Link } from 'react-router';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';
import { LoaderCircle, Clock3, AlertCircle } from 'lucide-react';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { ReplayGlyph, REPLAY_ACTION, REPLAY_BUSY, REPLAY_LABELLED, REPLAY_TELEMETRY_TEXT } from './ReplayGlyph.js';

export interface ReplayLaunchButtonProps {
  /** "Replay + telemetry" with the car's own DuckDB telemetry, "Replay" with the replay only. */
  hasDuckDb: boolean;
  replayName?: string;
  to?: string;
  onClick?: () => void;
  title?: string;
  'data-testid'?: string;
}

/** The labelled replay button that opens a session's replay and telemetry (dashboard hero, session header). */
export const ReplayLaunchButton: React.FC<ReplayLaunchButtonProps> = ({ hasDuckDb, replayName, to, onClick, title, 'data-testid': testId }) => {
  const { scan } = useSessionDataContext();
  const job = scan?.replayJobs?.find(item => item.name === replayName);
  const processing = Boolean(replayName && ((scan?.running && scan.currentFile === replayName) ||
    (scan?.replayUpgrade?.running && scan.replayUpgrade.currentFile === replayName))) || job?.status === 'processing';
  const failed = job?.status === 'failed';
  const usableDespiteFailure = failed && Boolean(job?.playable || hasDuckDb);
  // A queued replay waits for its turn even with 100Hz telemetry; one left queued for a retry
  // (an interrupted driver) still opens if its own laps are stored.
  const queued = job?.status === 'queued' && !job.playable;
  const blocked = processing || queued || (failed && !usableDespiteFailure);
  const label = processing ? 'Replay processing' : queued ? 'Replay queued' : 'Replay failed — Refresh to retry';
  // A partly failed replay still opens; what is missing goes in the tooltip, not on the button.
  const partialStatus = failed
    ? job?.playable ? 'Some replay drivers are unavailable' : hasDuckDb ? 'Replay cache unavailable; using 100Hz telemetry' : ''
    : '';

  const resolvedTitle = blocked
    ? `${label}${job?.error ? `: ${job.error}` : ''}`
    : partialStatus ? `${partialStatus}${job?.error ? `: ${job.error}` : ''}` : title;

  if (blocked) {
    return (
      <button type="button" disabled aria-busy={processing} className={`${REPLAY_BUSY} ${REPLAY_LABELLED}`} data-testid={testId} title={resolvedTitle}>
        {processing ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 text-lmu-info animate-spin motion-reduce:animate-none" />
          : job?.status === 'queued' ? <Clock3 aria-hidden="true" className="w-3.5 h-3.5" />
          : <AlertCircle aria-hidden="true" className="w-3.5 h-3.5 text-lmu-warn" />}
        <span>{label}</span>
      </button>
    );
  }

  const className = `${REPLAY_ACTION} ${REPLAY_LABELLED}`;
  const content = (
    <>
      <ReplayGlyph telemetry={hasDuckDb} />
      <span className={hasDuckDb ? REPLAY_TELEMETRY_TEXT : ''}>{hasDuckDb ? 'Replay + telemetry' : 'Replay'}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} onClick={linkClickHandler(onClick)} className={className} data-testid={testId} title={resolvedTitle}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} data-testid={testId} title={resolvedTitle}>
      {content}
    </button>
  );
};
