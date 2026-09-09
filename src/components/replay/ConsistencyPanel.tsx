import React from 'react';
import { Activity, Flag, Loader2 } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { LapConsistencyStats } from '../../utils/lapConsistency.js';
import { CornerConsistencyStat } from '../../utils/cornerAnalysis.js';
import { MiniCornerMap } from './MiniCornerMap.js';
import { consistencyClass, LapSelectorDropdown, MetricRow, LapConsistencyOption, LeastConsistentBadge } from './ConsistencySubcomponents.js';

export type { LapConsistencyOption };

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
          <LeastConsistentBadge label={stats.leastConsistent.label} stdDevSec={stats.leastConsistent.stdDevSec} consistencyPct={stats.leastConsistent.consistencyPct} />
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
              <LeastConsistentBadge label={`Corner ${leastConsistentCorner.cornerNumber}`} stdDevSec={leastConsistentCorner.time.stdDev} consistencyPct={leastConsistentCorner.time.consistencyPct} />
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
