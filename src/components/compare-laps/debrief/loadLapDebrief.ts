import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { fetchReplayTrajectory } from '../../../api/replayApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis.js';
import { comparisonConfidence, DebriefCorner, rankDebriefCorners } from '../../../utils/sessionDebrief.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import type { TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';
import { DEFAULT_TELEMETRY_RESOLUTION, trajectoryResolutionQuery } from '../../replay/telemetry/telemetryResolution.js';
import { describeComparisonCaveats } from '../../replay/inspector/ComparisonAccuracyNotice.js';

export interface LapDebrief {
  /** The corners where `yours` loses the most to `theirs`, ranked. */
  corners: DebriefCorner[];
  confidence: number;
  caveats: string[];
  yours: TelemetryLapRef;
  theirs: TelemetryLapRef;
}

/** Why there is no debrief of the two laps, in words the driver can act on. */
export class LapDebriefUnavailableError extends Error {}

/**
 * Where `yours` loses to `theirs`, corner by corner: the two laps are loaded exactly as the
 * telemetry view loads them, so a corner opens there with the same numbers. Only the two laps are
 * compared, so each corner is "measured on this lap only".
 */
export async function loadLapPairDebrief(yours: TelemetryLapRef, theirs: TelemetryLapRef, signal?: AbortSignal): Promise<LapDebrief> {
  const resolutionQuery = trajectoryResolutionQuery(DEFAULT_TELEMETRY_RESOLUTION);
  const load = (ref: TelemetryLapRef) =>
    fetchReplayTrajectory(ref.replayName, { resolutionQuery, lap: ref.lapNum, driverName: ref.driverName }, { signal })
      .then(applyTelemetryPostProcessingToTrajectory);
  const [target, reference] = await Promise.all([load(yours), load(theirs)]);
  if (!target.points?.length || !reference.points?.length) {
    throw new LapDebriefUnavailableError('The replay has no telemetry for one of the two laps.');
  }

  const spec = target.layoutKey ? getCircuitSpecification(target.layoutKey) : undefined;
  const segments = computeLapSegmentComparisons(target.points, reference.points, 6, target.trackLengthM, spec?.nominalWidthM);
  const confidence = comparisonConfidence(target, reference);
  return {
    corners: rankDebriefCorners(segments, null, confidence),
    confidence,
    caveats: describeComparisonCaveats(target, reference),
    yours,
    theirs,
  };
}
