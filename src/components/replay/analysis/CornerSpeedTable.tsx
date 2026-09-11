import React from 'react';
import { Flag, ArrowUpRight } from 'lucide-react';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis.js';

export interface CornerSpeedTableProps {
  segments: LapSegmentComparison[];
  primaryLabel?: string;
  baselineLabel?: string;
  // No baseline lap to compare against - shows absolute entry/min/exit speed and brake/
  // throttle point/segment length instead of deltas (which would always read zero).
  selfAnalysis?: boolean;
  onSelectDistance?: (distM: number) => void;
  selectedCornerNumber?: number | null;
  onSelectCorner?: (cornerNumber: number) => void;
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
  if (Math.abs(delta) < 0.02) return '±0.000s';
  return delta < 0 ? `${delta.toFixed(3)}s` : `+${delta.toFixed(3)}s`;
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

// Distance to/from the apex (minimum-speed point) for a braking/throttle point in self-
// analysis mode (no baseline lap to compare against, so there's no delta) - reading relative
// to the apex is more meaningful than an absolute lap distance.
function formatDistPoint(distM: number | null): string {
  return distM === null ? '--' : `${distM}m`;
}

export const CornerSpeedTable: React.FC<CornerSpeedTableProps> = ({
  segments,
  primaryLabel = 'My Lap',
  baselineLabel = 'Baseline',
  selfAnalysis = false,
  onSelectDistance,
  selectedCornerNumber,
  onSelectCorner,
  className = '',
}) => {
  if (!segments || segments.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 text-lmu-muted text-xs text-center px-4 ${className}`}>
        Not enough distinct braking/apex events detected in this lap to break it down.
      </div>
    );
  }

  const totalTimeDelta = segments.reduce((sum, s) => sum + s.timeDeltaSec, 0);

  // Only the genuinely egregious losses deserve the quick-jump shortlist; tiny deltas are
  // just noise and make the list look like a catch-all for every corner in the lap.
  const worstCorners: CornerSegmentComparison[] = selfAnalysis
    ? []
    : segments
        .filter((s): s is CornerSegmentComparison => s.type === 'corner' && s.timeDeltaSec >= 0.08)
        .sort((a, b) => b.timeDeltaSec - a.timeDeltaSec)
        .slice(0, 3);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0 text-[11px] font-mono text-lmu-muted border-b border-lmu-border/60">
        <span className="truncate">{selfAnalysis ? primaryLabel : `${primaryLabel} vs ${baselineLabel}`}</span>
        {!selfAnalysis && (
          <span className={`font-bold ${timeDeltaClass(totalTimeDelta)}`}>
            Whole lap: {formatTimeDelta(totalTimeDelta)}
          </span>
        )}
      </div>

      {worstCorners.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-b border-lmu-border/60 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-lmu-muted shrink-0">Costs the most</span>
          {worstCorners.map(c => (
            <button
              key={c.cornerNumber}
              onClick={() => {
                onSelectDistance?.(c.minDistM);
                onSelectCorner?.(c.cornerNumber);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono font-bold shrink-0 transition-colors cursor-pointer ${
                c.cornerNumber === selectedCornerNumber
                  ? 'bg-lmu-accent/20 border-lmu-accent text-white'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
              }`}
            >
              <Flag className="w-2.5 h-2.5" />
              T{c.cornerNumber} +{c.timeDeltaSec.toFixed(3)}s
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-lmu-card border-b border-lmu-border z-10">
            <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
              <th className="px-2 py-1.5 text-left">Segment</th>
              <th className="px-2 py-1.5 text-right">Entry</th>
              <th className="px-2 py-1.5 text-right">Min</th>
              <th className="px-2 py-1.5 text-right">Exit/Top</th>
              <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Brake' : 'Brake Δ'}</th>
              <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Throttle' : 'Thr Δ'}</th>
              <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Length' : 'Δ Time'}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(s => (
              <tr
                key={s.segmentIndex}
                className={`border-t border-lmu-border/40 hover:bg-lmu-card/50 transition-colors cursor-pointer ${
                  s.type === 'corner' && s.cornerNumber === selectedCornerNumber ? 'bg-lmu-accent/15' : ''
                }`}
                onClick={() => {
                  onSelectDistance?.(s.type === 'corner' ? s.minDistM : Math.round((s.entryDistM + s.exitDistM) / 2));
                  if (s.type === 'corner') onSelectCorner?.(s.cornerNumber);
                }}
              >
                {s.type === 'corner' ? (
                  <>
                    <td className="px-2 py-1.5 font-bold text-white">
                      <span className={`inline-flex items-center gap-1 ${s.cornerNumber === selectedCornerNumber ? 'text-lmu-accent' : ''}`}>
                        <Flag className={`w-2.5 h-2.5 ${s.cornerNumber === selectedCornerNumber ? 'text-lmu-accent' : 'text-lmu-muted'}`} />
                        T{s.cornerNumber}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryEntrySpeedKmh}</span>
                      {!selfAnalysis && <span className={`ml-1 ${speedDeltaClass(s.entrySpeedDeltaKmh)}`}>{formatSpeedDelta(s.entrySpeedDeltaKmh)}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryMinSpeedKmh}</span>
                      {!selfAnalysis && <span className={`ml-1 ${speedDeltaClass(s.minSpeedDeltaKmh)}`}>{formatSpeedDelta(s.minSpeedDeltaKmh)}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="text-white">{s.primaryExitSpeedKmh}</span>
                      {!selfAnalysis && <span className={`ml-1 ${speedDeltaClass(s.exitSpeedDeltaKmh)}`}>{formatSpeedDelta(s.exitSpeedDeltaKmh)}</span>}
                    </td>
                    {selfAnalysis ? (
                      <>
                        <td className="px-2 py-1.5 text-right text-white">
                          {formatDistPoint(s.primaryBrakingDistM !== null ? s.minDistM - s.primaryBrakingDistM : null)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-white">
                          {formatDistPoint(s.primaryThrottleOnDistM !== null ? s.primaryThrottleOnDistM - s.minDistM : null)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`px-2 py-1.5 text-right ${brakingDeltaClass(s.brakingPointDeltaM)}`}>
                          {formatBrakingDelta(s.brakingPointDeltaM)}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${throttleDeltaClass(s.throttleOnDeltaM)}`}>
                          {formatBrakingDelta(s.throttleOnDeltaM)}
                        </td>
                      </>
                    )}
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
                      {!selfAnalysis && <span className={`ml-1 ${speedDeltaClass(s.topSpeedDeltaKmh)}`}>{formatSpeedDelta(s.topSpeedDeltaKmh)}</span>}
                      {/* Top speed can occur mid-straight (lift before braking) - show the actual
                          exit-boundary speed too when it differs, e.g. the lap's finish-line straight. */}
                      {Math.abs(s.primaryTopSpeedKmh - s.primaryExitSpeedKmh) >= 1 && (
                        <div className="text-[9px] leading-tight text-lmu-muted">
                          exit {s.primaryExitSpeedKmh}
                          {!selfAnalysis && <span className={`ml-0.5 ${speedDeltaClass(s.exitSpeedDeltaKmh)}`}>{formatSpeedDelta(s.exitSpeedDeltaKmh)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                    <td className="px-2 py-1.5 text-right text-lmu-muted">--</td>
                  </>
                )}
                {selfAnalysis ? (
                  <td className="px-2 py-1.5 text-right font-bold text-white">{s.primaryTimeSec.toFixed(3)}s</td>
                ) : (
                  <td className={`px-2 py-1.5 text-right font-bold ${timeDeltaClass(s.timeDeltaSec)}`}>
                    {formatTimeDelta(s.timeDeltaSec)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
