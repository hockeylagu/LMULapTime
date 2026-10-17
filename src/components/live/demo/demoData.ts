import type { LiveSnapshot, LiveTiming } from '../../../../shared/types/live.js';
import type { LiveStrategy } from '../../../../shared/types/liveStrategy.js';
import type { LiveSessionResult } from '../../../../shared/types/liveInsights.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { planGarage, planRace, sessionLaps } from '../../../../shared/domain/live/liveResourcePlan.js';

/** Illustrative snapshots only; never persisted or mixed with recorded sessions. */
export function demoSnapshot(): LiveSnapshot {
  const circuit = getCircuitSpecification(null, null, 'monzawec');
  return {
    sequence: 1, receivedAt: 0, lifecycle: 'driving', paused: false, loadingProgress: null,
    session: { kind: 'race', sessionCode: 10, gamePhase: 5, inRealtime: true,
      trackName: 'Monza', vehicleName: 'Ferrari 499P', vehicleClass: 'Hypercar',
      elapsedSeconds: 1450, endSeconds: 3600, playerLapsCompleted: 12, playerPlace: 3, playerClassPlace: 2 },
    identity: { layoutKey: circuit.layoutKey, layoutName: 'Monza GP', carClass: 'Hyper', personalBestSeconds: 96.42 },
    lapsLeft: { laps: 23, estimated: true },
    weather: { trackTempC: 32, trackTempTrend: 'rising', raining: 0, avgPathWetness: 0, wetnessTrend: 'steady' },
    recentLaps: [
      { lapNumber: 10, lapSeconds: 97.1, sectors: [30.2, 33.4, 33.5], valid: true },
      { lapNumber: 11, lapSeconds: 96.6, sectors: [30.1, 33.2, 33.3], valid: true },
      { lapNumber: 12, lapSeconds: 96.9, sectors: [30.2, 33.3, 33.4], valid: true },
    ],
    sessionBest: { lapSeconds: 96.6, lapSectors: [30.1, 33.2, 33.3], bestSectors: [30.1, 33.2, 33.3], bestPossibleSeconds: 96.6 },
    strategy: null,
  };
}

export function demoStrategy(): LiveStrategy {
  return {
    resource: { kind: 've', unit: '%', amount: 62, capacity: 100, perLap: 4, perLapSource: 'measured',
      lapsMeasured: 5, reserveLaps: 0.5, lapsInTank: 15,
      race: { finishReachable: false, atFinish: null, pitInLaps: 6, pitLap: 19, sparePerLap: 0.2,
        neededAfterStop: 70, neededStopNow: 90, stopsAfterNext: 0 } },
    pit: { state: 'none', penalties: 0, serviceSeconds: 34, serviceMaxSeconds: 41, penaltySeconds: null,
      mfd: { resourceValue: 50, resourceText: '50%', tyres: 'New Medium', repair: 'N/A' } },
    tyres: { compound: 'Medium', worst: 0.82, worstCorner: 'FR', wearPerLap: 0.008, newSets: 3 },
    fuelRatio: { recommended: 0.95, source: 'measured', pairedLaps: 5, garageSetting: 0.9,
      mfdSetting: 0.95, excessLitres: null, fuelBiasLaps: 0 },
    damage: null, forecast: null, garage: null,
  };
}

export function demoTiming(): LiveTiming {
  return { lapNumber: 13, sector: 2, lapElapsedSeconds: 48.2, sectors: [29.98, null, null],
    deltaSeconds: -0.12, sectorDeltas: [-0.12, null, null], tyreSurfaceAvgC: 89 };
}

export function demoResult(): LiveSessionResult {
  return { kind: 'race', trackName: 'Monza', vehicleName: 'Ferrari 499P', classPlace: 2, overallPlace: 3,
    finishStatus: 1, bestLap: 96.6, cleanAverage: 97.2, cleanLaps: 33, completeHistory: true,
    pitStops: 1, resourceKind: 've', resourceRemaining: 8, actualPerLap: 4, plannedPerLap: 4.1, tyreTread: 0.62 };
}

