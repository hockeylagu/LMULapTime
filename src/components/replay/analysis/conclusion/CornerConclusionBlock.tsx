import React from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { LapDifferenceSection } from './LapDifferenceSection.js';
import { SessionHabitSection } from './SessionHabitSection.js';

interface Props {
  /** The shown lap. */
  trajectory: ReplayTrajectoryData;
  /** The lap it is compared with, when one is shown. */
  baseline: ReplayTrajectoryData | null | undefined;
  /** The corner's number in the lap view. */
  cornerNumber: number;
}

/**
 * Under the lap view's corner detail: what the corner analysis engine concludes there. The phase cards above give the
 * numbers of the two laps; this says what differs between them, then the driver's habit over the session against
 * the target.
 */
export const CornerConclusionBlock: React.FC<Props> = ({ trajectory, baseline, cornerNumber }) => (
  <>
    <LapDifferenceSection trajectory={trajectory} baseline={baseline} cornerNumber={cornerNumber} />
    <SessionHabitSection sessionId={trajectory.sessionId} driverOrdinal={trajectory.driverOrdinal} lapOrdinal={trajectory.lapOrdinal} cornerNumber={cornerNumber} />
  </>
);
