import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { CornerPhase, DebriefCorner } from '../../../utils/sessionDebrief.js';

const PHASE_LABELS: Record<CornerPhase, string> = {
  entry: 'mostly on entry',
  rotation: 'mostly mid-corner',
  exit: 'mostly on exit',
};

export interface DebriefCornerRowProps {
  rank: number;
  corner: DebriefCorner;
  onOpen: (cornerNumber: number) => void;
}

/** One corner to work on: how much it costs, how often, where in the corner, and what differs. */
export const DebriefCornerRow: React.FC<DebriefCornerRowProps> = ({ rank, corner, onOpen }) => {
  const frequency = corner.lapsSampled !== null
    ? `lost on ${corner.lapsLosing} of ${corner.lapsSampled} laps`
    : 'measured on this lap only';

  return (
    <li className="flex items-start gap-3 py-2.5 border-t border-lmu-border/40 first:border-t-0" data-testid={`debrief-corner-${corner.cornerNumber}`}>
      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-white flex items-center justify-center">
        {rank}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">T{corner.cornerNumber}</span>
          <span className="font-mono text-sm font-bold text-rose-400">+{corner.timeLossSec.toFixed(3)}s</span>
          <span className="text-xs text-lmu-muted">
            {frequency}
            {corner.worstPhase ? ` · ${PHASE_LABELS[corner.worstPhase]}` : ''}
          </span>
        </div>
        {corner.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {corner.evidence.map((item) => (
              <span key={item} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpen(corner.cornerNumber)}
        className="shrink-0 inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-sky-400 hover:bg-sky-500/10 border border-transparent hover:border-sky-500/30 transition-colors cursor-pointer"
        aria-label={`Open T${corner.cornerNumber} in telemetry`}
      >
        Open <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </li>
  );
};
