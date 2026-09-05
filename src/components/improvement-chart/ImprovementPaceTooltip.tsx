import React from 'react';
import { formatTime } from '../../utils/formatters.js';
import { ImprovementTooltipPayloadEntry } from './ImprovementPaceChart.js';

export interface ImprovementPaceTooltipProps {
  active?: boolean;
  payload?: ImprovementTooltipPayloadEntry[];
  onSelectSession?: (sessionId: string) => void;
}

export const ImprovementPaceTooltip: React.FC<ImprovementPaceTooltipProps> = ({
  active,
  payload,
  onSelectSession,
}) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const seen = new Set<string>();
  const uniqueEntries = payload.filter((entry) => {
    if (entry.value === null || entry.value === undefined || isNaN(Number(entry.value))) {
      return false;
    }
    const key = String(entry.dataKey || entry.name || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="bg-lmu-card/95 backdrop-blur-md border border-lmu-border p-3.5 rounded-xl shadow-xl space-y-2 text-xs min-w-[210px]">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-white text-sm">{data.session}</span>
          {data.weather && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg border border-lmu-border/60 text-lmu-cyan">
              {data.weather}
            </span>
          )}
        </div>
        <p className="text-[11px] text-lmu-muted mt-0.5">{data.fullDate}</p>
        <p className="text-xs text-lmu-gold font-medium mt-0.5 truncate max-w-[200px]" title={data.car}>
          {data.car}
        </p>
      </div>

      {uniqueEntries.length > 0 && (
        <div className="border-t border-lmu-border/60 pt-2 space-y-1">
          {uniqueEntries.map((entry, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between text-xs font-mono">
              <span style={{ color: entry.color }} className="font-sans font-medium text-[11px]">
                {entry.name}:
              </span>
              <span className="font-bold text-white">
                {entry.dataKey === 'consistencyScore'
                  ? `${Number(entry.value).toFixed(1)}%`
                  : formatTime(Number(entry.value))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] text-lmu-muted border-t border-lmu-border/40 font-mono">
        {data.top3AvgStr && (
          <span title="Average of 3 fastest valid laps in session">
            Top 3: <strong className="text-cyan-300 font-mono">{data.top3AvgStr}</strong>
          </span>
        )}
        {data.theoreticalGap !== null && (
          <span title="Gap between actual PB and theoretical best">
            Opt Gap: <strong className="text-emerald-300 font-mono">+{data.theoreticalGap.toFixed(3)}s</strong>
          </span>
        )}
        {data.consistencyScore !== null && (
          <span title="Pace consistency rating">
            Consist: <strong className="text-emerald-300 font-mono">{data.consistencyScore.toFixed(1)}%</strong>
          </span>
        )}
      </div>

      {onSelectSession && (
        <p className="text-[10px] text-lmu-accent pt-1.5 border-t border-lmu-border/40 text-center font-semibold cursor-pointer hover:underline">
          Click dot to view session telemetry &rarr;
        </p>
      )}
    </div>
  );
};
