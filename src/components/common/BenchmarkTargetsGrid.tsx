import React from 'react';
import { Zap } from 'lucide-react';
import { ReferenceLaptimeEntry } from '../../../server/types';
import { formatTime } from '../../utils/formatters';

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

  const { targets, carClass } = benchmark;

  if (variant === 'pills') {
    return (
      <div className={`pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="font-bold text-lmu-gold flex items-center gap-1.5 mr-1">
          <Zap className="w-4 h-4 text-lmu-gold" />
          {carClass} Reference Targets:
        </span>
        <span className="px-2.5 py-1 rounded bg-purple-950/60 text-purple-300 border border-purple-500/40 text-xs font-mono">
          👾 Alien: <strong className="text-white ml-0.5">{formatTime(targets.alienSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 text-xs font-mono">
          🏆 Competitive: <strong className="text-white ml-0.5">{formatTime(targets.competitiveSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-xs font-mono">
          ⭐ Good: <strong className="text-white ml-0.5">{formatTime(targets.goodSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40 text-xs font-mono">
          🏎️ Midpack: <strong className="text-white ml-0.5">{formatTime(targets.midpackSec)}</strong>
        </span>
        <span className="px-2.5 py-1 rounded bg-orange-950/60 text-orange-300 border border-orange-500/40 text-xs font-mono">
          🐢 Tail-ender: <strong className="text-white ml-0.5">{formatTime(targets.tailEnderSec)}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 ${className}`}>
      {/* Alien ~100% */}
      <div className="glass-panel p-3.5 rounded-xl border-purple-500/30 bg-purple-950/20 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-500/40">
          👾 Alien (~100%)
        </span>
        <h4 className="text-lg font-extrabold text-purple-300 font-mono mt-1">
          {formatTime(targets.alienSec)}
        </h4>
        <p className="text-[10px] text-purple-400/80">Target Benchmark</p>
      </div>

      {/* Competitive 101% */}
      <div className="glass-panel p-3.5 rounded-xl border-amber-500/30 bg-amber-950/20 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
          🏆 Competitive (101%)
        </span>
        <h4 className="text-lg font-extrabold text-amber-300 font-mono mt-1">
          {formatTime(targets.competitiveSec)}
        </h4>
        <p className="text-[10px] text-amber-400/80">+1% off Alien</p>
      </div>

      {/* Good 102% */}
      <div className="glass-panel p-3.5 rounded-xl border-emerald-500/30 bg-emerald-950/20 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
          ⭐ Good (102%)
        </span>
        <h4 className="text-lg font-extrabold text-emerald-300 font-mono mt-1">
          {formatTime(targets.goodSec)}
        </h4>
        <p className="text-[10px] text-emerald-400/80">+2% off Alien</p>
      </div>

      {/* Midpack 104% */}
      <div className="glass-panel p-3.5 rounded-xl border-sky-500/30 bg-sky-950/20 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40">
          🏎️ Midpack (104%)
        </span>
        <h4 className="text-lg font-extrabold text-sky-300 font-mono mt-1">
          {formatTime(targets.midpackSec)}
        </h4>
        <p className="text-[10px] text-sky-400/80">+4% off Alien</p>
      </div>

      {/* Tail-ender 106% */}
      <div className="glass-panel p-3.5 rounded-xl border-orange-500/30 bg-orange-950/20 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-500/40">
          🐢 Tail-ender (106%)
        </span>
        <h4 className="text-lg font-extrabold text-orange-300 font-mono mt-1">
          {formatTime(targets.tailEnderSec)}
        </h4>
        <p className="text-[10px] text-orange-400/80">+6% off Alien</p>
      </div>

      {/* Offline 107% */}
      <div className="glass-panel p-3.5 rounded-xl border-zinc-700/40 bg-zinc-900/30 text-center space-y-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
          💤 Offline (&gt;107%)
        </span>
        <h4 className="text-lg font-extrabold text-zinc-300 font-mono mt-1">
          {formatTime(targets.tailEnderSec ? targets.tailEnderSec * 1.01 : null)}
        </h4>
        <p className="text-[10px] text-zinc-400/80">+7% off Alien</p>
      </div>
    </div>
  );
};
