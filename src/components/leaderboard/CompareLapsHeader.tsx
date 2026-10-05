import React from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, Trophy, Sparkles, Award, Trash2, Crosshair, Activity } from 'lucide-react';
import { formatTime } from '../../../shared/domain/formatters.js';
import { ComparableLap } from '../../../shared/types/index.js';
import { FOCUS_RING } from '../common/buttonStyles.js';

export interface CompareLapsHeaderProps {
  selectedTrack: string;
  allTimePBObject: ComparableLap | null;
  overallTrackBestObject: ComparableLap | null;
  isPBInComparison: boolean;
  isOverallBestInComparison: boolean;
  theoreticalBestSec: number | null;
  selectedLapsCount: number;
  /** The rival's lap, while it is not in the comparison. */
  rivalLap?: ComparableLap | null;
  onAddRival?: () => void;
  /** Measures the deltas against the other lap. */
  onSwapBaseline?: () => void;
  /** URL to compare telemetry directly. */
  compareTelemetryUrl?: string;
  /** Opens the telemetry of the two laps compared. */
  onCompareTelemetry?: () => void;
  onAddPersonalBest: () => void;
  onAddTheoreticalBest: () => void;
  onAddOverallTrackBest: () => void;
  onClearAll: () => void;
}

const preset = 'px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-lmu-border border border-lmu-border hover:border-lmu-accent/50 text-lmu-muted hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer';
const headerAction = 'flex items-center gap-1 text-[11px] font-bold text-lmu-muted bg-lmu-card hover:bg-lmu-border hover:text-white border border-lmu-border hover:border-lmu-accent/50 px-2 py-0.5 rounded-lg transition-colors cursor-pointer';

/** The compare card's header: the laps compared, the baseline, and the quick presets. */
export const CompareLapsHeader: React.FC<CompareLapsHeaderProps> = ({
  selectedTrack,
  allTimePBObject,
  overallTrackBestObject,
  isPBInComparison,
  isOverallBestInComparison,
  theoreticalBestSec,
  selectedLapsCount,
  rivalLap,
  onAddRival,
  onSwapBaseline,
  compareTelemetryUrl,
  onCompareTelemetry,
  onAddPersonalBest,
  onAddTheoreticalBest,
  onAddOverallTrackBest,
  onClearAll,
}) => (
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-lmu-border/50">
    <div className="min-w-0">
      <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 text-lmu-accent-text" />
        Compare Laps
      </h3>
      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-lmu-muted">
        {selectedLapsCount === 0 && <span>Pick laps on the leaderboard, or start from a preset.</span>}
        {onSwapBaseline && (
          <button
            type="button"
            onClick={onSwapBaseline}
            className={`${headerAction} ${FOCUS_RING}`}
            title="Measure the deltas against the other lap"
          >
            <ArrowLeftRight className="w-3 h-3" />
            Swap baseline
          </button>
        )}
        {(compareTelemetryUrl || onCompareTelemetry) && (
          compareTelemetryUrl ? (
            <Link
              to={compareTelemetryUrl}
              className={`${headerAction} ${FOCUS_RING}`}
              onClick={(e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && onCompareTelemetry) {
                  e.preventDefault();
                  onCompareTelemetry();
                }
              }}
              title="Speed, pedals, delta and line of the two laps, overlaid"
            >
              <Activity className="w-3 h-3" />
              Compare Telemetry
            </Link>
          ) : (
            <button
              type="button"
              onClick={onCompareTelemetry}
              className={`${headerAction} ${FOCUS_RING}`}
              title="Speed, pedals, delta and line of the two laps, overlaid"
            >
              <Activity className="w-3 h-3" />
              Compare Telemetry
            </button>
          )
        )}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {rivalLap && onAddRival && (
        <button type="button" onClick={onAddRival} className={`${preset} ${FOCUS_RING}`} title={`Add ${rivalLap.driverName}'s best lap, your rival`}>
          <Crosshair className="w-3.5 h-3.5 text-lmu-warn-soft" />
          + Rival ({rivalLap.lapTimeString})
        </button>
      )}
      {allTimePBObject && !isPBInComparison && allTimePBObject.id !== overallTrackBestObject?.id && (
        <button type="button" onClick={onAddPersonalBest} className={`${preset} ${FOCUS_RING}`} title="Add your Personal Best lap for this track & category">
          <Trophy className="w-3.5 h-3.5 text-lmu-personal-best" />
          + Personal Best ({formatTime(allTimePBObject.lapTime)})
        </button>
      )}

      {theoreticalBestSec && (
        <button type="button" onClick={onAddTheoreticalBest} className={`${preset} ${FOCUS_RING}`} title="Add your theoretical optimal lap for this track & category">
          <Sparkles className="w-3.5 h-3.5 text-lmu-muted" />
          + Theoretical Best ({formatTime(theoreticalBestSec)})
        </button>
      )}

      {overallTrackBestObject && !isOverallBestInComparison && (
        <button
          type="button"
          onClick={onAddOverallTrackBest}
          className={`${preset} ${FOCUS_RING}`}
          title={`Add the fastest lap on ${selectedTrack} by ${overallTrackBestObject.driverName} (${overallTrackBestObject.lapTimeString}) across all drivers`}
        >
          <Award className="w-3.5 h-3.5 text-lmu-muted" />
          + All-Time Best ({overallTrackBestObject.lapTimeString})
        </button>
      )}

      {selectedLapsCount > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className={`px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-lmu-loss-deep/40 border border-lmu-border hover:border-lmu-loss-strong/40 text-xs text-lmu-muted hover:text-lmu-loss font-semibold transition-all flex items-center gap-1 cursor-pointer ${FOCUS_RING}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  </div>
);