/** Keep illustrative clocks, history and resource plans consistent with the selected session. */
export function configureDemoSession(snapshot: LiveSnapshot, timing: LiveTiming, sprint: boolean, reserveLaps = 0.5): void {
  const session = snapshot.session;
  if (!session) return;
  const qualifying = session.kind === 'qualifying';
  const pace = snapshot.sessionBest?.lapSeconds ?? 96.6;
  session.endSeconds = qualifying ? 600 : sprint ? 1200 : 3600;
  session.sessionCode = qualifying ? 5 : session.kind === 'race' ? 10 : 1;
  if (qualifying || sprint) {
    session.playerLapsCompleted = qualifying ? 4 : 8;
    timing.lapNumber = session.playerLapsCompleted + 1;
    snapshot.recentLaps.forEach((lap, i) => { lap.lapNumber = session.playerLapsCompleted! - 2 + i; });
    session.elapsedSeconds = session.playerLapsCompleted * pace + (timing.lapElapsedSeconds ?? 0);
    snapshot.lapsLeft = { laps: sessionLaps(session.endSeconds - session.playerLapsCompleted * pace, pace, false), estimated: true };
  } else if (session.kind !== 'race') snapshot.lapsLeft = null;

  if (timing.isOutLap) {
    session.playerLapsCompleted = 0;
    session.elapsedSeconds = 35;
    timing.lapNumber = 1;
    timing.lapElapsedSeconds = 35;
    timing.sector = 1;
    snapshot.recentLaps = [];
    snapshot.sessionBest = null;
    snapshot.lapsLeft = qualifying ? { laps: sessionLaps(session.endSeconds, pace, false), estimated: true } : null;
  }
  const strategy = snapshot.strategy;
  const resource = strategy?.resource;
  if (resource) {
    resource.reserveLaps = reserveLaps;
    resource.lapsInTank = resource.amount !== null && resource.perLap ? resource.amount / resource.perLap - reserveLaps : null;
    if (resource.race && reserveLaps !== 0.5) {
      const extra = (reserveLaps - 0.5) * (resource.perLap ?? 0);
      resource.race.neededStopNow = Math.min(resource.capacity ?? Infinity, Math.ceil(resource.race.neededStopNow + extra));
      if (resource.race.neededAfterStop !== null) resource.race.neededAfterStop = Math.min(resource.capacity ?? Infinity, Math.ceil(resource.race.neededAfterStop + extra));
    }
  }
  if (strategy && resource?.kind === 'fuel') strategy.fuelRatio = null;
  if (strategy?.fuelRatio && (timing.isOutLap || snapshot.lifecycle === 'garage')) {
    strategy.fuelRatio.source = 'game';
    strategy.fuelRatio.pairedLaps = 0;
    strategy.fuelRatio.mfdSetting = null;
  }
  if (resource && session.kind !== 'race') {
    resource.race = null;
    resource.amount = timing.isOutLap ? qualifying ? 28 : 98 : 14;
    resource.perLapSource = timing.isOutLap ? 'game' : 'measured';
    resource.lapsMeasured = timing.isOutLap ? 0 : 3;
    resource.lapsInTank = resource.amount / 4 - reserveLaps;
    if (strategy.tyres && timing.isOutLap) { strategy.tyres.worst = 1; strategy.tyres.wearPerLap = null; }
  }
  if (sprint && resource && snapshot.lapsLeft) {
    resource.amount = 26;
    resource.lapsInTank = 26 / 4 - reserveLaps;
    resource.race = planRace({ amount: 26, perLap: 4, reserveLaps, capacity: 100,
      lapsLeft: snapshot.lapsLeft.laps, lapFraction: (timing.lapElapsedSeconds ?? 0) / pace, lapNumber: timing.lapNumber });
  }
  if (strategy && snapshot.lifecycle === 'garage') {
    session.elapsedSeconds = 0;
    session.playerLapsCompleted = 0;
    session.gamePhase = 0;
    snapshot.recentLaps = [];
    snapshot.sessionBest = null;
    snapshot.lapsLeft = null;
    strategy.garage = { ...planGarage({ formationLap: session.kind === 'race', race: session.kind === 'race',
      kind: resource?.kind ?? 've', sessionSeconds: session.endSeconds, lapSeconds: pace, perLap: 4,
      perLapSource: 'game', lapsMeasured: 0, reserveLaps, capacity: 100, setInGarage: qualifying ? 20 : 75 }),
      tyres: { compound: 'Medium', used: false, wear: 1, newSets: 3 } };
  }
  if (snapshot.result && qualifying) {
    session.elapsedSeconds = 680;
    session.playerLapsCompleted = 6;
    session.gamePhase = 8;
    snapshot.lapsLeft = null;
    snapshot.result.cleanLaps = 5;
    snapshot.result.pitStops = 0;
    snapshot.result.resourceRemaining = 3;
    snapshot.result.tyreTread = 0.96;
  }
}
