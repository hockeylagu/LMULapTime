import React from 'react';
import { Zap } from 'lucide-react';
import { ReferenceLaptimeEntry, DriverData } from '../../../server/types.js';
import { formatTime } from '../../utils/formatters.js';

export interface SessionReferenceAndSafetyProps {
  refEntry: ReferenceLaptimeEntry | null;
  selectedDriver?: DriverData;
}

export const SessionReferenceAndSafety: React.FC<SessionReferenceAndSafetyProps> = ({
  refEntry,
}) => {
  if (!refEntry) return null;

  return (
    <div className="pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-lmu-gold flex items-center gap-1.5 mr-1">
        <Zap className="w-4 h-4 text-lmu-gold" />
        {refEntry.carClass} Reference Targets:
      </span>
      <span className="px-2.5 py-1 rounded bg-purple-950/60 text-purple-300 border border-purple-500/40 text-xs font-mono">
        👾 Alien: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.alienSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 text-xs font-mono">
        🏆 Competitive:{' '}
        <strong className="text-white ml-0.5">{formatTime(refEntry.targets.competitiveSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-xs font-mono">
        ⭐ Good: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.goodSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40 text-xs font-mono">
        🏎️ Midpack: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.midpackSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-orange-950/60 text-orange-300 border border-orange-500/40 text-xs font-mono">
        🐢 Tail-ender:{' '}
        <strong className="text-white ml-0.5">{formatTime(refEntry.targets.tailEnderSec)}</strong>
      </span>
    </div>
  );
};
