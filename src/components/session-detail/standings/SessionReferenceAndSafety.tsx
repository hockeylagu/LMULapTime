import React from 'react';
import { ReferenceLaptimeEntry, DriverData } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';

export interface SessionReferenceAndSafetyProps {
  refEntry: ReferenceLaptimeEntry | null;
  selectedDriver?: DriverData;
}

export const SessionReferenceAndSafety: React.FC<SessionReferenceAndSafetyProps> = ({
  refEntry,
}) => {
  if (!refEntry) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2.5 py-1 rounded bg-lmu-purple-deep/60 text-lmu-purple-soft border border-lmu-purple-strong/40 text-xs font-mono">
        👾 Alien: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.alienSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-lmu-warn-deep/60 text-lmu-warn-soft border border-lmu-warn-strong/40 text-xs font-mono">
        🏆 Competitive:{' '}
        <strong className="text-white ml-0.5">{formatTime(refEntry.targets.competitiveSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-lmu-gain-deep/60 text-lmu-gain-soft border border-lmu-gain-strong/40 text-xs font-mono">
        ⭐ Good: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.goodSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-lmu-info-deep/60 text-lmu-info-soft border border-lmu-info-strong/40 text-xs font-mono">
        🏎️ Midpack: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.midpackSec)}</strong>
      </span>
      <span className="px-2.5 py-1 rounded bg-lmu-orange-deep/60 text-lmu-orange-soft border border-lmu-orange-strong/40 text-xs font-mono">
        🐢 Tail-ender:{' '}
        <strong className="text-white ml-0.5">{formatTime(refEntry.targets.tailEnderSec)}</strong>
      </span>
    </div>
  );
};
