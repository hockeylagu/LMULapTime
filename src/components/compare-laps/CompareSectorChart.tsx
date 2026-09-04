import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Clock } from 'lucide-react';
import { ComparableLap } from '../../utils/lapComparison';
import { formatTime } from '../../utils/formatters';

export interface CompareSectorChartProps {
  selectedLaps: ComparableLap[];
  comparedLaps: ComparableLap[];
  baselineLap: ComparableLap | null;
  chartData: any[];
}

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
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-lmu-accent" />
            Sector Telemetry Breakdown (Time Difference vs Baseline)
          </h4>
          <p className="text-[11px] text-lmu-muted mt-0.5">
            Baseline Reference:{' '}
            <strong className="text-lmu-gold">
              {baselineLap.tag || `Lap ${baselineLap.lapNum || '-'}`}
            </strong>{' '}
            ({baselineLap.lapTimeString})
          </p>
        </div>

        <div className="text-[11px] font-mono flex items-center gap-3">
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Negative = Faster
          </span>
          <span className="text-rose-400 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
            Positive = Slower
          </span>
        </div>
      </div>

      <div className="h-64 min-h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.5} />
            <ReferenceLine y={0} stroke="#718096" strokeDasharray="3 3" />
            <XAxis dataKey="metric" stroke="#718096" tick={{ fill: '#A0AEC0', fontSize: 11 }} />
            <YAxis
              stroke="#718096"
              tick={{ fill: '#A0AEC0', fontSize: 11 }}
              tickFormatter={(val) =>
                val === 0 ? '0.000s' : val > 0 ? `+${val.toFixed(2)}s` : `${val.toFixed(2)}s`
              }
            />
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload || !payload.length) return null;
                const metricItem = chartData.find((d) => d.metric === label);
                const metricKey = metricItem?.metricKey as 's1' | 's2' | 's3' | 'lapTime' | undefined;

                return (
                  <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 font-mono">
                    <div className="flex items-center justify-between gap-4 border-b border-lmu-border/60 pb-1 mb-1 font-sans">
                      <p className="font-bold text-white">{label} Delta vs Baseline</p>
                      <span className="text-[10px] text-lmu-gold">
                        Base: {baselineLap.tag || `Lap ${baselineLap.lapNum || '-'}`}
                      </span>
                    </div>
                    {(() => {
                      const seen = new Set<string>();
                      const uniquePayload = payload.filter((p: any) => {
                        const key = String(p.dataKey || '');
                        if (!key || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });

                      return uniquePayload.map((p: any) => {
                        const lap = selectedLaps.find((l) => l.id === p.dataKey);
                        const isBase = lap?.id === baselineLap.id;
                        const rawSecVal = metricKey && lap ? lap[metricKey] : null;
                        const deltaVal = p.value as number;

                        const deltaColor = isBase
                          ? '#ECC94B'
                          : deltaVal < 0
                          ? '#48BB78'
                          : deltaVal > 0
                          ? '#F56565'
                          : '#A0AEC0';

                        const formattedDelta = isBase
                          ? '±0.000s (Baseline)'
                          : deltaVal > 0
                          ? `+${deltaVal.toFixed(3)}s`
                          : deltaVal < 0
                          ? `${deltaVal.toFixed(3)}s`
                          : '0.000s';

                        return (
                          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                            <span style={{ color: p.color }} className="font-semibold truncate max-w-[140px]">
                              {lap?.tag || `Lap ${lap?.lapNum || '-'}`}:
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold font-mono" style={{ color: deltaColor }}>
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
                      });
                    })()}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
            {comparedLaps.map((lap) => (
              <Bar key={lap.id} dataKey={lap.id} name={lap.tag || `Lap ${lap.lapNum || '-'}`} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, entryIndex) => {
                  const val = (entry as any)[lap.id] as number;
                  const cellColor =
                    val < 0
                      ? '#10B981' // Green for faster / time gained
                      : val > 0
                      ? '#EF4444' // Red for slower / time lost
                      : '#718096'; // Neutral for 0
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
