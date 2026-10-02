import React from 'react';
import { useSessionDataContext } from '../../api/sessionDataContext.js';
import { Zap, Video, LoaderCircle, Clock3, AlertCircle } from 'lucide-react';

export interface ReplayLaunchButtonProps {
  /** Amber "Launch 100Hz Replay" with native DuckDB telemetry, green "Launch Replay" with the replay only. */
  hasDuckDb: boolean;
  replayName?: string;
  onClick: () => void;
  title?: string;
  'data-testid'?: string;
}

/** The one button that opens a session's replay and telemetry (dashboard hero, session header). */
export const ReplayLaunchButton: React.FC<ReplayLaunchButtonProps> = ({ hasDuckDb, replayName, onClick, title, 'data-testid': testId }) => {
  const { scan } = useSessionDataContext();
  const job = scan?.replayJobs?.find(item => item.name === replayName);
  const processing = Boolean(replayName && ((scan?.running && scan.currentFile === replayName) ||
    (scan?.replayUpgrade?.running && scan.replayUpgrade.currentFile === replayName))) || job?.status === 'processing';
  const failed = job?.status === 'failed';
  const usableDespiteFailure = failed && Boolean(job?.playable || hasDuckDb);
  const blocked = processing || job?.status === 'queued' || (failed && !usableDespiteFailure);
  const label = processing ? 'Replay processing' : job?.status === 'queued' ? 'Replay queued' : 'Replay failed — Refresh to retry';
  const partialStatus = failed
    ? job?.playable ? 'Some replay drivers are unavailable' : hasDuckDb ? 'Replay cache unavailable; using 100Hz telemetry' : ''
    : '';
  return (
  <button
    type="button"
    onClick={onClick}
    disabled={blocked}
    aria-busy={processing}
    className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:cursor-default border ${
      hasDuckDb
        ? 'border-lmu-warn-strong/40 bg-lmu-warn-strong/10 text-lmu-warn-soft hover:bg-lmu-warn-strong/20 hover:border-lmu-warn-strong/60'
        : 'border-lmu-gain-strong/30 bg-lmu-gain-strong/10 text-lmu-gain hover:bg-lmu-gain-strong/20 hover:border-lmu-gain-strong/50'
    }`}
    data-testid={testId}
    title={blocked ? `${label}${job?.error ? `: ${job.error}` : ''}` : failed ? `${partialStatus}${job?.error ? `: ${job.error}` : ''}` : title}
  >
    {blocked ? (
      <>
        {processing ? <LoaderCircle aria-hidden="true" className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
          : job?.status === 'queued' ? <Clock3 aria-hidden="true" className="w-3.5 h-3.5" />
          : <AlertCircle aria-hidden="true" className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </>
    ) : hasDuckDb ? (
      <>
        <Zap className="w-3.5 h-3.5 text-lmu-warn fill-lmu-warn/20" aria-hidden="true" />
        <span>Launch 100Hz Replay</span>
      </>
    ) : (
      <>
        <Video className="w-3.5 h-3.5 text-lmu-gain" aria-hidden="true" />
        <span>Launch Replay</span>
      </>
    )}
    {!blocked && partialStatus && <span className="text-[10px] font-medium text-lmu-warn-soft">{partialStatus}</span>}
  </button>
  );
};
