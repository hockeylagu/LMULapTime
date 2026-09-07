import React from 'react';
import { Flag, ArrowUpRight } from 'lucide-react';
import { LapSegmentComparison } from '../../utils/replayComparison.js';

export interface CornerSpeedTableProps {
  segments: LapSegmentComparison[];
  primaryLabel?: string;
  baselineLabel?: string;
  onSelectDistance?: (distM: number) => void;
  className?: string;
}

function speedDeltaClass(delta: number): string {
  if (Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta > 0 ? 'text-lmu-green font-bold' : 'text-rose-400 font-medium';
}

function timeDeltaClass(delta: number): string {
  if (Math.abs(delta) < 0.02) return 'text-lmu-muted';
  return delta < 0 ? 'text-lmu-green font-bold' : 'text-rose-400 font-medium';
}

function formatSpeedDelta(delta: number): string {
  if (Math.abs(delta) < 1) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function formatTimeDelta(delta: number): string {
  if (Math.abs(delta) < 0.02) return '±0.00s';
  return delta < 0 ? `${delta.toFixed(2)}s` : `+${delta.toFixed(2)}s`;
}

// Braking/throttle deltas are in meters. "Later brake" and "earlier throttle" are each the
// faster outcome, so the two columns use opposite sign-to-color conventions below.
function formatBrakingDelta(delta: number | null): string {
  if (delta === null) return '--';
  if (Math.abs(delta) < 1) return '±0m';
  return delta > 0 ? `+${delta}m` : `${delta}m`;
}

function brakingDeltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta > 0 ? 'text-lmu-green font-bold' : 'text-rose-400 font-medium'; // later brake = faster
}

function throttleDeltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 1) return 'text-lmu-muted';
  return delta < 0 ? 'text-lmu-green font-bold' : 'text-rose-400 font-medium'; // earlier throttle = faster
}

export const CornerSpeedTable: React.FC<CornerSpeedTableProps> = ({
  segments,
  primaryLabel = 'My Lap',
  baselineLabel = 'Baseline',
  onSelectDistance,
  className = '',
}) => {
  if (!segments || segments.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 text-lmu-muted text-xs text-center px-4 ${className}`}>
        Not enough distinct braking/apex events detected in the baseline lap to break down this lap.
      </div>
    );
  }

  const totalTimeDelta = segments.reduce((sum, s) => sum + s.timeDeltaSec, 0);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0 text-[11px] font-mono text-lmu-muted border-b border-lmu-border/60">
        <span className="truncate">{primaryLabel} vs {baselineLabel}</span>
        <span className={`font-bold ${timeDeltaClass(totalTimeDelta)}`}>
          Whole lap: {formatTimeDelta(totalTimeDelta)}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-lmu-dark z-10">
            <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
              <th className="px-2 py-1.5 text-left">Segment</th>
              <th className="px-2 py-1.5 text-right">Entry</th>
              <th className="px-2 py-1.5 text-right">Min</th>
              <th className="px-2 py-1.5 text-right">Exit/Top</th>
              <th className="px-2 py-1.5 text-right">Brake Δ</th>
              <th className="px-2 py-1.5 text-right">Thr Δ</th>
              <th className="px-2 py-1.5 text-right">Δ Time</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(s => (
              <tr
                key={s.segmentIndex}
                className="border-t border-lmu-border/40 hover:bg-lmu-card/50 transition-colors cursor-pointer"
                onClick={() => onSelectDistance?.(s.type === 'corner' ? s.minDistM : Math.round((s.entryDistM + s.exitDistM) / 2))}
              >
                {s.type === 'corner' ? (
                  <>
                    <td className="px-2 py-1.5 font-bold text-white">
                      <span className="inline-flex items-center gap-1">
                        <Flag className="w-2.5 h-2.5 text-lmu-muted" />
                        T{s.cornerNumber}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryEntrySpeedKmh}</span>
                      <span className={`ml-1 ${speedDeltaClass(s.entrySpeedDeltaKmh)}`}>{formatSpeedDelta(s.entrySpeedDeltaKmh)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryMinSpeedKmh}</span>
                      <span className={`ml-1 ${speedDeltaClass(s.minSpeedDeltaKmh)}`}>{formatSpeedDelta(s.minSpeedDeltaKmh)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryExitSpeedKmh}</span>
                      <span className={`ml-1 ${speedDeltaClass(s.exitSpeedDeltaKmh)}`}>{formatSpeedDelta(s.exitSpeedDeltaKmh)}</span>
                    </td>
                    <td className={`px-2 py-1.5 text-right ${brakingDeltaClass(s.brakingPointDeltaM)}`}>
                      {formatBrakingDelta(s.brakingPointDeltaM)}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${throttleDeltaClass(s.throttleOnDeltaM)}`}>
                      {formatBrakingDelta(s.throttleOnDeltaM)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1.5 font-semibold text-lmu-muted">
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpRight className="w-2.5 h-2.5" />
                        Straight ({s.lengthM}m)
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryTopSpeedKmh}</span>
                      <span className={`ml-1 ${speedDeltaClass(s.topSpeedDeltaKmh)}`}>{formatSpeedDelta(s.topSpeedDeltaKmh)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                  </>
                )}
                <td className={`px-2 py-1.5 text-right font-bold ${timeDeltaClass(s.timeDeltaSec)}`}>
                  {formatTimeDelta(s.timeDeltaSec)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
