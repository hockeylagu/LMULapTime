import React from 'react';
import { CornerSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

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
  pointComparisons?: PointComparison[];
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
  pointComparisons,
  cumDists,
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
      onPointerDown={(e) => e.stopPropagation()}
      className={`telemetry-corner-strip relative z-20 shrink-0 bg-lmu-surface border-t border-lmu-border/50 select-none px-2 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth ${className}`}
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
            metricClass = 'text-lmu-muted';
          } else if (delta > 0) {
            metricDisplay = `+${delta.toFixed(2)}`;
            metricClass = 'text-lmu-loss';
          } else {
            metricDisplay = delta.toFixed(2);
            metricClass = 'text-lmu-gain';
          }
        } else {
          metricDisplay = `${initialStraight.primaryTimeSec.toFixed(2)}s`;
          metricClass = 'text-lmu-text';
        }

        let borderAndBgClass: string;
        if (isCurrent) {
          borderAndBgClass =
            'border-lmu-info-strong/80 bg-lmu-info-deep/30 ring-1 ring-lmu-info-strong/40';
        } else if (isCompareMode) {
          if (initialStraight.timeDeltaSec > 0.005) {
            borderAndBgClass =
              'border-lmu-loss-deep/60 bg-lmu-loss-deep/20 hover:border-lmu-loss-strong/60 hover:bg-lmu-loss-deep/35';
          } else if (initialStraight.timeDeltaSec < -0.005) {
            borderAndBgClass =
              'border-lmu-gain-deep/60 bg-lmu-gain-deep/20 hover:border-lmu-gain-strong/60 hover:bg-lmu-gain-deep/35';
          } else {
            borderAndBgClass =
              'border-lmu-border bg-lmu-card/40 hover:border-lmu-rule-strong hover:bg-lmu-card/60';
          }
        } else {
          borderAndBgClass =
            'border-lmu-border/90 bg-lmu-card/50 hover:border-lmu-info-strong/60 hover:bg-lmu-raised/60';
        }

        const stEntryIdx = cumDists && pointComparisons ? findIndexAtDistance(cumDists, initialStraight.entryDistM) : -1;
        const stExitIdx = cumDists && pointComparisons ? findIndexAtDistance(cumDists, initialStraight.exitDistM) : -1;
        const stEntryDelta = stEntryIdx >= 0 && pointComparisons ? pointComparisons[stEntryIdx]?.deltaTimeSec : undefined;
        const stExitDelta = stExitIdx >= 0 && pointComparisons ? pointComparisons[stExitIdx]?.deltaTimeSec : undefined;
        const stTooltip = `Main Straight (Start/Finish): ${initialStraight.lengthM}m, Top Speed ${initialStraight.primaryTopSpeedKmh} km/h, Time ${initialStraight.primaryTimeSec}s${
          isCompareMode
            ? `, Delta ${initialStraight.timeDeltaSec > 0 ? '+' : ''}${initialStraight.timeDeltaSec.toFixed(3)}s${
                stEntryDelta !== undefined && stExitDelta !== undefined
                  ? ` (Running: ${stEntryDelta >= 0 ? '+' : ''}${stEntryDelta.toFixed(2)}s → ${stExitDelta >= 0 ? '+' : ''}${stExitDelta.toFixed(2)}s)`
                  : ''
              }`
            : ''
        }`;

        return (
          <button
            key="initial-straight"
            type="button"
            aria-label="Main Straight ST"
            onClick={() => {
              onSelectCorner?.(null);
              onJumpToDistance?.(Math.round(initialStraight.entryDistM + initialStraight.lengthM / 2));
            }}
            title={stTooltip}
            className={`flex-1 min-w-[58px] py-1 px-1.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${borderAndBgClass} ${FOCUS_RING}`}
          >
            <span className="text-[10px] font-mono font-bold tracking-wider text-lmu-warn">
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
            metricClass = 'text-lmu-muted';
          } else if (delta > 0) {
            metricDisplay = `+${delta.toFixed(2)}`;
            metricClass = 'text-lmu-loss';
          } else {
            metricDisplay = delta.toFixed(2);
            metricClass = 'text-lmu-gain';
          }
        } else {
          metricDisplay = `${c.primaryTimeSec.toFixed(2)}s`;
          metricClass = 'text-lmu-text';
        }

        // Card outline and background style based on selection and gain/loss
        let borderAndBgClass: string;
        if (isSelected) {
          borderAndBgClass =
            'border-lmu-aqua bg-lmu-aqua-deep/40 ring-1 ring-lmu-aqua/60';
        } else if (isCurrent) {
          borderAndBgClass =
            'border-lmu-info-strong/80 bg-lmu-info-deep/30 ring-1 ring-lmu-info-strong/40';
        } else if (isCompareMode) {
          if (c.timeDeltaSec > 0.005) {
            borderAndBgClass =
              'border-lmu-loss-deep/60 bg-lmu-loss-deep/20 hover:border-lmu-loss-strong/60 hover:bg-lmu-loss-deep/35';
          } else if (c.timeDeltaSec < -0.005) {
            borderAndBgClass =
              'border-lmu-gain-deep/60 bg-lmu-gain-deep/20 hover:border-lmu-gain-strong/60 hover:bg-lmu-gain-deep/35';
          } else {
            borderAndBgClass =
              'border-lmu-border bg-lmu-card/40 hover:border-lmu-rule-strong hover:bg-lmu-card/60';
          }
        } else {
          borderAndBgClass =
            'border-lmu-border/90 bg-lmu-card/50 hover:border-lmu-info-strong/60 hover:bg-lmu-raised/60';
        }

        const entryIdx = cumDists && pointComparisons ? findIndexAtDistance(cumDists, c.entryDistM) : -1;
        const exitIdx = cumDists && pointComparisons ? findIndexAtDistance(cumDists, c.exitDistM) : -1;
        const entryDelta = entryIdx >= 0 && pointComparisons ? pointComparisons[entryIdx]?.deltaTimeSec : undefined;
        const exitDelta = exitIdx >= 0 && pointComparisons ? pointComparisons[exitIdx]?.deltaTimeSec : undefined;

        const cornerTooltip = isCompareMode
          ? entryDelta !== undefined && exitDelta !== undefined
            ? `Turn ${c.cornerNumber}: Delta ${c.timeDeltaSec > 0 ? '+' : ''}${c.timeDeltaSec.toFixed(2)}s (Running: ${entryDelta >= 0 ? '+' : ''}${entryDelta.toFixed(2)}s → ${exitDelta >= 0 ? '+' : ''}${exitDelta.toFixed(2)}s)`
            : `Corner ${c.cornerNumber}: Min Speed ${c.primaryMinSpeedKmh} km/h, Time ${c.primaryTimeSec}s, Delta ${c.timeDeltaSec > 0 ? '+' : ''}${c.timeDeltaSec.toFixed(3)}s`
          : `Corner ${c.cornerNumber}: Min Speed ${c.primaryMinSpeedKmh} km/h, Time ${c.primaryTimeSec}s`;

        return (
          <button
            key={c.cornerNumber}
            type="button"
            aria-label={`Turn ${c.cornerNumber}`}
            onClick={() => handleCornerClick(c.cornerNumber, c.minDistM)}
            title={cornerTooltip}
            className={`flex-1 min-w-[62px] py-1 px-1.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${borderAndBgClass} ${FOCUS_RING}`}
          >
            <span
              className={`text-[10px] font-mono font-bold tracking-wider ${
                isSelected ? 'text-lmu-aqua-soft' : 'text-lmu-info'
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
