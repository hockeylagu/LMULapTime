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
      className={`absolute bottom-2 left-2 z-20 flex items-center gap-2 bg-lmu-strip/90 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] shadow-lg pointer-events-none font-mono ${className}`}
    >
      {colorBy === 'speed' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Speed:</span>
          <span className="flex items-center gap-1 text-sky-400">
            <span className="w-2 h-2 rounded-full bg-sky-600" /> Apex
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Mid
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> High
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-fuchsia-400">
            <span className="w-2 h-2 rounded-full bg-fuchsia-600" /> Max
          </span>
        </div>
      )}

      {colorBy === 'pedal' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Pedal:</span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Brake
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-600" /> Coast
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Throttle
          </span>
        </div>
      )}

      {colorBy === 'delta' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase">Delta:</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Gaining
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-600" /> Even
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Losing
          </span>
        </div>
      )}
    </div>
  );
};
