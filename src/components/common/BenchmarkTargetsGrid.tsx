import React from 'react';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { formatTime } from '../../../shared/domain/formatters.js';

export interface BenchmarkTargetsGridProps {
  benchmark?: ReferenceLaptimeEntry | null;
  variant?: 'grid' | 'pills';
  className?: string;
}

export const BenchmarkTargetsGrid: React.FC<BenchmarkTargetsGridProps> = ({
  benchmark,
  variant = 'grid',
  className = '',
}) => {
  if (!benchmark) return null;

  const { targets } = benchmark;

  if (variant === 'pills') {
    return (
      <div className={`pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="px-2.5 py-1 rounded bg-lmu-purple-deep/60 text-lmu-purple-soft border border-lmu-purple-strong/40 text-xs font-mono">
          👾 Alien: <strong className="text-white ml-0.5">{formatTime(targets.alienSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-lmu-warn-deep/60 text-lmu-warn-soft border border-lmu-warn-strong/40 text-xs font-mono">
          🏆 Competitive: <strong className="text-white ml-0.5">{formatTime(targets.competitiveSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-lmu-gain-deep/60 text-lmu-gain-soft border border-lmu-gain-strong/40 text-xs font-mono">
          ⭐ Good: <strong className="text-white ml-0.5">{formatTime(targets.goodSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-lmu-info-deep/60 text-lmu-info-soft border border-lmu-info-strong/40 text-xs font-mono">
          🏎️ Midpack: <strong className="text-white ml-0.5">{formatTime(targets.midpackSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-lmu-orange-deep/60 text-lmu-orange-soft border border-lmu-orange-strong/40 text-xs font-mono">
          🐢 Tail-ender: <strong className="text-white ml-0.5">{formatTime(targets.tailEnderSec)}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 ${className}`}>
      {/* Alien ~100% */}
      <div className="backdrop-blur-md border border-lmu-purple-strong/30 bg-lmu-purple-deep/20 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-purple-deep text-lmu-purple-soft border border-lmu-purple-strong/40">
          👾 Alien (~100%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-purple-soft font-mono mt-1">
          {formatTime(targets.alienSec)}
        </h4>
        <p className="text-[10px] text-lmu-purple/80">Target Benchmark</p>
      </div>

      {/* Competitive 101% */}
      <div className="backdrop-blur-md border border-lmu-warn-strong/30 bg-lmu-warn-deep/20 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-warn-deep text-lmu-warn-soft border border-lmu-warn-strong/40">
          🏆 Competitive (101%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-warn-soft font-mono mt-1">
          {formatTime(targets.competitiveSec)}
        </h4>
        <p className="text-[10px] text-lmu-warn/80">+1% off Alien</p>
      </div>

      {/* Good 102% */}
      <div className="backdrop-blur-md border border-lmu-gain-strong/30 bg-lmu-gain-deep/20 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-gain-deep text-lmu-gain-soft border border-lmu-gain-strong/40">
          ⭐ Good (102%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-gain-soft font-mono mt-1">
          {formatTime(targets.goodSec)}
        </h4>
        <p className="text-[10px] text-lmu-gain/80">+2% off Alien</p>
      </div>

      {/* Midpack 104% */}
      <div className="backdrop-blur-md border border-lmu-info-strong/30 bg-lmu-info-deep/20 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-info-deep text-lmu-info-soft border border-lmu-info-strong/40">
          🏎️ Midpack (104%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-info-soft font-mono mt-1">
          {formatTime(targets.midpackSec)}
        </h4>
        <p className="text-[10px] text-lmu-info/80">+4% off Alien</p>
      </div>

      {/* Tail-ender 106% */}
      <div className="backdrop-blur-md border border-lmu-orange-strong/30 bg-lmu-orange-deep/20 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-orange-deep text-lmu-orange-soft border border-lmu-orange-strong/40">
          🐢 Tail-ender (106%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-orange-soft font-mono mt-1">
          {formatTime(targets.tailEnderSec)}
        </h4>
        <p className="text-[10px] text-lmu-orange/80">+6% off Alien</p>
      </div>

      {/* Offline 107% */}
      <div className="backdrop-blur-md border border-lmu-rule/40 bg-lmu-card/30 p-3.5 rounded-xl text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-lmu-raised text-lmu-muted border border-lmu-rule">
          💤 Offline (&gt;107%)
        </span>
        <h4 className="text-lg font-extrabold text-lmu-text-soft font-mono mt-1">
          {formatTime(targets.tailEnderSec ? targets.tailEnderSec * 1.01 : null)}
        </h4>
        <p className="text-[10px] text-lmu-muted/80">+7% off Alien</p>
      </div>
    </div>
  );
};
