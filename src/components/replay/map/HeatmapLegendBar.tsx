import React from 'react';
import { MapColorMode } from './replayMapUtils.js';

export interface HeatmapLegendBarProps {
  colorBy: MapColorMode;
  className?: string;
}

export const HeatmapLegendBar: React.FC<HeatmapLegendBarProps> = ({
  colorBy,
  className = '',
}) => {
  return (
    <div
      className={`absolute bottom-2 left-2 z-20 flex items-center gap-2 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] shadow-lg pointer-events-none font-mono ${className}`}
    >
      {colorBy === 'speed' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Speed:</span>
          <span className="flex items-center gap-1 text-sky-400">
            <span className="w-2 h-2 rounded-full bg-[#0284c7]" /> Apex
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Mid
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> High
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-fuchsia-400">
            <span className="w-2 h-2 rounded-full bg-[#c026d3]" /> Max
          </span>
        </div>
      )}

      {colorBy === 'pedal' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Pedal:</span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Brake
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#475569]" /> Coast
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Throttle
          </span>
        </div>
      )}

      {colorBy === 'delta' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Delta:</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" /> Gaining
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#475569]" /> Even
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Losing
          </span>
        </div>
      )}
    </div>
  );
};
