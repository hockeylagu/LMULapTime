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
          <span className="font-bold text-white uppercase tracking-wider">Speed:</span>
          <span className="flex items-center gap-1 text-lmu-info">
            <span className="w-2 h-2 rounded-full bg-lmu-info-strong" /> Apex
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-lmu-gain">
            <span className="w-2 h-2 rounded-full bg-lmu-gain-strong" /> Mid
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-lmu-warn">
            <span className="w-2 h-2 rounded-full bg-lmu-warn-strong" /> High
          </span>
          <span>→</span>
          <span className="flex items-center gap-1 text-lmu-purple">
            <span className="w-2 h-2 rounded-full bg-lmu-purple-strong" /> Max
          </span>
        </div>
      )}

      {colorBy === 'pedal' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase tracking-wider">Pedal:</span>
          <span className="flex items-center gap-1 text-lmu-loss">
            <span className="w-2 h-2 rounded-full bg-lmu-loss-strong" /> Brake
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-lmu-muted">
            <span className="w-2 h-2 rounded-full bg-lmu-rule-strong" /> Coast
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-lmu-gain">
            <span className="w-2 h-2 rounded-full bg-lmu-gain-strong" /> Throttle
          </span>
        </div>
      )}

      {colorBy === 'delta' && (
        <div className="flex items-center gap-1.5 text-lmu-muted">
          <span className="font-bold text-white uppercase tracking-wider">Delta:</span>
          <span className="flex items-center gap-1 text-lmu-gain">
            <span className="w-2 h-2 rounded-full bg-lmu-gain-strong" /> Gaining
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-lmu-muted">
            <span className="w-2 h-2 rounded-full bg-lmu-rule-strong" /> Even
          </span>
          <span>|</span>
          <span className="flex items-center gap-1 text-lmu-loss">
            <span className="w-2 h-2 rounded-full bg-lmu-loss-strong" /> Losing
          </span>
        </div>
      )}
    </div>
  );
};
