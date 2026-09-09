import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, Flag, Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { LapConsistencyStats } from '../../utils/lapConsistency.js';
import { ConsistencyMetricStat, CornerConsistencyStat } from '../../utils/cornerAnalysis.js';
import { MiniCornerMap } from './MiniCornerMap.js';

export interface LapConsistencyOption {
  lapNumber: number;
  lapTimeSec: number;
  // Invalid/outlap laps are still listed (and toggleable) but start pre-excluded.
  isValid: boolean;
}

export interface ConsistencyPanelProps {
  stats: LapConsistencyStats;
  cornerStats?: CornerConsistencyStat[];
  isLoadingCornerStats?: boolean;
  onSelectCorner?: (cornerNumber: number) => void;
  onSelectBaselineLap?: (lapNumber: number) => void;
  formatLapTime: (sec?: number | null) => string;
  trackPoints?: ReplayTrajectoryPoint[];
  trackBounds?: { minX: number; maxX: number; minZ: number; maxZ: number; spanX: number; spanZ: number } | null;
  availableLaps?: LapConsistencyOption[];
  excludedLaps?: Set<number>;
  onToggleLapExclusion?: (lapNumber: number) => void;
  // Highlighted in the per-lap drill-down charts so it's obvious which bar is the lap currently
  // being viewed in the inspector.
  currentLapNumber?: number;
  className?: string;
}

function consistencyClass(pct: number): string {
  if (pct <= 0.3) return 'text-lmu-green';
  if (pct <= 0.8) return 'text-amber-400';
  return 'text-rose-400';
}

