import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ConsistencyMetricStat } from '../../../utils/cornerAnalysis.js';

export function consistencyClass(pct: number): string {
  if (pct <= 0.3) return 'text-lmu-green';
  if (pct <= 0.8) return 'text-amber-400';
  return 'text-rose-400';
}

export function MetricChart({
  stat,
  unit,
  decimals,
  currentLapNumber,
  bestLapNumber,
  onSelectBaselineLap,
}: {
  stat: ConsistencyMetricStat;
  unit: string;
  decimals: number;
  currentLapNumber?: number;
  bestLapNumber?: number;
  onSelectBaselineLap?: (lapNumber: number) => void;
}) {
  const data = stat.samples.map(s => ({ lap: `L${s.lapNumber}`, value: Number(s.value.toFixed(decimals)), lapNumber: s.lapNumber }));

  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="lap" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={{ stroke: '#334155' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 9, fill: '#64748b' }}
            width={36}
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
            tickFormatter={v => `${v}`}
          />
          <ReferenceLine y={stat.avg} stroke="#f59e0b" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ background: '#0a0e17', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color: '#e2e8f0' }}
            formatter={(value: unknown) => [`${Number(value).toFixed(decimals)}${unit}`]}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} minPointSize={10} cursor={onSelectBaselineLap ? 'pointer' : 'default'}>
            {data.map(d => (
              <Cell
                key={d.lapNumber}
                data-testid={onSelectBaselineLap ? `baseline-bar-${d.lapNumber}` : undefined}
                fill={d.lapNumber === currentLapNumber ? '#a855f7' : d.lapNumber === bestLapNumber ? '#22c55e' : '#38bdf8'}
                cursor={onSelectBaselineLap ? 'pointer' : 'default'}
                aria-label={onSelectBaselineLap ? `Double-click to compare against lap ${d.lapNumber}` : undefined}
                tabIndex={onSelectBaselineLap ? 0 : undefined}
                role={onSelectBaselineLap ? 'button' : undefined}
                onDoubleClick={() => onSelectBaselineLap?.(d.lapNumber)}
                onKeyDown={(e) => {
                  if (!onSelectBaselineLap) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectBaselineLap(d.lapNumber);
                  }
                }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricRow({
  label,
  stat,
  unit,
  decimals,
  isExpanded,
  onToggle,
  currentLapNumber,
  bestLapNumber,
  onSelectBaselineLap,
}: {
  label: string;
  stat: ConsistencyMetricStat | null;
  unit: string;
  decimals: number;
  isExpanded: boolean;
  onToggle: () => void;
  currentLapNumber?: number;
  bestLapNumber?: number;
  onSelectBaselineLap?: (lapNumber: number) => void;
}) {
  return (
    <>
      <tr
        className={`border-t border-lmu-border/40 hover:bg-lmu-card/50 transition-colors ${stat ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-lmu-accent/10' : ''}`}
        onClick={() => stat && onToggle()}
      >
        <td className="px-2 py-1.5 font-bold text-white">{label}</td>
        <td className="px-2 py-1.5 text-right text-lmu-green">{stat ? `${stat.min.toFixed(decimals)}${unit}` : '--'}</td>
        <td className="px-2 py-1.5 text-right text-white">{stat ? `${stat.avg.toFixed(decimals)}${unit}` : '--'}</td>
        <td className="px-2 py-1.5 text-right text-rose-400">{stat ? `${stat.max.toFixed(decimals)}${unit}` : '--'}</td>
        <td className="px-2 py-1.5 text-right text-white">{stat ? `±${stat.stdDev.toFixed(decimals)}${unit}` : '--'}</td>
        <td className={`px-2 py-1.5 text-right font-bold ${stat ? consistencyClass(stat.consistencyPct) : 'text-lmu-muted'}`}>
          {stat ? `${stat.consistencyPct.toFixed(1)}%` : '--'}
        </td>
      </tr>
      {isExpanded && stat && (
        <tr className="bg-lmu-card/20">
          <td colSpan={6} className="px-2 py-2">
            <MetricChart stat={stat} unit={unit} decimals={decimals} currentLapNumber={currentLapNumber} bestLapNumber={bestLapNumber} onSelectBaselineLap={onSelectBaselineLap} />
          </td>
        </tr>
      )}
    </>
  );
}

export function LeastConsistentBadge({
  label,
  stdDevSec,
  consistencyPct,
}: {
  label: string;
  stdDevSec: number;
  consistencyPct: number;
}) {
  return (
    <div className="m-3 mb-0 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2 shrink-0">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        <span className="font-bold">{label}</span> is your least consistent section
        (±{stdDevSec.toFixed(3)}s, {consistencyPct.toFixed(1)}% variance)
      </span>
    </div>
  );
}
