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
      <span className="text-[10px] text-lmu-muted font-mono" title="No session impact calculated">
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
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
            affectedSessionsCount > 0
              ? 'bg-slate-800/80 text-white border-slate-700'
              : 'bg-lmu-bg text-lmu-muted/70 border-lmu-border/60'
          }`}
          title={`${affectedSessionsCount} session(s) driven on this track & class in your database`}
        >
          <Layers className="w-3 h-3 text-lmu-cyan shrink-0" />
          <span>
            {affectedSessionsCount} session{affectedSessionsCount !== 1 ? 's' : ''}
          </span>
        </span>

        {/* Category Shifts Indicator */}
        {hasShifts ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-all cursor-pointer"
            title="Click to view lap pace category changes"
          >
            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
            <span>
              {categoryShiftsCount} {categoryShiftsCount === 1 ? 'shift' : 'shifts'}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3 h-3 ml-0.5" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-0.5" />
            )}
          </button>
        ) : (
          <span
            className="text-[10px] text-lmu-muted/60 font-sans px-1"
            title="No laps changed pace category"
          >
            0 shifts
          </span>
        )}
      </div>

      {/* Expanded Category Shifts List */}
      {isExpanded && hasShifts && categoryShifts.length > 0 && (
        <div className="w-full mt-1.5 p-2 rounded-lg bg-black/60 border border-purple-500/30 text-left space-y-1 text-[11px] animate-in fade-in duration-150">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 border-b border-purple-500/20 pb-1 mb-1">
            Pace Category Shifts
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-800/60 font-mono">
            {categoryShifts.map((shift, idx) => (
              <div
                key={`${shift.sessionId}_${shift.lapNumber}_${idx}`}
                className="pt-1 first:pt-0 flex items-center justify-between gap-2"
              >
                <div className="truncate text-white">
                  <span className="font-semibold text-slate-300">{shift.driverName}</span>{' '}
                  <span className="text-lmu-muted text-[10px]">Lap {shift.lapNumber}</span>
                  <span className="text-slate-400 text-[10px] ml-1.5">({shift.lapTimeString})</span>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold">
                  <span className="text-lmu-muted line-through">{shift.oldCategory}</span>
                  <span className="text-purple-400">&rarr;</span>
                  <span className="text-purple-300">{shift.newCategory}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
