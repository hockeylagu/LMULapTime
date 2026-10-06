import React from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, Trophy, Sparkles, Award, Trash2, Crosshair, Activity } from 'lucide-react';
import { formatTime } from '../../../shared/domain/formatters.js';
import { ComparableLap } from '../../../shared/types/index.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { linkClickHandler } from '../../utils/linkClick.js';

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

/** The presets are secondary buttons; an icon keeps a hue only where it means one (rival amber, personal best gold). */
const preset = SECONDARY_BUTTON;
/** Quiet outlined, as "Where's the time?": acts on the laps already compared. */
const headerAction = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-rule-strong transition-colors cursor-pointer';

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
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            Swap baseline
          </button>
        )}
        {(compareTelemetryUrl || onCompareTelemetry) && (
          compareTelemetryUrl ? (
            <Link
              to={compareTelemetryUrl}
              className={`${headerAction} ${FOCUS_RING}`}
              onClick={linkClickHandler(onCompareTelemetry ? () => onCompareTelemetry() : undefined)}
              title="Speed, pedals, delta and line of the two laps, overlaid"
            >
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
              Compare Telemetry
            </Link>
          ) : (
            <button
              type="button"
              onClick={onCompareTelemetry}
              className={`${headerAction} ${FOCUS_RING}`}
              title="Speed, pedals, delta and line of the two laps, overlaid"
            >
              <Activity className="w-3.5 h-3.5" aria-hidden="true" />
              Compare Telemetry
            </button>
          )
        )}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {rivalLap && onAddRival && (
        <button type="button" onClick={onAddRival} className={preset} title={`Add ${rivalLap.driverName}'s best lap, your rival`}>
          <Crosshair className="w-3.5 h-3.5 text-lmu-warn-soft" />
          + Rival ({rivalLap.lapTimeString})
        </button>
      )}
      {allTimePBObject && !isPBInComparison && allTimePBObject.id !== overallTrackBestObject?.id && (
        <button type="button" onClick={onAddPersonalBest} className={preset} title="Add your Personal Best lap for this track & category">
          <Trophy className="w-3.5 h-3.5 text-lmu-personal-best" />
          + Personal Best ({formatTime(allTimePBObject.lapTime)})
        </button>
      )}

      {theoreticalBestSec && (
        <button type="button" onClick={onAddTheoreticalBest} className={preset} title="Add your theoretical optimal lap for this track & category">
          <Sparkles className="w-3.5 h-3.5 text-lmu-muted" />
          + Theoretical Best ({formatTime(theoreticalBestSec)})
        </button>
      )}

      {overallTrackBestObject && !isOverallBestInComparison && (
        <button
          type="button"
          onClick={onAddOverallTrackBest}
          className={preset}
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
          className={SECONDARY_BUTTON}
        >
          <Trash2 className="w-3.5 h-3.5 text-lmu-muted" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  </div>
);
