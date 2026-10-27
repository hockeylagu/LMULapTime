import { describe, expect, it } from 'vitest';
import type { LiveCarReading } from '../../../../shared/domain/live/liveCarCondition.js';
import { deriveLiveState } from '../../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../../shared/domain/live/liveLifecycle.js';
import { LiveStrategyTracker } from '../../../../shared/domain/live/liveStrategyTracker.js';
import { scoringReading, vehicleReading } from '../../../helpers/liveReadings.js';

const LAP = 100;
const KW = [0, 20, 40, 60, 80, 100, 120];

function at(et: number, patch: Partial<LiveScoringReading> = {}): LiveScoringReading {
  const laps = Math.floor(et / LAP);
  return scoringReading({
    currentEt: et, endEt: 3000,
    player: vehicleReading({ totalLaps: laps, lapStartEt: laps * LAP, lapDist: ((et % LAP) / LAP) * 10_000, estimatedLapTime: LAP }),
    leader: vehicleReading({ id: 3, totalLaps: laps, lapStartEt: laps * LAP, estimatedLapTime: LAP }),
    ...patch,
  });
}

const car = (charge: number, hybrid = true): LiveCarReading => ({
  fuelLiters: 0, fuelCapacityLiters: 0, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false, lastImpactEt: 0,
  wheels: Array.from({ length: 4 }, () => ({ flat: false, detached: false })), compound: 'Medium', virtualEnergy: 0.8,
  ...(hybrid ? { hybrid: { batteryChargeFraction: charge / 100, soc: 0, motorMap: 3, motorMapMax: 6, motorState: 2, regen: 0 } } : {}),
});

interface Options { phase?: number; pitLap?: number; sessionCode?: number; garage?: boolean; hybrid?: boolean }

/** Laps of 100 s read every 2 s; the charge moves `perLap` points a lap from `start` (`pitLap` starts in the pit lane). */
function drive(tracker: LiveStrategyTracker, start: number, perLap: number, laps: number, options: Options = {}) {
  let strategy = null;
  for (let et = 0; et <= laps * LAP; et += 2) {
    const base = at(et, { sessionCode: options.sessionCode ?? 10, gamePhase: options.phase ?? 5, inRealtime: !options.garage });
    const lap = Math.floor(et / LAP) + 1;
    const reading = options.pitLap === lap && et % LAP < LAP / 2 ? { ...base, player: { ...base.player!, inPits: true } } : base;
    tracker.applyCar(car(start + (perLap * et) / LAP, options.hybrid ?? true));
    strategy = tracker.update(reading, deriveLiveState(reading, 'driving'),
      { carClass: 'Hyper', layoutKey: null, lapsLeft: { laps: 30, estimated: true }, latestLap: null, reserveSeconds: LAP / 2 });
  }
  return strategy;
}

describe('LiveStrategyTracker deployment', () => {
  it('advises from every reading in kW from the plugin list, and counts yellow laps', () => {
    const tracker = new LiveStrategyTracker();
    tracker.setDeploymentKw(KW);
    // Game phase 6 is a full course yellow: unlike fuel and VE use, the battery still counts.
    expect(drive(tracker, 30, -10, 2, { phase: 6 })?.deployment).toEqual({
      unit: 'kW', current: 60, target: 40, next: null, changeSeconds: null, settlingLaps: 0, chargePercent: 10, changePerLap: -10, edge: 20, edgeSeconds: 0 });
  });

  it('falls back to map positions when the plugin list has the wrong length, and without a plugin', () => {
    const wrong = new LiveStrategyTracker();
    wrong.setDeploymentKw([0, 20, 40]);
    expect(drive(wrong, 30, -10, 2)?.deployment).toMatchObject({ unit: 'map', current: 3, target: 2 });
    expect(drive(new LiveStrategyTracker(), 30, -10, 2)?.deployment).toMatchObject({ unit: 'map', current: 3, target: 2 });
  });

  it('measures again after the pit lane', () => {
    const tracker = new LiveStrategyTracker();
    tracker.setDeploymentKw(KW);
    expect(drive(tracker, 30, -10, 2, { pitLap: 2 })?.deployment).toMatchObject({ target: null, changePerLap: null });
  });

  it('is only for hybrid cars in race, practice and qualifying, never in the garage', () => {
    expect(drive(new LiveStrategyTracker(), 30, -10, 2, { sessionCode: 1 })?.deployment).toMatchObject({ unit: 'map', target: 2 });
    expect(drive(new LiveStrategyTracker(), 30, -10, 2, { sessionCode: 5 })?.deployment).toMatchObject({ unit: 'map', target: 2 });
    expect(drive(new LiveStrategyTracker(), 30, -10, 2, { sessionCode: 9 })).not.toHaveProperty('deployment');
    expect(drive(new LiveStrategyTracker(), 30, -10, 2, { garage: true })).not.toHaveProperty('deployment');
    expect(drive(new LiveStrategyTracker(), 30, -10, 2, { hybrid: false })).not.toHaveProperty('deployment');
  });

  it('forgets the laps when the session changes', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 30, -10, 2);
    const next = at(5, { sessionCode: 11 });
    const update = () => tracker.update(next, deriveLiveState(next, 'driving'),
      { carClass: 'Hyper', layoutKey: null, lapsLeft: { laps: 30, estimated: true }, latestLap: null, reserveSeconds: LAP / 2 });
    update();
    tracker.applyCar(car(50));
    const strategy = update();
    expect(strategy?.deployment).toMatchObject({ target: null, changePerLap: null, chargePercent: 50 });
  });
});
