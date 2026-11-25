import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RaceReplayOverview, ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { fetchSessionTelemetry } from '../../../../api/replayApi.js';
import { trajectoryResolutionQuery } from '../../telemetry/telemetryResolution.js';
import { loadReadoutLapExtras } from '../../inspector/readoutLapLoader.js';
import { lapAt } from '../../race/raceLaps.js';
import type { RaceClock } from '../../race/raceClock.js';

/** The followed car's lap in the race: its replay samples, and where it starts on the session clock. */
export interface RaceCockpitLap {
  slot: number;
  startSec: number;
  trajectory: ReplayTrajectoryData;
}

/**
 * The lap the followed car is on, loaded while `active` (the cockpit camera shows): the race's poses carry no engine data, so the
 * wheel and dash screens read the lap's own samples, as in the lap view, with its delta and previous-lap extras. A new lap loads
 * when the car crosses the line or another car is followed; null until one loads, or when the car has no session lap.
 */
export function useRaceCockpitLap(active: boolean, sessionId: string, overview: RaceReplayOverview, clock: RaceClock, followSlot: number | null): RaceCockpitLap | null {
  const key = useSyncExternalStore(clock.subscribe, () => {
    if (!active) return null;
    const lap = lapAt(overview, followSlot, clock.getState().timeSec);
    return lap && `${followSlot}:${lap.lapNumber}`;
  });
  const [loaded, setLoaded] = useState<{key: string; lap: RaceCockpitLap} | null>(null);
  useEffect(() => {
    if (key === null || followSlot === null) return;
    const lap = lapAt(overview, followSlot, clock.getState().timeSec), car = overview.cars.find(entry => entry.slot === followSlot);
    if (!lap || !car) return;
    const controller = new AbortController(), {signal} = controller;
    fetchSessionTelemetry(sessionId, {driverOrdinal: lap.driverOrdinal, lapOrdinal: lap.lapOrdinal, source: 'vcr', resolutionQuery: trajectoryResolutionQuery('standard')}, {signal})
      .then(trajectory => {
        if (signal.aborted || !trajectory.points.length) return;
        setLoaded({key, lap: {slot: followSlot, startSec: lap.startSec, trajectory}});
        return loadReadoutLapExtras(sessionId, trajectory, car.sessionLapOrdinals, 'vcr', signal);
      })
      .catch(() => {
        // A lap that fails to load leaves the screens as they were; its extras missing keep the delta and last-lap fields hidden.
      });
    return () => controller.abort();
  }, [key, sessionId, overview, clock, followSlot]);
  // The last lap stays while the next one loads (the screens hold its last values); a lap of another car is never shown.
  return active && loaded && loaded.lap.slot === followSlot ? loaded.lap : null;
}
