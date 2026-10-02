import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';
import { BenchmarkItemImpact } from '../../../shared/types/index.js';

export interface BenchmarkImpactBadgeProps {
  impact?: BenchmarkItemImpact;
}

export const BenchmarkImpactBadge: React.FC<BenchmarkImpactBadgeProps> = ({ impact }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!impact) {
    return (
      <span className="text-[11px] text-lmu-muted font-mono" title="No session impact calculated">
        —
      </span>
    );
  }

  const { affectedSessionsCount, categoryShiftsCount, categoryShifts } = impact;
  const hasShifts = categoryShiftsCount > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {/* Affected Sessions Badge */}
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium ${
            affectedSessionsCount > 0 ? 'text-lmu-text-soft' : 'text-lmu-muted'
          }`}
          title={`${affectedSessionsCount} session(s) driven on this track & class in your database`}
        >
          <Layers className="w-3 h-3 text-lmu-muted shrink-0" />
          <span>
            {affectedSessionsCount} session{affectedSessionsCount !== 1 ? 's' : ''}
          </span>
        </span>

        {/* Category Shifts Indicator */}
        {hasShifts ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1.5 rounded-md text-[11px] font-semibold text-lmu-text-soft hover:text-white hover:bg-lmu-card-hover transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
            title="Show the laps that changed pace category"
          >
            <Sparkles className="w-3 h-3 text-lmu-muted shrink-0" />
            <span>
              {categoryShiftsCount} {categoryShiftsCount === 1 ? 'shift' : 'shifts'}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span
            className="text-[11px] text-lmu-faint font-sans px-1"
            title="No laps changed pace category"
          >
            0 shifts
          </span>
        )}
      </div>

      {/* Expanded Category Shifts List */}
      {isExpanded && hasShifts && categoryShifts.length > 0 && (
        <div className="w-full mt-1.5 p-2 rounded-lg bg-lmu-bg text-left space-y-1 text-[11px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted border-b border-lmu-border pb-1 mb-1">
            Pace Category Shifts
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-lmu-border/60 font-mono">
            {categoryShifts.map((shift, idx) => (
              <div
                key={`${shift.sessionId}_${shift.lapNumber}_${idx}`}
                className="pt-1 first:pt-0 flex items-center justify-between gap-2"
              >
                <div className="truncate text-white">
                  <span className="font-semibold text-lmu-text-soft">{shift.driverName}</span>{' '}
                  <span className="text-lmu-muted text-[10px]">Lap {shift.lapNumber}</span>
                  <span className="text-lmu-muted text-[10px] ml-1.5">({shift.lapTimeString})</span>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold">
                  <span className="text-lmu-muted line-through">{shift.oldCategory}</span>
                  <span className="text-lmu-muted">&rarr;</span>
                  <span className="text-lmu-text-soft">{shift.newCategory}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
