import React from 'react';
import { Flag, ArrowUpRight } from 'lucide-react';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  speedDeltaClass,
  timeDeltaClass,
  formatSpeedDelta,
  formatTimeDelta,
  formatBrakingDelta,
  brakingDeltaClass,
  throttleDeltaClass,
  formatDistPoint,
} from './CornerTableFormatters.js';

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
  selectedCornerChart?: React.ReactNode;
  className?: string;
}

export const CornerSpeedTable: React.FC<CornerSpeedTableProps> = ({
  segments,
  primaryLabel = 'My Lap',
  baselineLabel = 'Baseline',
  selfAnalysis = false,
  onSelectDistance,
  selectedCornerNumber,
  onSelectCorner,
  selectedCornerChart,
  className = '',
}) => {
  const [tableMode, setTableMode] = React.useState<'speed' | 'technique'>('speed');

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
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 text-[11px] font-mono text-lmu-muted border-b border-lmu-border/60 gap-2">
        <span className="truncate">{selfAnalysis ? primaryLabel : `${primaryLabel} vs ${baselineLabel}`}</span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-lmu-bg p-0.5 rounded border border-lmu-border/60">
            <button
              onClick={() => setTableMode('speed')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                tableMode === 'speed' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
              }`}
            >
              Speed
            </button>
            <button
              onClick={() => setTableMode('technique')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                tableMode === 'technique' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
              }`}
            >
              Technique
            </button>
          </div>
          {!selfAnalysis && (
            <span className={`font-bold ${timeDeltaClass(totalTimeDelta)}`}>
              Whole lap: {formatTimeDelta(totalTimeDelta)}
            </span>
          )}
        </div>
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

      <div className={selectedCornerChart ? 'shrink-0' : 'min-h-0 overflow-y-auto flex-1'}>
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-lmu-card border-b border-lmu-border z-10">
            <tr className="text-lmu-muted uppercase tracking-wider text-[10px]">
              <th className="px-2 py-1.5 text-left">Segment</th>
              {tableMode === 'speed' ? (
                <>
                  <th className="px-2 py-1.5 text-right">Entry</th>
                  <th className="px-2 py-1.5 text-right">Min</th>
                  <th className="px-2 py-1.5 text-right">Exit/Top</th>
                  <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Brake' : 'Brake Δ'}</th>
                  <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Throttle' : 'Thr Δ'}</th>
                  <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Length' : 'Δ Time'}</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1.5 text-right">Arc / Dir</th>
                  <th className="px-2 py-1.5 text-right">Turn-In</th>
                  <th className="px-2 py-1.5 text-right">Head @ 15%</th>
                  <th className="px-2 py-1.5 text-right">Trail Brk</th>
                  <th className="px-2 py-1.5 text-right">Rot Δ</th>
                  <th className="px-2 py-1.5 text-right">{selfAnalysis ? 'Time' : 'Δ Time'}</th>
                </>
              )}
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
                      <span className={`inline-flex items-center gap-1.5 flex-wrap ${s.cornerNumber === selectedCornerNumber ? 'text-lmu-accent' : ''}`}>
                        <Flag className={`w-2.5 h-2.5 ${s.cornerNumber === selectedCornerNumber ? 'text-lmu-accent' : 'text-lmu-muted'}`} />
                        <span>T{s.cornerNumber}</span>
                      </span>
                    </td>
                    {tableMode === 'speed' ? (
                      <>
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
                        <td className="px-2 py-1.5 text-right text-white">
                          {s.cornerAngleDeg ? `${s.turnDirection === 'left' ? '↰' : '↱'} ${s.cornerAngleDeg}°` : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-white">
                          {s.primaryTurnInDistM !== null && s.primaryTurnInDistM !== undefined
                            ? `${Math.max(0, s.minDistM - s.primaryTurnInDistM)}m`
                            : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {s.primaryRotationAtThrottlePct !== null && s.primaryRotationAtThrottlePct !== undefined ? (
                            <span className="text-white">
                              {s.primaryRotationAtThrottlePct}%
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-white">
                          {s.trailBrakeDistM ? `${s.trailBrakeDistM}m` : '--'}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${timeDeltaClass(s.phaseTiming?.rotation.timeDeltaSec ?? 0)}`}>
                          {s.phaseTiming ? formatTimeDelta(s.phaseTiming.rotation.timeDeltaSec) : '--'}
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
      {selectedCornerChart && (
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-lmu-border/60">
          {selectedCornerChart}
        </div>
      )}
    </div>
  );
};
