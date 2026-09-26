import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ReplayTrajectoryData } from '../../../../shared/types/index.js';

type LapLabel = 'This lap' | 'The comparison lap';

/**
 * What the server could not establish about the two laps being compared, in words: a comparison
 * that silently lines laps up wrong looks exactly like a real difference in driving.
 */
export function describeComparisonCaveats(
  primary: ReplayTrajectoryData | null | undefined,
  baseline: ReplayTrajectoryData | null | undefined
): string[] {
  if (!primary || !baseline) return [];
  if (primary.stationSource === 'odometer' || baseline.stationSource === 'odometer') {
    return [
      'There is no track map for this layout, so the two laps are matched by the distance each car drove from where its recording starts. Positions can drift apart by tens of metres, so the delta trace and the corner and pedal-point comparisons are approximate.',
    ];
  }
  const caveats: string[] = [];
  const uncutEnds = (lap: ReplayTrajectoryData, label: LapLabel) => {
    if (lap.stationSource !== 'track' || !lap.lineCut) return;
    // An end extended over the last few metres to the line is as good as cut there.
    const ends = [lap.lineCut.start === 'none' && 'starts', lap.lineCut.end === 'none' && 'ends'].filter(Boolean);
    if (ends.length === 0) return;
    caveats.push(
      `${label} ${ends.join(' and ')} away from the start/finish line (its recording doesn't reach it, e.g. an out-lap from the pits), so the delta trace is approximate.`
    );
  };
  uncutEnds(primary, 'This lap');
  uncutEnds(baseline, 'The comparison lap');
  return caveats;
}

export interface ComparisonAccuracyNoticeProps {
  trajectory: ReplayTrajectoryData | null | undefined;
  baselineTrajectory: ReplayTrajectoryData | null | undefined;
}

export const ComparisonAccuracyNotice: React.FC<ComparisonAccuracyNoticeProps> = ({ trajectory, baselineTrajectory }) => {
  const caveats = describeComparisonCaveats(trajectory, baselineTrajectory);
  if (caveats.length === 0) return null;
  return (
    <div role="note" className="flex items-start gap-1.5 w-full px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] leading-snug">
      <AlertTriangle className="w-3 h-3 mt-px shrink-0 text-amber-400" />
      <div className="flex flex-col gap-0.5">
        {caveats.map(caveat => <span key={caveat}>{caveat}</span>)}
      </div>
    </div>
  );
};
