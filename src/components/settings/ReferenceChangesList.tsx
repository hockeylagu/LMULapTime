import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../../shared/types/index.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { BenchmarkImpactBadge } from './BenchmarkImpactBadge.js';
import { formatDateTime } from './settingsFormat.js';

export interface ReferenceChangesListProps {
  updateDiff: ReferenceBenchmarkDiff;
}

export const ReferenceChangesList: React.FC<ReferenceChangesListProps> = ({ updateDiff }) => {
  return (
    <div className="mt-4 pt-4 border-t border-lmu-border/60 space-y-3" data-testid="benchmark-diff-section">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-lmu-muted" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Benchmark Reference Updates
          </h4>
          <span className="text-[10px] text-lmu-muted font-mono">
            {formatDateTime(updateDiff.timestamp)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {updateDiff.hasChanges ? (
            <>
              {updateDiff.addedCount > 0 && (
                <span className="text-[11px] font-semibold text-lmu-gain">
                  +{updateDiff.addedCount} New Reference{updateDiff.addedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.updatedCount > 0 && (
                <span className="text-[11px] font-semibold text-lmu-warn">
                  {updateDiff.updatedCount} Updated Target{updateDiff.updatedCount > 1 ? 's' : ''}
                </span>
              )}
              {updateDiff.removedCount > 0 && (
                <span className="text-[11px] font-semibold text-lmu-loss">
                  -{updateDiff.removedCount} Removed
                </span>
              )}
              {updateDiff.totalAffectedSessions !== undefined && updateDiff.totalAffectedSessions > 0 && (
                <span className="text-[11px] text-lmu-muted">
                  {updateDiff.totalAffectedSessions} Session{updateDiff.totalAffectedSessions > 1 ? 's' : ''} Driven
                </span>
              )}
              {updateDiff.totalCategoryShifts !== undefined && updateDiff.totalCategoryShifts > 0 && (
                <span className="text-[11px] text-lmu-muted">
                  {updateDiff.totalCategoryShifts} Category Shift{updateDiff.totalCategoryShifts > 1 ? 's' : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-lmu-muted">
              No Changes (All {updateDiff.totalEntries} targets identical)
            </span>
          )}
        </div>
      </div>

      {updateDiff.hasChanges ? (
        <div className="relative max-h-96 overflow-y-auto border-y border-lmu-border/70 divide-y divide-lmu-border/70">
          {/* Added items */}
          {updateDiff.added.map((item) => (
            <div
              key={`added-${item.key}`}
              className="py-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lmu-gain">
                    NEW
                  </span>
                  <span className="font-semibold text-white">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lmu-gain-soft font-bold">Alien: {item.newAlienTimeString}</span>
                  {item.patch && (
                    <span className="text-[10px] text-lmu-muted font-sans">
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
              className="py-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lmu-warn">
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
                    <span className="text-[10px] text-lmu-muted font-sans">
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
              className="py-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lmu-loss">
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
        <div className="py-3 text-xs text-lmu-muted flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-lmu-gain shrink-0" />
          <span>
            All {updateDiff.totalEntries} benchmark targets are currently synchronized with Google Sheets. No target lap times or tracks have changed.
          </span>
        </div>
      )}
    </div>
  );
};
