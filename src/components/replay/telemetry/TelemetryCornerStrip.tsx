import React from 'react';
import { CornerSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis.js';

export interface TelemetryCornerStripProps {
  corners: CornerSegmentComparison[];
  initialStraight?: StraightSegmentComparison | null;
  selectedCornerNumber?: number | null;
  onSelectCorner?: (cornerNumber: number | null) => void;
  onJumpToDistance?: (distM: number) => void;
  isCompareMode?: boolean;
  currentDistM?: number;
  sectors?: { s1Frame: number; s2Frame: number };
  cumDists?: number[];
  className?: string;
}

export const TelemetryCornerStrip: React.FC<TelemetryCornerStripProps> = ({
  corners,
  initialStraight,
  selectedCornerNumber,
  onSelectCorner,
  onJumpToDistance,
  isCompareMode = false,
  currentDistM,
  className = '',
}) => {
  if ((!corners || corners.length === 0) && !initialStraight) {
    return null;
  }

  const handleCornerClick = (cornerNumber: number, minDistM: number) => {
    onSelectCorner?.(cornerNumber);
    onJumpToDistance?.(minDistM);
  };

  return (
    <div
      data-testid="telemetry-corner-strip"
      className={`relative z-20 shrink-0 bg-[#080c14] border-t border-lmu-border/50 select-none px-2 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth ${className}`}
    >
      {initialStraight && (() => {
        const isCurrent =
          currentDistM !== undefined &&
          currentDistM >= initialStraight.entryDistM &&
          currentDistM <= initialStraight.exitDistM;

        let metricDisplay: string;
        let metricClass: string;

        if (isCompareMode) {
          const delta = initialStraight.timeDeltaSec;
          if (Math.abs(delta) < 0.005) {
            metricDisplay = '±0.00';
            metricClass = 'text-slate-400';
          } else if (delta > 0) {
            metricDisplay = `+${delta.toFixed(2)}`;
            metricClass = 'text-rose-400';
          } else {
            metricDisplay = delta.toFixed(2);
            metricClass = 'text-emerald-400';
          }
        } else {
          metricDisplay = `${initialStraight.primaryTimeSec.toFixed(2)}s`;
          metricClass = 'text-slate-200';
        }

        let borderAndBgClass: string;
        if (isCurrent) {
          borderAndBgClass =
            'border-sky-500/80 bg-sky-950/30 ring-1 ring-sky-500/40 shadow-[0_0_8px_rgba(14,165,233,0.3)]';
        } else if (isCompareMode) {
          if (initialStraight.timeDeltaSec > 0.005) {
            borderAndBgClass =
              'border-rose-900/60 bg-rose-950/20 hover:border-rose-500/60 hover:bg-rose-950/35';
          } else if (initialStraight.timeDeltaSec < -0.005) {
            borderAndBgClass =
              'border-emerald-900/60 bg-emerald-950/20 hover:border-emerald-500/60 hover:bg-emerald-950/35';
          } else {
            borderAndBgClass =
              'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60';
          }
        } else {
          borderAndBgClass =
            'border-slate-800/90 bg-slate-900/50 hover:border-sky-500/60 hover:bg-slate-800/60';
        }

        return (
          <button
            key="initial-straight"
            type="button"
            aria-label="Main Straight ST"
            onClick={() => {
              onSelectCorner?.(null);
              onJumpToDistance?.(Math.round(initialStraight.entryDistM + initialStraight.lengthM / 2));
            }}
            title={`Main Straight (Start/Finish): ${initialStraight.lengthM}m, Top Speed ${initialStraight.primaryTopSpeedKmh} km/h, Time ${initialStraight.primaryTimeSec}s${
              isCompareMode ? `, Delta ${initialStraight.timeDeltaSec > 0 ? '+' : ''}${initialStraight.timeDeltaSec.toFixed(3)}s` : ''
            }`}
            className={`flex-1 min-w-[58px] py-1 px-1.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${borderAndBgClass}`}
          >
            <span className="text-[10px] font-mono font-bold tracking-wider text-amber-400">
              ST
            </span>
            <span className={`text-[11px] font-mono font-bold leading-tight ${metricClass}`}>
              {metricDisplay}
            </span>
          </button>
        );
      })()}
      {corners.map(c => {
        const isSelected = selectedCornerNumber === c.cornerNumber;
        const isCurrent =
          currentDistM !== undefined &&
          currentDistM >= c.entryDistM &&
          currentDistM <= c.exitDistM;

        // Format delta vs baseline or absolute corner time
        let metricDisplay: string;
        let metricClass: string;

        if (isCompareMode) {
          const delta = c.timeDeltaSec;
          if (Math.abs(delta) < 0.005) {
            metricDisplay = '±0.00';
            metricClass = 'text-slate-400';
          } else if (delta > 0) {
            metricDisplay = `+${delta.toFixed(2)}`;
            metricClass = 'text-rose-400';
          } else {
            metricDisplay = delta.toFixed(2);
            metricClass = 'text-emerald-400';
          }
        } else {
          metricDisplay = `${c.primaryTimeSec.toFixed(2)}s`;
          metricClass = 'text-slate-200';
        }

        // Card outline and background style based on selection and gain/loss
        let borderAndBgClass: string;
        if (isSelected) {
          borderAndBgClass =
            'border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.4)]';
        } else if (isCurrent) {
          borderAndBgClass =
            'border-sky-500/80 bg-sky-950/30 ring-1 ring-sky-500/40 shadow-[0_0_8px_rgba(14,165,233,0.3)]';
        } else if (isCompareMode) {
          if (c.timeDeltaSec > 0.005) {
            borderAndBgClass =
              'border-rose-900/60 bg-rose-950/20 hover:border-rose-500/60 hover:bg-rose-950/35';
          } else if (c.timeDeltaSec < -0.005) {
            borderAndBgClass =
              'border-emerald-900/60 bg-emerald-950/20 hover:border-emerald-500/60 hover:bg-emerald-950/35';
          } else {
            borderAndBgClass =
              'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60';
          }
        } else {
          borderAndBgClass =
            'border-slate-800/90 bg-slate-900/50 hover:border-sky-500/60 hover:bg-slate-800/60';
        }

        return (
          <button
            key={c.cornerNumber}
            type="button"
            aria-label={`Turn ${c.cornerNumber}`}
            onClick={() => handleCornerClick(c.cornerNumber, c.minDistM)}
            title={`Corner ${c.cornerNumber}: Min Speed ${c.primaryMinSpeedKmh} km/h, Time ${c.primaryTimeSec}s${
              isCompareMode ? `, Delta ${c.timeDeltaSec > 0 ? '+' : ''}${c.timeDeltaSec.toFixed(3)}s` : ''
            }`}
            className={`flex-1 min-w-[62px] py-1 px-1.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${borderAndBgClass}`}
          >
            <span
              className={`text-[10px] font-mono font-bold tracking-wider ${
                isSelected ? 'text-cyan-300' : 'text-sky-400'
              }`}
            >
              T{c.cornerNumber}
            </span>
            <span className={`text-[11px] font-mono font-bold leading-tight ${metricClass}`}>
              {metricDisplay}
            </span>
          </button>
        );
      })}
    </div>
  );
};
