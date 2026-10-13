import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import type { PointComparison } from '../../../../utils/replayComparison.js';

export interface LiveSectorSplit {
  sector: 1 | 2 | 3;
  /** Time gained (negative) or lost since this sector's start line, against the baseline. */
  deltaSec: number | null;
}

/**
 * The sector the cursor is in, and the live delta change since that sector began: the distance-aligned
 * delta now minus the delta at the sector's start line (the lap start for S1).
 */
export function liveSectorSplit(
  sectors: ReplayTrajectoryData['sectors'],
  index: number,
  comparisons: PointComparison[] | null | undefined,
  deltaSec: number | null | undefined,
): LiveSectorSplit | null {
  if (!sectors || !(sectors.s1Frame > 0) || !(sectors.s2Frame > sectors.s1Frame)) return null;
  const sector = index < sectors.s1Frame ? 1 : index < sectors.s2Frame ? 2 : 3;
  const startDelta = comparisons?.[sector === 1 ? 0 : sector === 2 ? sectors.s1Frame : sectors.s2Frame]?.deltaTimeSec;
  const live = typeof deltaSec === 'number' && Number.isFinite(deltaSec)
    && typeof startDelta === 'number' && Number.isFinite(startDelta) ? deltaSec - startDelta : null;
  return { sector, deltaSec: live };
}
