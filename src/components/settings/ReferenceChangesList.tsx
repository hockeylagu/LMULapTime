import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../../server/types';

export interface ReferenceChangesListProps {
  updateDiff: ReferenceBenchmarkDiff;
}

export const ReferenceChangesList: React.FC<ReferenceChangesListProps> = ({ updateDiff }) => {
  return (
    <div className="mt-4 pt-4 border-t border-lmu-border/60 space-y-3" data-testid="benchmark-diff-section">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-lmu-gold" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Benchmark Reference Updates
          </h4>
          <span className="text-[10px] text-lmu-muted font-mono">
            {new Date(updateDiff.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {updateDiff.hasChanges ? (
            <>
              {updateDiff.addedCount > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  +{updateDiff.addedCount} New Reference{updateDiff.addedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.updatedCount > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {updateDiff.updatedCount} Updated Target{updateDiff.updatedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.removedCount > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  -{updateDiff.removedCount} Removed
                </span>
              )}
            </>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
              No Changes (All {updateDiff.totalEntries} targets identical)
            </span>
          )}
        </div>
      </div>

      {updateDiff.hasChanges ? (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {/* Added items */}
          {updateDiff.added.map((item) => (
            <div
              key={`added-${item.key}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  NEW
                </span>
                <span className="font-semibold text-white">{item.trackName}</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-lmu-bg text-lmu-muted border border-lmu-border">
                  {item.carClass}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-emerald-300 font-bold">Alien: {item.newAlienTimeString}</span>
                {item.patch && (
                  <span className="text-[10px] text-lmu-muted font-sans bg-lmu-card px-1.5 py-0.5 rounded border border-lmu-border/50">
                    {item.patch}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Updated items */}
          {updateDiff.updated.map((item) => (
            <div
              key={`updated-${item.key}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  UPDATED
                </span>
                <span className="font-semibold text-white">{item.trackName}</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-lmu-bg text-lmu-muted border border-lmu-border">
                  {item.carClass}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-lmu-muted line-through text-[11px]">{item.oldAlienTimeString}</span>
                  <span className="text-lmu-muted">&rarr;</span>
                  <span className="text-white font-bold">{item.newAlienTimeString}</span>
                  {item.diffSec !== undefined && item.diffSec !== 0 && (
                    <span
                      className={`text-[11px] font-bold ${
                        item.diffSec < 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      ({item.diffSec > 0 ? '+' : ''}
                      {item.diffSec.toFixed(3)}s)
                    </span>
                  )}
                </div>
                {item.newPatch && item.newPatch !== item.oldPatch && (
                  <span className="text-[10px] text-amber-300/90 font-sans bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                    {item.oldPatch || '?'} &rarr; {item.newPatch}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Removed items */}
          {updateDiff.removed.map((item) => (
            <div
              key={`removed-${item.key}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  REMOVED
                </span>
                <span className="font-semibold text-white">{item.trackName}</span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-lmu-bg text-lmu-muted border border-lmu-border">
                  {item.carClass}
                </span>
              </div>
              <div className="font-mono text-rose-300 line-through">
                Alien: {item.oldAlienTimeString}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-lmu-bg/70 border border-lmu-border/60 text-xs text-lmu-muted flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-lmu-green shrink-0" />
          <span>
            All {updateDiff.totalEntries} benchmark targets are currently synchronized with Google Sheets. No target lap times or tracks have changed.
          </span>
        </div>
      )}
    </div>
  );
};
