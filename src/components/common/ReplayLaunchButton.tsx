import React from 'react';
import { Zap, Video } from 'lucide-react';

export interface ReplayLaunchButtonProps {
  /** Amber "Launch 100Hz Replay" with native DuckDB telemetry, green "Launch Replay" with the replay only. */
  hasDuckDb: boolean;
  onClick: () => void;
  title?: string;
  'data-testid'?: string;
}

/** The one button that opens a session's replay and telemetry (dashboard hero, session header). */
export const ReplayLaunchButton: React.FC<ReplayLaunchButtonProps> = ({ hasDuckDb, onClick, title, 'data-testid': testId }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
      hasDuckDb
        ? 'border-lmu-warn-strong/40 bg-lmu-warn-strong/10 text-lmu-warn-soft hover:bg-lmu-warn-strong/20 hover:border-lmu-warn-strong/60'
        : 'border-lmu-gain-strong/30 bg-lmu-gain-strong/10 text-lmu-gain hover:bg-lmu-gain-strong/20 hover:border-lmu-gain-strong/50'
    }`}
    data-testid={testId}
    title={title}
  >
    {hasDuckDb ? (
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
  </button>
);
