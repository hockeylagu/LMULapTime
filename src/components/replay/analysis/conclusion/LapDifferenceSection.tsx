import React from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { CONCLUSION_HEADING, CONCLUSION_SHELL } from './SessionHabitSection.js';
import { useCornerLapDifference } from './useCornerLapDifference.js';

interface Props {
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null | undefined;
  /** The corner's number in the lap view. */
  cornerNumber: number;
}

const signed = (sec: number) => `${sec >= 0 ? '+' : '−'}${Math.abs(sec).toFixed(2)} s`;

/**
 * The first part of the lap view's corner conclusion, with a baseline lap: what differs between the two laps through
 * the corner (`cornerLapDifference`), the slower lap named in each line. Two single laps, so it describes and never
 * advises: the habit over the session is the part below.
 */
export const LapDifferenceSection: React.FC<Props> = ({ trajectory, baseline, cornerNumber }) => {
  const state = useCornerLapDifference(trajectory, baseline, cornerNumber);
  if (!state) return null;
  if (state.status === 'loading') return <p className={`${CONCLUSION_SHELL} text-lmu-muted`} role="status">Reading the two laps' corner passes…</p>;
  if (state.status === 'unavailable') return <p className={`${CONCLUSION_SHELL} text-lmu-muted`}>{state.reason}</p>;
  const { difference } = state;
  return (
    <section className={`${CONCLUSION_SHELL} space-y-1`} aria-label="This lap against the baseline" data-testid="lap-difference">
      <span className={CONCLUSION_HEADING} title="What the two laps on screen did differently through this corner, from their measured passes. One lap each: what differs here may not repeat on other laps.">
        This lap vs baseline
      </span>
      {difference?.notes.map(note => <p key={note} className="text-lmu-warn-soft">{note}</p>)}
      {difference?.lines.map(line => (
        <div key={line.key} className="flex items-baseline gap-2" data-testid="lap-difference-line">
          <span className={`w-14 shrink-0 font-mono font-bold tabular-nums ${line.deltaSec > 0 ? 'text-lmu-loss' : 'text-lmu-gain'}`}
            title={line.deltaSec > 0 ? 'Time this lap loses to the baseline there' : 'Time this lap gains on the baseline there'}>
            {signed(line.deltaSec)}
          </span>
          <p className="min-w-0">
            <span className="text-lmu-muted">{line.where} · </span>
            <span className="font-semibold text-white">{line.text}</span>
            {line.kindLine && <span className="text-lmu-text-soft">{` · ${line.kindLine}`}</span>}
            {line.causes.length > 0 && <span className="block text-lmu-muted">Also: {line.causes.join(' · ')}</span>}
          </p>
        </div>
      ))}
      {!difference && <p className="text-lmu-muted">This corner was not measured on both laps.</p>}
      {difference && difference.lines.length === 0 && <p className="text-lmu-text-soft">No difference worth telling between the two laps here.</p>}
    </section>
  );
};
