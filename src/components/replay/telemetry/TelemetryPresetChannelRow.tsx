import React from 'react';
import { ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { TelemetryChannelInfo, TelemetryChannelId } from './telemetryPresets.js';

export interface TelemetryPresetChannelRowProps {
  channel: TelemetryChannelInfo;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (id: TelemetryChannelId) => void;
  onMove: (id: TelemetryChannelId, direction: 'up' | 'down') => void;
}

export const TelemetryPresetChannelRow: React.FC<TelemetryPresetChannelRowProps> = React.memo(({
  channel,
  isActive,
  isFirst,
  isLast,
  onToggle,
  onMove,
}) => {
  return (
    <div
      className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all ${
        isActive
          ? 'bg-sky-950/40 border-sky-500/40'
          : 'bg-black/20 border-white/5 opacity-60 hover:opacity-100'
      }`}
    >
      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => onToggle(channel.id)}
          className="w-3.5 h-3.5 rounded bg-black border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
        />
        <span className={`px-1.5 py-0.2 rounded font-black text-[9px] tracking-wider shrink-0 ${channel.badgeColor}`}>
          {channel.shortName}
        </span>
        {channel.isComputed ? (
          <span className="px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5 shrink-0">
            <Sparkles className="w-2.5 h-2.5" /> COMPUTED
          </span>
        ) : channel.category === 'wheels' ? (
          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[8px] tracking-wider shrink-0">
            WHEEL / TIRE
          </span>
        ) : channel.category === 'energy' ? (
          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[8px] tracking-wider shrink-0">
            ENERGY / FUEL
          </span>
        ) : (
          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-bold text-[8px] tracking-wider shrink-0">
            DIRECT
          </span>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold text-white truncate">
            {channel.name}
          </span>
          <span className="text-[9px] text-lmu-muted truncate">
            {channel.description} ({channel.unit})
          </span>
        </div>
      </label>

      {isActive && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(channel.id, 'up')}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-slate-300 cursor-pointer disabled:cursor-not-allowed"
            title="Move channel up"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(channel.id, 'down')}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-slate-300 cursor-pointer disabled:cursor-not-allowed"
            title="Move channel down"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
});
