import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Clock } from 'lucide-react';
import { ComparableLap } from '../../../shared/types/index.js';
import { formatTime } from '../../../shared/domain/formatters.js';
import { LMU_COLORS, CHART_COLORS, TELEMETRY_COLORS } from '../../utils/themeColors.js';
import { plainTag } from './CompareLapCard.js';

export interface CompareSectorChartDataItem {
  metric: string;
  metricKey: 's1' | 's2' | 's3' | 'lapTime';
  [key: string]: string | number;
}

export interface SectorTooltipPayloadItem {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: number | string | null;
  name?: string;
  color?: string;
}

export interface CompareSectorChartProps {
  selectedLaps: ComparableLap[];
  comparedLaps: ComparableLap[];
  baselineLap: ComparableLap | null;
  chartData: CompareSectorChartDataItem[];
}

export interface CompareSectorTooltipProps {
  active?: boolean;
  payload?: SectorTooltipPayloadItem[];
  label?: string;
  chartData?: CompareSectorChartDataItem[];
  selectedLaps?: ComparableLap[];
  baselineLap?: ComparableLap | null;
}

export const CompareSectorTooltip: React.FC<CompareSectorTooltipProps> = ({
  active,
  payload,
  label,
  chartData = [],
  selectedLaps = [],
  baselineLap,
}) => {
  if (!active || !payload || !payload.length || !baselineLap) return null;
  const metricItem = chartData.find((d) => d.metric === label);
  const metricKey = metricItem?.metricKey as 's1' | 's2' | 's3' | 'lapTime' | undefined;

  const seen = new Set<string>();
  const uniquePayload = payload.filter((p) => {
    const key = String(p.dataKey || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 font-mono">
      <div className="flex items-center justify-between gap-4 border-b border-lmu-border/60 pb-1 mb-1 font-sans">
        <p className="font-bold text-white">{label} Delta vs Baseline</p>
        <span className="text-[10px] text-lmu-gold">
          Base: {plainTag(baselineLap.tag) || `Lap ${baselineLap.lapNum || '-'}`}
        </span>
      </div>
      {uniquePayload.map((p) => {
        const key = String(p.dataKey || '');
        const lap = selectedLaps.find((l) => l.id === key);
        const isBase = lap?.id === baselineLap.id;
        const rawSecVal = metricKey && lap ? lap[metricKey] : null;
        const deltaVal = Number(p.value) || 0;

        const deltaColor = isBase
          ? LMU_COLORS.gold
          : deltaVal < 0
          ? TELEMETRY_COLORS.gain
          : deltaVal > 0
          ? TELEMETRY_COLORS.loss
          : LMU_COLORS.muted;

        const formattedDelta = isBase
          ? '±0.000s (Baseline)'
          : deltaVal > 0
          ? `+${deltaVal.toFixed(3)}s`
          : deltaVal < 0
          ? `${deltaVal.toFixed(3)}s`
          : '0.000s';

        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                style={{ backgroundColor: p.color || deltaColor }}
              />
              <span className="text-white font-medium">
                {plainTag(lap?.tag) || p.name || key}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span style={{ color: deltaColor }} className="font-bold">
                {formattedDelta}
              </span>
              {rawSecVal !== null && rawSecVal !== undefined && (
                <span className="text-lmu-muted text-[11px] font-mono">
                  ({formatTime(rawSecVal)})
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const CompareSectorChart: React.FC<CompareSectorChartProps> = ({
  selectedLaps,
  comparedLaps,
  baselineLap,
  chartData,
}) => {
  if (selectedLaps.length <= 1 || !baselineLap) return null;

  return (
    <div className="pt-4 border-t border-lmu-border/60">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-lmu-accent-text" />
          Sector gaps
        </h4>

        <div className="text-[11px] font-mono flex flex-wrap items-center gap-3">
          <span className="text-lmu-gain font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-lmu-gain inline-block" />
            Negative = Faster
          </span>
          <span className="text-lmu-loss font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-lmu-loss inline-block" />
            Positive = Slower
          </span>
        </div>
      </div>

      <div className="h-64 min-h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} opacity={0.5} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeDasharray="3 3" />
            <XAxis dataKey="metric" stroke={CHART_COLORS.axis} tick={{ fill: LMU_COLORS.muted, fontSize: 11 }} />
            <YAxis
              stroke={CHART_COLORS.axis}
              tick={{ fill: LMU_COLORS.muted, fontSize: 11 }}
              tickFormatter={(val) =>
                val === 0 ? '0.000s' : val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`
              }
            />
            <Tooltip cursor={{ fill: CHART_COLORS.hoverBand }} content={<CompareSectorTooltip chartData={chartData} selectedLaps={selectedLaps} baselineLap={baselineLap} />} />
            {comparedLaps.filter((lap) => lap.id !== baselineLap.id).map((lap) => (
              <Bar key={lap.id} dataKey={lap.id} name={plainTag(lap.tag) || `Lap ${lap.lapNum || '-'}`} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, entryIndex) => {
                  const val = Number(entry[lap.id] || 0);
                  const cellColor =
                    val < 0
                      ? TELEMETRY_COLORS.gain // Green for faster / time gained
                      : val > 0
                      ? TELEMETRY_COLORS.loss // Red for slower / time lost
                      : LMU_COLORS.muted; // Neutral for 0
                  return <Cell key={`cell-${lap.id}-${entryIndex}`} fill={cellColor} />;
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
