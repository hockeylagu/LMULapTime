import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { TelemetryChannelInfo, TelemetryChannelId } from './telemetryPresets.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

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
  const description = `${channel.description} (${channel.unit})`;
  const descriptionRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  // A cut-off description offers More; measured while it is one line.
  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (element && !expanded) setCut(element.scrollWidth > element.clientWidth);
  }, [description, expanded]);
  return (
    <div
      className={`px-2 py-2 border-b border-lmu-border/50 flex items-center justify-between gap-2 transition-colors ${
        isActive
          ? 'bg-lmu-raised/25'
          : 'text-lmu-muted hover:bg-white/5'
      }`}
    >
      <label className="grid grid-cols-[14px_90px_96px_minmax(0,1fr)] items-center gap-x-2.5 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => onToggle(channel.id)}
          className="w-3.5 h-3.5 rounded bg-black border-lmu-rule accent-lmu-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text cursor-pointer"
        />
        <span className={`whitespace-nowrap justify-self-start px-1.5 py-px rounded font-mono font-bold text-[10px] tracking-wider shrink-0 ${channel.badgeColor}`}>
          {channel.shortName}
        </span>
        {channel.isComputed ? (
          <span className="whitespace-nowrap justify-self-start px-1.5 py-px rounded text-lmu-muted font-bold text-[10px] tracking-wider flex items-center gap-0.5 shrink-0">
            <Sparkles className="w-2.5 h-2.5" /> COMPUTED
          </span>
        ) : channel.category === 'wheels' ? (
          <span className="whitespace-nowrap justify-self-start px-1.5 py-px rounded text-lmu-muted font-bold text-[10px] tracking-wider shrink-0">
            WHEEL / TIRE
          </span>
        ) : channel.category === 'energy' ? (
          <span className="whitespace-nowrap justify-self-start px-1.5 py-px rounded text-lmu-muted font-bold text-[10px] tracking-wider shrink-0">
            ENERGY / FUEL
          </span>
        ) : (
          <span className="whitespace-nowrap justify-self-start px-1.5 py-px rounded text-lmu-muted font-bold text-[10px] tracking-wider shrink-0">
            DIRECT
          </span>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] font-medium text-white truncate">
            {channel.name}
          </span>
          <span ref={descriptionRef} title={description} className={`text-[10px] text-lmu-muted ${expanded ? '' : 'truncate'}`}>
            {description}
          </span>
        </div>
      </label>
      {(cut || expanded) && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
          className={`self-end shrink-0 px-1 text-[10px] font-semibold text-lmu-text-soft hover:text-lmu-text cursor-pointer rounded ${FOCUS_RING}`}>
          {expanded ? 'Less' : 'More'}
        </button>
      )}

      {isActive && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(channel.id, 'up')}
            className={`p-1 rounded hover:bg-white/10 text-lmu-text-soft disabled:text-lmu-faint disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`}
            title="Move channel up"
            aria-label="Move channel up"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(channel.id, 'down')}
            className={`p-1 rounded hover:bg-white/10 text-lmu-text-soft disabled:text-lmu-faint disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`}
            title="Move channel down"
            aria-label="Move channel down"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
});
