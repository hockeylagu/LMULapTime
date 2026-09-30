import React, { useMemo } from 'react';
import { DriverData } from '../../../../shared/types/index.js';
import { compareWithSameCarRivals, RivalSectorKey } from '../../../../shared/domain/sessionRivals.js';
import { formatTime } from '../../../../shared/domain/formatters.js';

export interface SectorsMetricBoxProps {
  className?: string;
  selectedDriver: DriverData;
  drivers: DriverData[];
  averages: Record<RivalSectorKey, number | null>;
}

const BEST_CLASS: Record<RivalSectorKey, string> = {
  s1: 'text-lmu-gold',
  s2: 'text-lmu-blue',
  s3: 'text-lmu-green',
  lap: 'text-white',
};

function formatGap(gap: number | null): string {
  if (gap === null) return '--';
  if (Math.abs(gap) < 0.0005) return '±0.000';
  return `${gap > 0 ? '+' : ''}${gap.toFixed(3)}`;
}

const gapClass = (gap: number | null) =>
  gap === null ? 'text-lmu-muted' : gap > 0.0005 ? 'text-lmu-loss' : 'text-lmu-gain';

/**
 * The driver's best and average sectors, next to the fastest other driver in the same car this
 * session (the class when nobody else drove it), with the sector that costs the most highlighted.
 */
export const SectorsMetricBox: React.FC<SectorsMetricBoxProps> = ({ selectedDriver, drivers, averages, className = '' }) => {
  const comparison = useMemo(() => compareWithSameCarRivals(drivers, selectedDriver), [drivers, selectedDriver]);
  const rows = comparison?.rows ?? [
    { key: 's1' as const, label: 'S1', yours: selectedDriver.bestS1, rival: null, rivalName: null, gap: null },
    { key: 's2' as const, label: 'S2', yours: selectedDriver.bestS2, rival: null, rivalName: null, gap: null },
    { key: 's3' as const, label: 'S3', yours: selectedDriver.bestS3, rival: null, rivalName: null, gap: null },
  ];
  const rivalLabel = comparison?.scope === 'class' ? 'Class' : 'Same car';
  const scopeTitle = comparison
    ? comparison.scope === 'car'
      ? `Fastest other ${selectedDriver.carType}${comparison.rivalCount > 1 ? ` (${comparison.rivalCount} cars)` : ''}`
      : `Fastest in class (nobody else drove the ${selectedDriver.carType})`
    : undefined;
  const columns = comparison ? 'grid-cols-[28px_1fr_1fr_1fr_52px]' : 'grid-cols-[28px_1fr_1fr]';

  return (
    <div
      className={`p-2.5 rounded-lg bg-lmu-bg border border-lmu-border ${className}`}
      data-testid="sectors-metric"
    >
      <div className={`grid ${columns} gap-x-2 text-[10px] text-lmu-muted uppercase tracking-wider font-semibold`}>
        <span>Sectors</span>
        <span className="text-right">Best</span>
        <span className="text-right">Avg</span>
        {comparison && (
          <>
            <span className="text-right cursor-help" title={scopeTitle}>{rivalLabel}</span>
            <span className="text-right">Gap</span>
          </>
        )}
      </div>
      <div className="mt-1 space-y-px text-xs font-mono">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`grid ${columns} gap-x-2 items-center rounded px-0.5 ${
              comparison?.biggestGap?.key === row.key ? 'bg-lmu-warn-strong/10' : ''
            } ${row.key === 'lap' ? 'border-t border-lmu-border/40' : ''}`}
          >
            <span className="text-lmu-muted text-[10px] font-semibold font-sans">{row.label}</span>
            <strong className={`text-right font-bold ${BEST_CLASS[row.key]}`}>{formatTime(row.yours)}</strong>
            <span className="text-right text-lmu-muted text-[11px]">{formatTime(averages[row.key])}</span>
            {comparison && (
              <>
                <span className="text-right text-lmu-muted text-[11px] cursor-help" title={row.rivalName ?? undefined}>
                  {formatTime(row.rival)}
                </span>
                <span className={`text-right font-bold text-[11px] ${gapClass(row.gap)}`}>{formatGap(row.gap)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
