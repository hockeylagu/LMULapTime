import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../../shared/types/index.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { BenchmarkImpactBadge } from './BenchmarkImpactBadge.js';
import { formatDateTime, formatNumber } from './settingsFormat.js';

export interface ChangeCountsProps {
  addedCount: number;
  updatedCount: number;
  removedCount: number;
}

/** "+3 new, 2 updated, 1 removed": gain, warn and loss, only the parts that are not zero. */
export const ChangeCounts: React.FC<ChangeCountsProps> = ({ addedCount, updatedCount, removedCount }) => {
  const parts: React.ReactNode[] = [];
  if (addedCount > 0) parts.push(<span key="new" className="font-semibold text-lmu-gain">+{addedCount} new</span>);
  if (updatedCount > 0) parts.push(<span key="updated" className="font-semibold text-lmu-warn">{updatedCount} updated</span>);
  if (removedCount > 0) parts.push(<span key="removed" className="font-semibold text-lmu-loss">{removedCount} removed</span>);
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>{i > 0 && ', '}{part}</React.Fragment>
      ))}
    </>
  );
};

export interface ReferenceChangesListProps {
  updateDiff: ReferenceBenchmarkDiff;
}

/** What one update changed: each target that is new, faster or slower, or gone, and what that did to your laps. */
export const ReferenceChangesList: React.FC<ReferenceChangesListProps> = ({ updateDiff }) => {
  const driven = updateDiff.totalAffectedSessions ?? 0;
  const shifted = updateDiff.totalCategoryShifts ?? 0;
  return (
    <div className="space-y-3" data-testid="benchmark-diff-section">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-lmu-muted" aria-hidden="true" />
          <h4 className="text-xs font-bold text-lmu-text uppercase tracking-wider">What changed</h4>
          <span className="text-[11px] text-lmu-muted font-mono">{formatDateTime(updateDiff.timestamp)}</span>
        </div>

        {updateDiff.hasChanges && (
          <p className="text-[11px] text-lmu-muted">
            <ChangeCounts addedCount={updateDiff.addedCount} updatedCount={updateDiff.updatedCount} removedCount={updateDiff.removedCount} />
            {driven > 0 && <> · <span className="font-mono">{formatNumber(driven)}</span> of your session{driven === 1 ? '' : 's'} on these layouts</>}
            {shifted > 0 && <> · <span className="font-mono">{formatNumber(shifted)}</span> {shifted === 1 ? 'lap' : 'laps'} changed pace category</>}
          </p>
        )}
      </div>

      {updateDiff.hasChanges ? (
        <div className="relative max-h-96 overflow-y-auto overflow-x-hidden border-y border-lmu-border/70 divide-y divide-lmu-border/70">
          {/* Added items */}
          {updateDiff.added.map((item) => (
            <div
              key={`added-${item.key}`}
              className="py-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-lmu-gain">
                    New
                  </span>
                  <span className="font-semibold text-lmu-text">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-lmu-gain-soft font-bold">Alien target {item.newAlienTimeString}</span>
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
                    Updated
                  </span>
                  <span className="font-semibold text-lmu-text">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lmu-muted line-through text-[11px]">{item.oldAlienTimeString}</span>
                    <span className="text-lmu-muted">&rarr;</span>
                    <span className="text-lmu-text font-bold">{item.newAlienTimeString}</span>
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
                    Removed
                  </span>
                  <span className="font-semibold text-lmu-text">{item.trackName}</span>
                  <CarClassBadge carClass={item.carClass} size="xs" />
                </div>
                <div className="font-mono text-lmu-loss-soft line-through">
                  Alien target {item.oldAlienTimeString}
                </div>
              </div>
              <BenchmarkImpactBadge impact={item.impact} />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-1 text-xs text-lmu-muted flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-lmu-gain shrink-0" aria-hidden="true" />
          <span>
            {updateDiff.totalEntries === 1 ? '' : 'All '}<span className="font-mono">{formatNumber(updateDiff.totalEntries)}</span> {updateDiff.totalEntries === 1 ? 'target' : 'targets'} matched the sheet.
          </span>
        </div>
      )}
    </div>
  );
};
