import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { fetchReplayTrajectory } from '../../../api/replayApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis.js';
import { comparisonConfidence, DebriefCorner, rankDebriefCorners } from '../../../utils/sessionDebrief.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import type { TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';
import { DEFAULT_TELEMETRY_RESOLUTION, trajectoryResolutionQuery } from '../../replay/telemetry/telemetryResolution.js';
import { describeComparisonCaveats } from '../../replay/inspector/ComparisonAccuracyNotice.js';
import { boardLapTelemetryRef } from '../leaderboard/leaderboardLaps.js';

export interface RivalDebrief {
  /** The corners where the player's best lap loses the most to the rival's, ranked. */
  corners: DebriefCorner[];
  confidence: number;
  caveats: string[];
  yours: TelemetryLapRef;
  theirs: TelemetryLapRef;
}

/** Why there is no debrief against this rival, in words the driver can act on. */
export class RivalDebriefUnavailableError extends Error {}

/**
 * Where the player's best lap loses to the rival's, corner by corner, and what to change: the two
 * laps are loaded exactly as the telemetry view loads them, so a corner opens there with the same
 * numbers. Only the two laps are compared, so each corner is "measured on this lap only".
 */
export async function loadRivalDebrief(player: LeaderboardEntry, rival: LeaderboardEntry, signal?: AbortSignal): Promise<RivalDebrief> {
  const yours = boardLapTelemetryRef(player);
  const theirs = boardLapTelemetryRef(rival);
  if (!yours) throw new RivalDebriefUnavailableError('Your best lap here has no replay: drive with replays saved to see where the time is.');
  if (!theirs) throw new RivalDebriefUnavailableError(`${rival.driverName}'s lap has no replay to compare with.`);

  const resolutionQuery = trajectoryResolutionQuery(DEFAULT_TELEMETRY_RESOLUTION);
  const load = (ref: TelemetryLapRef) =>
    fetchReplayTrajectory(ref.replayName, { resolutionQuery, lap: ref.lapNum, driverName: ref.driverName }, { signal })
      .then(applyTelemetryPostProcessingToTrajectory);
  const [target, reference] = await Promise.all([load(yours), load(theirs)]);
  if (!target.points?.length || !reference.points?.length) {
    throw new RivalDebriefUnavailableError('The replay has no telemetry for one of the two laps.');
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
