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
          ? 'bg-lmu-info-deep/40 border-lmu-info-strong/40'
          : 'bg-black/20 border-white/5 text-lmu-muted hover:border-lmu-rule'
      }`}
    >
      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => onToggle(channel.id)}
          className="w-3.5 h-3.5 rounded bg-black border-lmu-rule text-lmu-info-strong focus:ring-0 cursor-pointer"
        />
        <span className={`px-1.5 py-px rounded font-black text-[10px] tracking-wider shrink-0 ${channel.badgeColor}`}>
          {channel.shortName}
        </span>
        {channel.isComputed ? (
          <span className="px-1.5 py-px rounded bg-lmu-violet-strong/20 text-lmu-violet-soft font-bold text-[10px] tracking-wider flex items-center gap-0.5 shrink-0">
            <Sparkles className="w-2.5 h-2.5" /> COMPUTED
          </span>
        ) : channel.category === 'wheels' ? (
          <span className="px-1.5 py-px rounded bg-lmu-warn-strong/20 text-lmu-warn-soft font-bold text-[10px] tracking-wider shrink-0">
            WHEEL / TIRE
          </span>
        ) : channel.category === 'energy' ? (
          <span className="px-1.5 py-px rounded bg-lmu-gain-strong/20 text-lmu-gain-soft font-bold text-[10px] tracking-wider shrink-0">
            ENERGY / FUEL
          </span>
        ) : (
          <span className="px-1.5 py-px rounded bg-lmu-raised text-lmu-muted font-bold text-[10px] tracking-wider shrink-0">
            DIRECT
          </span>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold text-white truncate">
            {channel.name}
          </span>
          <span className="text-[10px] text-lmu-muted truncate">
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
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-lmu-text-soft cursor-pointer disabled:cursor-not-allowed"
            title="Move channel up"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(channel.id, 'down')}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-lmu-text-soft cursor-pointer disabled:cursor-not-allowed"
            title="Move channel down"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
});
