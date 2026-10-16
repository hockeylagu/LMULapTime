import { describe, expect, it } from 'vitest';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LiveStrategyTracker } from '../../../shared/domain/live/liveStrategyTracker.js';
import type { LiveStrategyContext } from '../../../shared/domain/live/liveStrategyTracker.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const LAP = 100;
const VE_PER_LAP = 3;

/** A GT3 race at `et` seconds: laps of 100 s from 0, VE falling 3% a lap from 90%. */
function at(et: number, patch: Partial<LiveScoringReading> = {}): LiveScoringReading {
  const laps = Math.floor(et / LAP);
  return scoringReading({
    currentEt: et, endEt: 3000,
    player: vehicleReading({ totalLaps: laps, lapStartEt: laps * LAP, lapDist: ((et % LAP) / LAP) * 10_000, estimatedLapTime: LAP }),
    leader: vehicleReading({ id: 3, totalLaps: laps, lapStartEt: laps * LAP, estimatedLapTime: LAP }),
    ...patch,
  });
}

const context = (tracker: LiveStrategyTracker, reading: LiveScoringReading, patch: Partial<LiveStrategyContext> = {}) =>
  tracker.update(reading, deriveLiveState(reading, 'driving'), { carClass: 'GT3', layoutKey: null, lapsLeft: { laps: 30 - Math.floor(reading.currentEt / LAP), estimated: true }, latestLap: null, reserveLaps: 0.5, ...patch });

/** Drives from `from` to `to` seconds: a scoring reading each second, VE from standings every 3 s. */
function drive(tracker: LiveStrategyTracker, from: number, to: number, layoutKey: string | null = null) {
  let strategy = null;
  for (let et = from; et <= to; et += 1) {
    const reading = at(et);
    strategy = context(tracker, reading, { layoutKey });
    if (et % 3 === 0) {
      tracker.applyRest({ type: 'standings', veFraction: (90 - (VE_PER_LAP * et) / LAP) / 100, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
      strategy = context(tracker, reading, { layoutKey });
    }
  }
  return strategy;
}

describe('LiveStrategyTracker', () => {
  it('uses the game estimate before a lap, then the measured VE per lap, and plans the stop of a timed race', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.9, fuelPerLap: 2.1, newSets: 40, selected: null });
    const early = drive(tracker, 0, 30);
    expect(early?.resource).toMatchObject({ kind: 've', unit: '%', perLap: 2.9, perLapSource: 'game', lapsMeasured: 0 });

    const later = drive(tracker, 31, 450);
    expect(later?.resource).toMatchObject({ kind: 've', perLap: 3, perLapSource: 'measured', lapsMeasured: 3, capacity: 100 });
    // At 450 s, halfway round lap 5 with 26 laps left: 76.5% at 3%/lap with half a lap kept reaches 25 more lines,
    // so the stop is at the end of lap 29, and the last lap plus the reserve needs 4.5%, set as 5%.
    expect(later?.resource?.amount).toBe(76.5);
    expect(later?.resource?.race).toMatchObject({ finishReachable: false, pitInLaps: 24, pitLap: 29, neededAfterStop: 5, sparePerLap: 0.06 });
  });

  it('shows the stop-and-go while a penalty is pending, then the service with its random delays', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'pitStopTimes', fixRandom: 5, fuelRandom: 2, tireRandom: 1, veRandom: 0 });
    tracker.applyRest({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'request', penalties: 1 });
    tracker.applyRest({ type: 'estimate', total: 10, damage: 0, penalties: 10, fuel: 0, ve: 0, tires: 0 });
    expect(context(tracker, at(10))?.pit).toEqual({
      state: 'request', penalties: 1, serviceSeconds: null, serviceMaxSeconds: null, penaltySeconds: 10, mfd: null,
    });
    tracker.applyRest({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
    tracker.applyRest({ type: 'estimate', total: 33.7, damage: 30, penalties: 0, fuel: 3.7, ve: 1.7, tires: 0 });
    expect(context(tracker, at(11))?.pit).toMatchObject({ penalties: 0, serviceSeconds: 34, serviceMaxSeconds: 41, penaltySeconds: null });
  });

  it('plans the garage load from the session length and the event lap time, beside the setting', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 40, selected: null });
    tracker.applyRest({ type: 'garage', veStart: 50, fuelStart: null });
    const garage = at(0, { inRealtime: false, endEt: 900, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    const strategy = context(tracker, garage, { lapsLeft: null });
    expect(strategy?.resource).toBeNull();
    expect(strategy?.garage).toMatchObject({ kind: 've', sessionMinutes: 15, laps: 13, lapSeconds: 75, perLap: 2.5, needed: 34, setInGarage: 50 });
  });

  it('says the next forecast change of this session on the lap it lands', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'forecast', sessions: { RACE: [{ fraction: 0, rainChance: 0 }, { fraction: 0.5, rainChance: 60 }, { fraction: 1, rainChance: 60 }] } });
    expect(context(tracker, at(150))?.forecast).toEqual({ change: 'rain', chance: 60, atSeconds: 750, lap: 8 });
  });

  it('gives nothing in the menu, and forgets the event when the track or car changes', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 0, 450);
    const menu = at(460);
    expect(tracker.update(menu, deriveLiveState(menu, 'driving', 'menu'), { carClass: 'GT3', layoutKey: null, lapsLeft: null, latestLap: null, reserveLaps: 0.5 })).toBeNull();
    const other = at(10, { trackName: 'Bahrain International Circuit' });
    expect(context(tracker, other)?.resource).toMatchObject({ perLap: null, lapsMeasured: 0, amount: null });
  });

  it('keeps the event across sessions of one layout, and forgets it when another layout of the same track name loads', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 0, 450, 'bahrain_gp');
    // The next session of the event: the layout is unresolved until the navigation read, then the same.
    const next = (layoutKey: string | null) => context(tracker, at(10, { sessionCode: 5 }), { layoutKey })?.resource;
    expect(next(null)).toMatchObject({ perLap: 3, lapsMeasured: 3 });
    expect(next('bahrain_gp')).toMatchObject({ perLap: 3, lapsMeasured: 3 });
    // Same track name and car, the other layout: nothing measured there yet.
    expect(next('bahrain_outer')).toMatchObject({ perLap: null, lapsMeasured: 0 });
  });
});
