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

      {colorBy === 'throttle' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Throttle:</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#64748b]" /> 0%
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" /> 100%
          </span>
        </div>
      )}

      {colorBy === 'brake' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Brake:</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#64748b]" /> 0%
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> 100%
          </span>
        </div>
      )}

      {colorBy === 'steering' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Steering:</span>
          <span className="flex items-center gap-1 text-indigo-400">
            <span className="w-2 h-2 rounded-full bg-[#818cf8]" /> Left
          </span>
          <span>|</span>
          <span className="text-slate-400">Center</span>
          <span>|</span>
          <span className="flex items-center gap-1 text-orange-400">
            <span className="w-2 h-2 rounded-full bg-[#f97316]" /> Right
          </span>
        </div>
      )}
    </div>
  );
};
