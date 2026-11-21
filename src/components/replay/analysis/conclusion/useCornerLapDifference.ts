import { useEffect, useMemo, useState } from 'react';
import { areComparableCarClasses, resolveDriverCarClass } from '../../../../../shared/domain/vehicleMapping.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import type { CornerPass, CornerTurn } from '../../../../../shared/types/corners/cornerPasses.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import { loadLayoutCorners } from '../../../../api/cornerApi.js';
import { fetchSessionCornerPasses } from '../../../../api/replayApi.js';
import { cornerLapDifference, type CornerLapDifference } from './cornerLapDifference.js';

export type CornerLapDifferenceState =
  | { status: 'loading' }
  /** Why the two laps are not explained: no stored passes, another class, another layout. */
  | { status: 'unavailable'; reason: string }
  /** Null when the corner was not measured on both laps. */
  | { status: 'ready'; difference: CornerLapDifference | null };

interface Passes { layoutKey: string; lengthM: number; turns: CornerTurn[]; passes: CornerPass[] }
type Loaded =
  | { status: 'unavailable'; reason: string }
  /** `corners`: the lap view's corners, in their order on the track. */
  | { status: 'ready'; lap: Passes; baseline: Passes; corners: CornerTurn[] };

const LOADING: CornerLapDifferenceState = { status: 'loading' };

/** A driver's passes through the official turns in a session; a string says why there are none. */
async function loadPasses(sessionId: string, driverOrdinal: number, signal: AbortSignal): Promise<Passes | string> {
  const response = await fetchSessionCornerPasses(sessionId, driverOrdinal, { signal });
  return response.available
    ? { layoutKey: response.layoutKey, lengthM: response.trackLengthM, turns: response.turns, passes: response.passes }
    : response.reason;
}

/**
 * What differs between the shown lap and its baseline through a corner of the lap view, from both laps' stored turn
 * passes (one request per lap's session and driver). Null without a baseline; laps of two classes are not explained.
 */
export function useCornerLapDifference(
  trajectory: ReplayTrajectoryData,
  baseline: ReplayTrajectoryData | null | undefined,
  cornerNumber: number,
): CornerLapDifferenceState | null {
  const { sessionId, driverOrdinal, layoutKey } = trajectory;
  const carClass = resolveDriverCarClass(trajectory.vehicleIdentity);
  const baseSessionId = baseline?.sessionId, baseDriverOrdinal = baseline?.driverOrdinal;
  const sameClass = areComparableCarClasses(carClass, resolveDriverCarClass(baseline?.vehicleIdentity));
  // What rules the explanation out before anything is read.
  const blocked = !baseline ? null
    : !sameClass ? 'The two laps are in different classes: their difference is not explained.'
      : !sessionId || driverOrdinal === undefined || !baseSessionId || baseDriverOrdinal === undefined || !layoutKey ? 'Both laps need a session replay to be explained.' : null;
  const key = baseline && !blocked ? `${sessionId}|${driverOrdinal}|${baseSessionId}|${baseDriverOrdinal}|${layoutKey}|${carClass}` : null;
  const [loaded, setLoaded] = useState<{ key: string; state: Loaded } | null>(null);

  useEffect(() => {
    if (!key || !sessionId || driverOrdinal === undefined || !baseSessionId || baseDriverOrdinal === undefined || !layoutKey) return;
    const done = (state: Loaded) => setLoaded({ key, state });
    const controller = new AbortController();
    void (async () => {
      try {
        const [lap, base, layout] = await Promise.all([
          loadPasses(sessionId, driverOrdinal, controller.signal),
          loadPasses(baseSessionId, baseDriverOrdinal, controller.signal),
          loadLayoutCorners(layoutKey, carClass),
        ]);
        if (controller.signal.aborted) return;
        if (typeof lap === 'string') done({ status: 'unavailable', reason: lap });
        else if (typeof base === 'string') done({ status: 'unavailable', reason: `The baseline: ${base}` });
        else if (!layout || lap.layoutKey !== base.layoutKey) done({ status: 'unavailable', reason: 'The two laps are not on the same layout.' });
        else done({ status: 'ready', lap, baseline: base, corners: layout.corners.toSorted((a, b) => a.startM - b.startM) });
      } catch (error: unknown) {
        if (isAbortError(error) || controller.signal.aborted) return;
        done({ status: 'unavailable', reason: apiErrorMessage(error, 'Could not read the corner passes') });
      }
    })();
    return () => controller.abort();
  }, [key, sessionId, driverOrdinal, baseSessionId, baseDriverOrdinal, layoutKey, carClass]);

  const state = key && loaded?.key === key ? loaded.state : null;
  const lapNumber = trajectory.currentLap, baseLapNumber = baseline?.currentLap;
  const sameCar = Boolean(trajectory.vehicleIdentity?.carType) && trajectory.vehicleIdentity?.carType === baseline?.vehicleIdentity?.carType;
  const difference = useMemo(() => {
    if (state?.status !== 'ready') return null;
    const corner = state.corners[cornerNumber - 1] as CornerTurn | undefined;
    if (!corner) return null;
    const turnIds = corner.sequence?.turnIds ?? [corner.id];
    const turns = turnIds.map(id => ({ id, label: state.lap.turns.find(turn => turn.id === id)?.label ?? '' }));
    return cornerLapDifference(turns, state.lap.passes.filter(pass => pass.lapNumber === lapNumber),
      state.baseline.passes.filter(pass => pass.lapNumber === baseLapNumber), state.lap.lengthM, sameCar);
  }, [state, cornerNumber, lapNumber, baseLapNumber, sameCar]);

  if (!baseline) return null;
  if (blocked) return { status: 'unavailable', reason: blocked };
  if (!state) return LOADING;
  return state.status === 'ready' ? { status: 'ready', difference } : state;
}
