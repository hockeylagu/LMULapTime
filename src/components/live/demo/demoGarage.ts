import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveStrategy } from '../../../../shared/types/liveStrategy.js';
import type { SessionStrategy } from '../../../../shared/types/session.js';
import type { LiveScoringReading, LiveVehicleReading } from '../../../../shared/domain/live/liveLifecycle.js';
import { liveResourceKind } from '../../../../shared/domain/live/liveResourcePlan.js';
import { LiveStrategyTracker } from '../../../../shared/domain/live/liveStrategyTracker.js';

/** Sample earlier races on the layout in the class: 4 a lap (VE % or fuel L), 0.8 % of tread a lap on mediums. */
function demoRaceHistory(kind: 've' | 'fuel'): SessionStrategy[] {
  return [3.9, 4, 4.1].map((perLap, index) => ({
    kind, laps: 37, start: { fuel: 90, ve: kind === 've' ? 100 : null }, flag: { fuel: 6, ve: kind === 've' ? 3 : null, laps: 0.8 },
    perLap: { fuel: kind === 've' ? 3.6 : perLap, ve: kind === 've' ? perLap : null, laps: 30 },
    fuelRatio: { set: null, needed: null },
    tyres: { compound: 'Medium', corner: 'FL', wearPerLap: [0.0075, 0.008, 0.0085][index], treadAtFlag: 0.7 },
    stops: [], pace: { clean: 100, first: 100, last: 100.3, laps: 30 },
  }));
}

function player(snapshot: LiveSnapshot, lapSeconds: number): LiveVehicleReading {
  return {
    id: 3, place: 4, totalLaps: 0, vehicleName: snapshot.session?.vehicleName ?? '', vehicleClass: snapshot.session?.vehicleClass ?? '',
    lapDist: 0, sector: 1, lastLapTime: -1, bestLapTime: -1, lastSector1: -1, lastSector2: -1, bestSector1: -1, bestSector2: -1,
    curSector1: -1, curSector2: -1, bestLapSector1: -1, bestLapSector2: -1, lapStartEt: 0, timeIntoLap: 0,
    estimatedLapTime: lapSeconds, inPits: snapshot.lifecycle === 'garage', countLapFlag: 2, lapsBehindLeader: 0, finishStatus: 0,
  };
}

/**
 * The garage (and grid) strategy as the real live tracker plans it, fed the sample answers LMU would give before
 * the event has a lap: the game's use estimate and the selected new mediums (tyre screen), the load set in the
 * garage, the race length (event schedule), the fuel ratio settings, the 12 s four-tyre change, and three earlier
 * races here. So the demo shows the real choice of source and the real plans, not figures set by hand.
 */
export function demoGarageStrategy(snapshot: LiveSnapshot, input: { lapSeconds: number; raceMinutes: number; reserveSeconds: number; setInGarage: number }): LiveStrategy | null {
  const session = snapshot.session;
  if (!session) return null;
  const carClass = snapshot.identity?.carClass ?? session.vehicleClass;
  const kind = liveResourceKind(carClass);
  const tracker = new LiveStrategyTracker();
  tracker.applyCar({ fuelLiters: kind === 'fuel' ? input.setInGarage : 90, fuelCapacityLiters: 100, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0],
    detached: false, wheels: [], lastImpactEt: 0, compound: 'Medium' });
  tracker.applyRest({ type: 'tireManagement', vePerLap: 4.2, fuelPerLap: 3.95, newSets: 3, selected: { compound: 'Medium', used: false, wear: 1 } });
  tracker.applyRest({ type: 'garage', veStart: kind === 've' ? input.setInGarage : null, fuelStart: kind === 'fuel' ? input.setInGarage : null, fuelRatio: 0.9 });
  tracker.applyRest({ type: 'pitMenu', menu: { resourceValue: null, resourceText: null, tyres: null, repair: null, fuelRatioOptions: [0.85, 0.9, 0.95, 1] } });
  tracker.applyRest({ type: 'schedule', raceMinutes: input.raceMinutes, hasQualifying: true });
  tracker.applyRest({ type: 'pitStopTimes', fixRandom: 0, fuelRandom: 0, tireRandom: 0, veRandom: 0, fuelFillRate: 4, veFillRate: 2.5,
    fuelInsert: 0, veInsert: 0, fourTyreChange: 12 });
  tracker.setRaceHistory(demoRaceHistory(kind));
  const reading: LiveScoringReading = {
    trackName: session.trackName, sessionCode: session.sessionCode, currentEt: 0,
    // Before a race the clock end is the grid countdown: the race length comes from the schedule.
    endEt: session.kind === 'race' ? 64 : session.endSeconds ?? 0,
    numVehicles: 20, inRealtime: snapshot.lifecycle !== 'garage', gamePhase: session.gamePhase, trackLength: 5800, trackTempC: 32,
    raining: 0, avgPathWetness: 0, player: player(snapshot, input.lapSeconds), leader: null,
  };
  return tracker.update(reading, { lifecycle: snapshot.lifecycle, session }, {
    carClass, layoutKey: snapshot.identity?.layoutKey ?? null, lapsLeft: null, latestLap: null, reserveSeconds: input.reserveSeconds,
  });
}
