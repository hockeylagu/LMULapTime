import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../../shared/types/index.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { BenchmarkImpactBadge } from './BenchmarkImpactBadge.js';

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
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-lmu-gain-strong/15 text-lmu-gain border border-lmu-gain-strong/30">
                  +{updateDiff.addedCount} New Reference{updateDiff.addedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.updatedCount > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-lmu-warn-strong/15 text-lmu-warn border border-lmu-warn-strong/30">
                  {updateDiff.updatedCount} Updated Target{updateDiff.updatedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.removedCount > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-lmu-loss-strong/15 text-lmu-loss border border-lmu-loss-strong/30">
                  -{updateDiff.removedCount} Removed
                </span>
              )}
              {updateDiff.totalAffectedSessions !== undefined && updateDiff.totalAffectedSessions > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-sky-300 border border-slate-700">
                  {updateDiff.totalAffectedSessions} Session{updateDiff.totalAffectedSessions > 1 ? 's' : ''} Driven
                </span>
              )}
              {updateDiff.totalCategoryShifts !== undefined && updateDiff.totalCategoryShifts > 0 && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  {updateDiff.totalCategoryShifts} Category Shift{updateDiff.totalCategoryShifts > 1 ? 's' : ''}
                </span>
              )}
            </>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-lmu-azure-strong/15 text-lmu-azure border border-lmu-azure-strong/30">
              No Changes (All {updateDiff.totalEntries} targets identical)
            </span>
          )}
        </div>
      </div>

      {updateDiff.hasChanges ? (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {/* Added items */}
          {updateDiff.added.map((item) => (
            <div
              key={`added-${item.key}`}
              className="p-2.5 rounded-xl bg-lmu-gain-deep/20 border border-lmu-gain-strong/20 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-lmu-gain-strong/20 text-lmu-gain border border-lmu-gain-strong/40">
                    NEW
                  </span>
                  <span className="font-semibold text-white">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lmu-gain-soft font-bold">Alien: {item.newAlienTimeString}</span>
                  {item.patch && (
                    <span className="text-[10px] text-lmu-muted font-sans bg-lmu-card px-1.5 py-0.5 rounded border border-lmu-border/50">
                      {item.patch}
                    </span>
                  )}
                </div>
              </div>
              <BenchmarkImpactBadge impact={item.impact} />
            </div>
          ))}

          {/* Updated items */}
          {updateDiff.updated.map((item) => (
            <div
              key={`updated-${item.key}`}
              className="p-2.5 rounded-xl bg-lmu-warn-deep/20 border border-lmu-warn-strong/20 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-lmu-warn-strong/20 text-lmu-warn border border-lmu-warn-strong/40">
                    UPDATED
                  </span>
                  <span className="font-semibold text-white">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lmu-muted line-through text-[11px]">{item.oldAlienTimeString}</span>
                    <span className="text-lmu-muted">&rarr;</span>
                    <span className="text-white font-bold">{item.newAlienTimeString}</span>
                    {item.diffSec !== undefined && item.diffSec !== 0 && (
                      <span
                        className={`text-[11px] font-bold ${
                          item.diffSec < 0 ? 'text-lmu-gain' : 'text-lmu-loss'
                        }`}
                      >
                        ({item.diffSec > 0 ? '+' : ''}
                        {item.diffSec.toFixed(3)}s)
                      </span>
                    )}
                  </div>
                  {item.newPatch && item.newPatch !== item.oldPatch && (
                    <span className="text-[10px] text-lmu-warn-soft/90 font-sans bg-lmu-warn-strong/10 px-1.5 py-0.5 rounded border border-lmu-warn-strong/30">
                      {item.oldPatch || '?'} &rarr; {item.newPatch}
                    </span>
                  )}
                </div>
              </div>
              <BenchmarkImpactBadge impact={item.impact} />
            </div>
          ))}

          {/* Removed items */}
          {updateDiff.removed.map((item) => (
            <div
              key={`removed-${item.key}`}
              className="p-2.5 rounded-xl bg-lmu-loss-deep/20 border border-lmu-loss-strong/20 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-lmu-loss-strong/20 text-lmu-loss border border-lmu-loss-strong/40">
                    REMOVED
                  </span>
                  <span className="font-semibold text-white">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="font-mono text-lmu-loss-soft line-through">
                  Alien: {item.oldAlienTimeString}
                </div>
              </div>
              <BenchmarkImpactBadge impact={item.impact} />
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