// Dropdown multi-select listing every sampled lap with its lap time, so the driver can
// deselect specific laps (outliers - spins, traffic, etc.) without losing sight of which
// lap is which time.
function LapSelectorDropdown({
  availableLaps,
  excludedLaps,
  onToggleLapExclusion,
  formatLapTime,
}: {
  availableLaps: LapConsistencyOption[];
  excludedLaps: Set<number>;
  onToggleLapExclusion: (lapNumber: number) => void;
  formatLapTime: (sec?: number | null) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const includedCount = availableLaps.length - excludedLaps.size;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-lmu-card/60 border border-lmu-border/60 text-[11px] font-mono font-semibold text-white hover:border-lmu-accent transition-colors cursor-pointer"
      >
        <span>{includedCount}/{availableLaps.length} laps included</span>
        <ChevronDown className={`w-3 h-3 text-lmu-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-8 left-0 z-30 w-52 max-h-64 overflow-y-auto rounded-lg bg-[#0c101d] border border-lmu-border shadow-2xl py-1">
          {availableLaps.map(({ lapNumber, lapTimeSec, isValid }) => {
            const isExcluded = excludedLaps.has(lapNumber);
            return (
              <label
                key={lapNumber}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono hover:bg-lmu-card/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => onToggleLapExclusion(lapNumber)}
                  className="accent-lmu-accent"
                />
                <span className={isExcluded ? 'text-lmu-muted line-through' : 'text-white'}>Lap {lapNumber}</span>
                {!isValid && (
                  <span className="px-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-bold uppercase">
                    Invalid
                  </span>
                )}
                <span className={`ml-auto ${isExcluded ? 'text-lmu-muted line-through' : 'text-lmu-muted'}`}>{formatLapTime(lapTimeSec)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One row per metric type (Time, Brake Pt, ...), columns matching the sector table above
// exactly (Best/Avg/Worst/Std Dev/Variance), so every corner reads the same way as sectors do.
// Clicking a row expands a per-lap breakdown of that exact metric below it.
function MetricRow({
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

// Bar per sampled lap, with a dashed reference line at the average, so the shape of the
// variance (not just its magnitude) is visible at a glance. The current lap's bar is drawn in
// a distinct color so it stands out from the rest of the session, and the corner's best-time
// lap is drawn in green to match the Best column's color elsewhere in this panel.
function MetricChart({
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

export const ConsistencyPanel: React.FC<ConsistencyPanelProps> = ({
  stats,
  cornerStats = [],
  isLoadingCornerStats = false,
  onSelectCorner,
  onSelectBaselineLap,
  formatLapTime,
  trackPoints,
  trackBounds,
  availableLaps = [],
  excludedLaps = new Set<number>(),
  onToggleLapExclusion,
  currentLapNumber,
  className = '',
}) => {
  // Ranked by time variance - the clearest single signal of which corner is driven least
  // repeatably, the same way the sector table above highlights its own least-consistent section.
  const leastConsistentCorner = React.useMemo(() => {
    if (cornerStats.length === 0) return null;
    return cornerStats.reduce((worst, c) => (c.time.consistencyPct > worst.time.consistencyPct ? c : worst));
  }, [cornerStats]);

  // Which single metric row (cornerNumber + metric key) is currently drilled down into, if any.
  const [expandedMetric, setExpandedMetric] = React.useState<{ cornerNumber: number; metric: string } | null>(null);
  const toggleMetric = (cornerNumber: number, metric: string) => {
    setExpandedMetric(prev => (prev?.cornerNumber === cornerNumber && prev.metric === metric ? null : { cornerNumber, metric }));
  };

  if (stats.lapCount < 2) {
    return (
      <div className={`flex items-center justify-center h-32 text-lmu-muted text-xs text-center px-4 ${className}`}>
        Need at least 2 valid laps in this replay to analyze consistency.
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0 text-[11px] font-mono text-lmu-muted border-b border-lmu-border/60">
        <span className="flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> {stats.lapCount} valid laps analyzed
        </span>
        {availableLaps.length > 0 && onToggleLapExclusion && (
          <LapSelectorDropdown
            availableLaps={availableLaps}
            excludedLaps={excludedLaps}
            onToggleLapExclusion={onToggleLapExclusion}
            formatLapTime={formatLapTime}
          />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {stats.leastConsistent && stats.leastConsistent.consistencyPct > 0.3 && (
          <div className="m-3 mb-0 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              <span className="font-bold">{stats.leastConsistent.label}</span> is your least consistent section
              (±{stats.leastConsistent.stdDevSec.toFixed(3)}s, {stats.leastConsistent.consistencyPct.toFixed(1)}% variance)
            </span>
          </div>
        )}

        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-lmu-dark z-10">
            <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
              <th className="px-2 py-1.5 text-left">Section</th>
              <th className="px-2 py-1.5 text-right">Best</th>
              <th className="px-2 py-1.5 text-right">Avg</th>
              <th className="px-2 py-1.5 text-right">Worst</th>
              <th className="px-2 py-1.5 text-right">Std Dev</th>
              <th className="px-2 py-1.5 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {stats.stats.map(s => (
              <tr key={s.key} className="border-t border-lmu-border/40 hover:bg-lmu-card/50 transition-colors">
                <td className="px-2 py-1.5 font-bold text-white">{s.label}</td>
                <td className="px-2 py-1.5 text-right text-lmu-green">{s.count > 0 ? formatLapTime(s.minSec) : '--'}</td>
                <td className="px-2 py-1.5 text-right text-white">{s.count > 0 ? formatLapTime(s.avgSec) : '--'}</td>
                <td className="px-2 py-1.5 text-right text-rose-400">{s.count > 0 ? formatLapTime(s.maxSec) : '--'}</td>
                <td className="px-2 py-1.5 text-right text-white">{s.count >= 2 ? `±${s.stdDevSec.toFixed(3)}s` : '--'}</td>
                <td className={`px-2 py-1.5 text-right font-bold ${s.count >= 2 ? consistencyClass(s.consistencyPct) : 'text-lmu-muted'}`}>
                  {s.count >= 2 ? `${s.consistencyPct.toFixed(1)}%` : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center gap-1.5 px-3 py-2 mt-1 text-[11px] font-mono text-lmu-muted border-t border-b border-lmu-border/60">
          <Flag className="w-3 h-3" />
          <span>Corner Consistency</span>
          {isLoadingCornerStats && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
        </div>

        {isLoadingCornerStats ? (
          <div className="px-3 py-4 text-center text-lmu-muted text-xs">Timing every lap through each corner...</div>
        ) : cornerStats.length === 0 ? (
          <div className="px-3 py-4 text-center text-lmu-muted text-xs">
            Need at least 2 valid laps in this replay to analyze per-corner consistency.
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {leastConsistentCorner && leastConsistentCorner.time.consistencyPct > 0.3 && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="font-bold">Corner {leastConsistentCorner.cornerNumber}</span> is your least consistent corner
                  (±{leastConsistentCorner.time.stdDev.toFixed(3)}s, {leastConsistentCorner.time.consistencyPct.toFixed(1)}% variance)
                </span>
              </div>
            )}
            {cornerStats.map(c => {
              const bestLapNumber = c.time.samples.length > 0
                ? c.time.samples.reduce((best, s) => (s.value < best.value ? s : best), c.time.samples[0]).lapNumber
                : undefined;
              return (
              <div key={c.cornerNumber}>
                <div
                  className={`flex items-center gap-2 mb-1 ${onSelectCorner ? 'cursor-pointer' : ''}`}
                  onClick={() => onSelectCorner?.(c.cornerNumber)}
                >
                  {trackPoints && trackBounds && (
                    <MiniCornerMap
                      points={trackPoints}
                      bounds={trackBounds}
                      highlightDistM={c.minDistM}
                      className="w-8 h-8 shrink-0"
                    />
                  )}
                  <span className="inline-flex items-center gap-1 font-bold text-white text-xs">
                    <Flag className="w-3 h-3 text-lmu-muted" />
                    Corner {c.cornerNumber}
                  </span>
                </div>
                <table className="w-full text-[11px] font-mono border-collapse">
                  <thead>
                    <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
                      <th className="px-2 py-1.5 text-left">Type</th>
                      <th className="px-2 py-1.5 text-right" title="Value on this corner's best-time lap">Best</th>
                      <th className="px-2 py-1.5 text-right">Avg</th>
                      <th className="px-2 py-1.5 text-right" title="Value on this corner's worst-time lap">Worst</th>
                      <th className="px-2 py-1.5 text-right">Std Dev</th>
                      <th className="px-2 py-1.5 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <MetricRow
                      label="Time" stat={c.time} unit="s" decimals={3}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'time'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'time')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                    <MetricRow
                      label="Brake Pt" stat={c.brakingDistM} unit="m" decimals={0}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'brake'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'brake')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                    <MetricRow
                      label="Throttle Pt" stat={c.throttleOnDistM} unit="m" decimals={0}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'throttle'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'throttle')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                    <MetricRow
                      label="Entry" stat={c.entrySpeedKmh} unit=" km/h" decimals={0}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'entry'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'entry')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                    <MetricRow
                      label="Apex" stat={c.apexSpeedKmh} unit=" km/h" decimals={0}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'apex'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'apex')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                    <MetricRow
                      label="Exit" stat={c.exitSpeedKmh} unit=" km/h" decimals={0}
                      isExpanded={expandedMetric?.cornerNumber === c.cornerNumber && expandedMetric.metric === 'exit'}
                      onToggle={() => toggleMetric(c.cornerNumber, 'exit')}
                      currentLapNumber={currentLapNumber}
                      bestLapNumber={bestLapNumber}
                      onSelectBaselineLap={onSelectBaselineLap}
                    />
                  </tbody>
                </table>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
