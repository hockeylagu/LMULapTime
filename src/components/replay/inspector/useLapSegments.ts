import { useEffect, useMemo, useState } from 'react';
import { hasCompatibleTrackStations } from '../../../../shared/domain/trackGeometry.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';
import { loadLayoutCorners } from '../../../api/cornerApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis/segmentComparisons.js';

/**
 * The lap view's segments (corners and straights) of the shown lap against its comparison lap (itself when none): the
 * corners are the class's sequences from its map, else the layout's official turns, each placed on the lap.
 */
export function useLapSegments(trajectory: ReplayTrajectoryData | null | undefined, baselineTrajectory: ReplayTrajectoryData | null | undefined) {
  const layoutKey = trajectory?.layoutKey;
  const carClass = resolveDriverCarClass(trajectory?.vehicleIdentity);
  const [loaded, setLoaded] = useState<{ key: string; corners: LayoutCorners | null } | null>(null);
  const key = layoutKey ? `${layoutKey}|${carClass}` : null;

  useEffect(() => {
    if (!layoutKey || !key) return;
    let current = true;
    void loadLayoutCorners(layoutKey, carClass).then(corners => { if (current) setLoaded({ key, corners }); });
    return () => { current = false; };
  }, [layoutKey, carClass, key]);

  const corners = loaded && loaded.key === key ? loaded.corners : null;

  const segments = useMemo(() => {
    // Without the layout's corners (no centre line, or the server unreachable) the lap has no segments.
    if (!trajectory || !corners) return [];
    const compared = baselineTrajectory ?? trajectory;
    if (!hasCompatibleTrackStations(trajectory, compared)) return [];
    const spec = trajectory.layoutKey ? getCircuitSpecification(trajectory.layoutKey) : undefined;
    return computeLapSegmentComparisons(trajectory.points, compared.points, corners, trajectory.trackLengthM, spec?.nominalWidthM);
  }, [trajectory, baselineTrajectory, corners]);
  // What the corners are, so readers of the session's passes read the same ones (the AI report's repeatability).
  return { segments, kind: corners?.kind ?? 'turns' };
}
