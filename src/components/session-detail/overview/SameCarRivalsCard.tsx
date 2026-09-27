import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { compareWithSameCarRivals } from '../../../../shared/domain/sessionRivals.js';
import { formatTime } from '../../../../shared/domain/formatters.js';

export interface SameCarRivalsCardProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
}

function formatGap(gap: number | null): string {
  if (gap === null) return '--';
  if (Math.abs(gap) < 0.0005) return '±0.000s';
  return `${gap > 0 ? '+' : ''}${gap.toFixed(3)}s`;
}

function gapClass(gap: number | null): string {
  if (gap === null) return 'text-lmu-muted';
  if (gap > 0.0005) return 'text-rose-400';
  return 'text-emerald-400';
}

/** The selected driver's best sectors against the fastest drivers in the same car this session. */
export const SameCarRivalsCard: React.FC<SameCarRivalsCardProps> = ({ session, selectedDriver }) => {
  const comparison = useMemo(
    () => (selectedDriver ? compareWithSameCarRivals(session.drivers || [], selectedDriver) : null),
    [session.drivers, selectedDriver]
  );

  if (!selectedDriver || !comparison) return null;

  const scopeLabel = comparison.scope === 'car'
    ? `Fastest other ${selectedDriver.carType}${comparison.rivalCount > 1 ? ` (${comparison.rivalCount} cars)` : ''}`
    : `Fastest in class (nobody else drove the ${selectedDriver.carType})`;

  return (
    <div className="bg-lmu-card/75 backdrop-blur-md p-4 rounded-xl border border-lmu-border/70 space-y-3" data-testid="same-car-rivals">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-lmu-border/50 pb-2">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-lmu-cyan" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Best Sectors vs Same Car</h3>
        </div>
        <span className="text-xs text-lmu-muted">{scopeLabel}</span>
      </div>

      {comparison.biggestGap && (
        <p className="text-xs text-amber-300">
          Biggest gap: <span className="font-mono font-bold">{comparison.biggestGap.label} {formatGap(comparison.biggestGap.gap)}</span>
          {' '}to {comparison.biggestGap.rivalName}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
              <th className="text-left font-semibold py-1 pr-2">Sector</th>
              <th className="text-right font-semibold py-1 px-2">You</th>
              <th className="text-right font-semibold py-1 px-2">Fastest</th>
              <th className="text-right font-semibold py-1 px-2">Gap</th>
              <th className="text-left font-semibold py-1 pl-2">Driver</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr
                key={row.key}
                className={`border-t border-lmu-border/40 ${row.key === 'lap' ? 'font-semibold' : ''} ${
                  comparison.biggestGap?.key === row.key ? 'bg-amber-500/10' : ''
                }`}
              >
                <td className="py-1.5 pr-2 text-white">{row.label}</td>
                <td className="py-1.5 px-2 text-right font-mono text-white">{formatTime(row.yours)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-lmu-muted">{formatTime(row.rival)}</td>
                <td className={`py-1.5 px-2 text-right font-mono font-bold ${gapClass(row.gap)}`}>{formatGap(row.gap)}</td>
                <td className="py-1.5 pl-2 text-lmu-muted truncate max-w-[10rem]">{row.rivalName ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
