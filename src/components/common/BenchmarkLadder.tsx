import React from 'react';
import { PaceCategory, ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { formatTime } from '../../../shared/domain/formatters.js';
import { getPaceCategoryStyle } from '../../utils/paceCategoryStyles.js';

type Targets = ReferenceLaptimeEntry['targets'];

const RUNGS: { category: PaceCategory; percent: string; time: (t: Targets) => number }[] = [
  { category: 'Alien', percent: '100%', time: (t) => t.alienSec },
  { category: 'Competitive', percent: '101%', time: (t) => t.competitiveSec },
  { category: 'Good', percent: '102%', time: (t) => t.goodSec },
  { category: 'Midpack', percent: '104%', time: (t) => t.midpackSec },
  { category: 'Tail-ender', percent: '106%', time: (t) => t.tailEnderSec },
  { category: 'Offline', percent: '107%+', time: (t) => t.offlineSec },
];

export interface BenchmarkLadderProps {
  benchmark?: ReferenceLaptimeEntry | null;
  /** The band a lap falls in (a session's best lap), marked on the ladder. */
  current?: PaceCategory | null;
  className?: string;
}

/**
 * The benchmark pace of a layout and class, alien to offline, in one flat well: each band keeps its
 * pace color as a dot, the times stay white. The one pattern for benchmark targets across the site.
 */
export const BenchmarkLadder: React.FC<BenchmarkLadderProps> = ({ benchmark, current, className = '' }) => {
  if (!benchmark) return null;

  return (
    <ol
      aria-label="Benchmark pace"
      className={`grid grid-cols-6 divide-x divide-lmu-border rounded-lg border border-lmu-border bg-lmu-bg overflow-hidden ${className}`}
    >
      {RUNGS.map((rung) => {
        const style = getPaceCategoryStyle(rung.category);
        const isCurrent = current === rung.category;
        return (
          <li
            key={rung.category}
            aria-current={isCurrent || undefined}
            title={isCurrent ? 'Your best lap is in this band' : undefined}
            className={`px-3 py-2 min-w-0 ${isCurrent ? style.bgClass : ''}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <span className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${style.textClass}`} aria-hidden="true" />
              <span className={`truncate ${isCurrent ? style.textClass : 'text-lmu-muted'}`}>{style.label}</span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5 font-mono">
              <span className={`text-sm font-bold ${rung.category === 'Offline' ? 'text-lmu-text-soft' : 'text-white'}`}>
                {formatTime(rung.time(benchmark.targets))}
              </span>
              <span className="ml-auto text-[10px] text-lmu-faint">{rung.percent}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
