import React from 'react';
import { Activity } from 'lucide-react';

export interface ReplayTimelineFooterProps {
  currentIndex: number;
  totalPoints: number;
  currentTimeSec?: number;
  onChangeIndex: (index: number) => void;
}

export const ReplayTimelineFooter: React.FC<ReplayTimelineFooterProps> = ({
  currentIndex,
  totalPoints,
  currentTimeSec,
  onChangeIndex,
}) => {
  return (
    <div className="p-3 rounded-xl bg-lmu-card/80 border border-lmu-border flex flex-col gap-2 shrink-0">
      <div className="flex items-center justify-between text-xs text-lmu-muted">
        <span className="font-semibold text-white flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-lmu-accent" />
          Synchronized Telemetry Cursor
        </span>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-white font-bold">
            {currentTimeSec?.toFixed(2) ?? '0.00'}s
          </span>
          <span>
            Frame {(currentIndex + 1).toLocaleString()} / {totalPoints.toLocaleString()}
          </span>
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={Math.max(0, totalPoints - 1)}
        value={currentIndex}
        onChange={e => onChangeIndex(parseInt(e.target.value, 10))}
        className="w-full accent-lmu-accent cursor-pointer h-2 rounded-lg bg-lmu-border"
      />
    </div>
  );
};
