import { describe, expect, it } from 'vitest';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LiveStrategyTracker } from '../../../shared/domain/live/liveStrategyTracker.js';
import type { LiveStrategyContext } from '../../../shared/domain/live/liveStrategyTracker.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import type { SessionStrategy } from '../../../shared/types/session.js';

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
  tracker.update(reading, deriveLiveState(reading, 'driving'), { carClass: 'GT3', layoutKey: null, lapsLeft: { laps: 30 - Math.floor(reading.currentEt / LAP), estimated: true }, latestLap: null, reserveSeconds: LAP / 2, ...patch });

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

const pastRace = (vePerLap: number, wearPerLap: number, compound: string): SessionStrategy => ({
  kind: 've', laps: 14, start: { fuel: 50, ve: 40 }, flag: { fuel: 5, ve: 3, laps: 1 }, perLap: { fuel: 3, ve: vePerLap, laps: 10 },
  fuelRatio: { set: 1.2, needed: 1.2 }, tyres: { compound, corner: 'FL', wearPerLap, treadAtFlag: 0.7 }, stops: [],
  pace: { clean: 75, first: 75, last: 75, laps: 10 },
});

describe('LiveStrategyTracker', () => {
  it('uses learned consumption for advice but freezes the original baseline and preserves raw measurements', () => {
    const tracker = new LiveStrategyTracker((_kind, predicted) => ({ perLap: predicted + 0.2, adjustment: 0.2 }));
    tracker.applyRest({ type: 'tireManagement', vePerLap: 3, fuelPerLap: 2, newSets: 2,
      selected: { compound: 'Medium', used: false, wear: 1 } });
    const strategy = context(tracker, at(0));
    expect(strategy?.resource).toMatchObject({ perLap: 3.2, perLapSource: 'game', learning: { baselinePerLap: 3, adjustment: 0.2 } });
    expect(tracker.learningForecasts().ve).toMatchObject({ perLap: 3, perLapSource: 'game' });
    expect(tracker.observations().ve).toBeNull();
    const garage = context(tracker, at(1, { inRealtime: false }));
    expect(garage?.garage).toMatchObject({ perLap: 3.2, learning: { baselinePerLap: 3, adjustment: 0.2 } });
    const fallback = new LiveStrategyTracker(() => null);
    fallback.applyRest({ type: 'tireManagement', vePerLap: 3, fuelPerLap: 2, newSets: 2,
      selected: { compound: 'Medium', used: false, wear: 1 } });
    expect(context(fallback, at(0))?.resource?.perLap).toBe(3);
  });

  it('looks up corrections with the training wet rule, not the planner hysteresis', () => {
    const conditions: string[] = [];
    const tracker = new LiveStrategyTracker((_kind, _predicted, _source, condition) => { conditions.push(condition); return null; });
    tracker.applyRest({ type: 'tireManagement', vePerLap: 3, fuelPerLap: 2, newSets: 2,
      selected: { compound: 'Wet', used: false, wear: 1 } });
    context(tracker, at(0, { avgPathWetness: 20 / 255 }));
    expect(conditions[conditions.length - 1]).toBe('wet');
    // 10/255 is still wet for the planner (dry again only below 7) but dry for the training labels (13).
    context(tracker, at(1, { avgPathWetness: 10 / 255 }));
    expect(conditions[conditions.length - 1]).toBe('dry');
  });
  it('pairs fuel and VE on the same clean crossings, carries ratios into the garage, and resets on wet conditions', () => {
    const tracker = new LiveStrategyTracker();
    const car = (et: number) => ({ fuelLiters: 80 - et * 0.024, fuelCapacityLiters: 117,
      dentSeverity: [0,0,0,0,0,0,0,0], detached: false, lastImpactEt: 0,
      wheels: Array.from({length:4}, () => ({flat:false,detached:false})), compound: 'Medium' });
    tracker.applyCar(car(0));
    tracker.applyRest({ type: 'tireManagement', vePerLap: 3, fuelPerLap: 2.1, newSets: 2, selected: { compound: 'Medium', used: true, wear: 0.9 } });
    tracker.applyRest({ type: 'pitMenu', menu: { resourceValue: 50, resourceText: '50%', tyres: 'No Change', repair: 'N/A', fuelRatio: 0.9, fuelRatioOptions: [0.79,0.8,0.81,0.9] } });
    for (let et = 0; et <= 450; et++) {
      context(tracker, at(et));
      tracker.applyCar(car(et));
      if (et % 3 === 0) tracker.applyRest({ type: 'standings', veFraction: (90 - et * 0.03) / 100, fuelFraction: null, pitState: 'none', penalties: 0 });
      context(tracker, at(et));
    }
    // Asynchronous VE samples can raise the thirstiest crossing slightly; round conservatively up.
    expect(context(tracker, at(450))?.fuelRatio).toMatchObject({ recommended: 0.81, source: 'measured', pairedLaps: 3 });
    const garage = at(0, { sessionCode: 1, inRealtime: false, player: vehicleReading({ totalLaps: 0 }) });
    expect(context(tracker, garage)?.fuelRatio).toMatchObject({ recommended: 0.81, source: 'measured', pairedLaps: 3 });
    // Another compound keeps the measured use (only the tyre wear starts again); a wet track clears it.
    tracker.applyCar({ ...car(450), compound: 'Soft' });
    expect(context(tracker, garage)?.fuelRatio).toMatchObject({ recommended: 0.81, source: 'measured', pairedLaps: 3 });
    expect(context(tracker, at(1, { raining: 0.5 }))?.fuelRatio).toBeNull();
  });
  it('measures a lap the game counts through a countLapFlag blip, and leaves out a lap it invalidates', () => {
    const tracker = new LiveStrategyTracker();
    const lap = (lapNumber: number, valid: boolean) => ({ lapNumber, lapSeconds: LAP, sectors: [null, null, null] as [null, null, null], valid });
    for (let et = 0; et <= 350; et += 1) {
      const laps = Math.floor(et / LAP);
      // COTA race 2026-10-20: the flag drops to 1 for a second or two on laps the game still counts.
      const reading = at(et, et % LAP === 50 ? { player: vehicleReading({ totalLaps: laps, lapStartEt: laps * LAP, lapDist: 5000, estimatedLapTime: LAP, countLapFlag: 1 }) } : {});
      const latestLap = laps === 0 ? null : lap(laps, laps !== 3);
      context(tracker, reading, { latestLap });
      if (et % 3 === 0) {
        tracker.applyRest({ type: 'standings', veFraction: (90 - (VE_PER_LAP * et) / LAP) / 100, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
        context(tracker, reading, { latestLap });
      }
    }
    // Laps 2 and 3 end on the line at 200 and 300 s: lap 2 counts despite its blip, lap 3 is invalid.
    expect(tracker.observations().ve?.lap).toBe(2);
    expect(context(tracker, at(350))?.resource).toMatchObject({ perLapSource: 'measured', lapsMeasured: 1 });
  });

  it('uses the game estimate before a lap, then the measured VE per lap, and plans the stop of a timed race', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.9, fuelPerLap: 2.1, newSets: 40, selected: null });
    const early = drive(tracker, 0, 30);
    expect(early?.resource).toMatchObject({ kind: 've', unit: '%', perLap: 2.9, perLapSource: 'game', lapsMeasured: 0 });

    const later = drive(tracker, 31, 450);
    expect(later?.resource).toMatchObject({ kind: 've', perLap: 3.02, perLapSource: 'measured', lapsMeasured: 3, capacity: 100 });
    // The 3 s samples measure the laps a few hundredths either side of 3 %; leaving out the lowest gives 3.02 %/lap.
    // At 450 s, halfway round lap 5 with 26 laps left, 76.5 % covers 25.3 of the 25.5 laps to the flag: a stop at the
    // end of lap 24 or, at the end of this lap, one that loads 25 laps plus the reserve.
    expect(later?.resource?.amount).toBe(76.5);
    expect(later?.resource?.race).toMatchObject({ finishReachable: false, atFinish: null, pitInLaps: 24, neededStopNow: 78 });
  });

  it('shows the stop-and-go while a penalty is pending, then the service with its random delays', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'pitStopTimes', fixRandom: 5, fuelRandom: 2, tireRandom: 1, veRandom: 0, fuelFillRate: 4, veFillRate: 2.5, fuelInsert: 1, veInsert: 0 });
    tracker.applyRest({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'request', penalties: 1 });
    tracker.applyRest({ type: 'estimate', total: 10, damage: 0, penalties: 10, fuel: 0, ve: 0, tires: 0 });
    expect(context(tracker, at(10))?.pit).toEqual({
      state: 'request', penalties: 1, serviceSeconds: null, serviceMaxSeconds: null, plannedServiceSeconds: null, penaltySeconds: 10, mfd: null,
    });
    tracker.applyRest({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
    tracker.applyRest({ type: 'estimate', total: 33.7, damage: 30, penalties: 0, fuel: 3.7, ve: 1.7, tires: 0 });
    expect(context(tracker, at(11))?.pit).toMatchObject({ penalties: 0, serviceSeconds: 34, serviceMaxSeconds: 41, penaltySeconds: null });
  });

  it('times the refuel of the planned stop from the VE left at its pit entry, not from the VE now', () => {
    // Le Mans race 2026-10-22, lap 11: 29% VE, MFD at 20%, the game estimating 0 s; the stop came two laps later.
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'pitStopTimes', fixRandom: 5, fuelRandom: 2, tireRandom: 1, veRandom: 0, fuelFillRate: 4, veFillRate: 2.5, fuelInsert: 1, veInsert: 0 });
    tracker.applyRest({ type: 'tireManagement', vePerLap: 8, fuelPerLap: null, newSets: 0, selected: null });
    tracker.applyRest({ type: 'standings', veFraction: 0.29, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
    const menu = (target: number) => ({ type: 'pitMenu' as const, menu: { resourceValue: target, resourceText: `${target}%`, tyres: 'No Change', repair: 'N/A' } });
    context(tracker, at(0));
    // Filling to 100% from 29%: 71% at 0.4 s and a fixed 1.3 s, learned from the game's own estimate.
    tracker.applyRest(menu(100));
    tracker.applyRest({ type: 'estimate', total: 29.7, damage: 0, penalties: 0, fuel: 15, ve: 29.7, tires: 0 });
    tracker.applyRest(menu(20));
    tracker.applyRest({ type: 'estimate', total: 0, damage: 0, penalties: 0, fuel: 0, ve: 0, tires: 0 });
    // 25% usable at 8%/lap reaches 3 lines: in at 5%, so 15% to load: 1.3 + 6 s, up to 2 s more.
    const strategy = context(tracker, at(0));
    expect(strategy?.resource?.race).toMatchObject({ pitInLaps: 2 });
    expect(strategy?.pit).toMatchObject({ serviceSeconds: 7, serviceMaxSeconds: 9 });
    // The race distance prices the stop the plan needs, whatever the MFD holds: 30 laps left want a full 100%, 95% to load.
    expect(strategy?.resource?.race?.neededAfterStop).toBe(100);
    expect(strategy?.pit?.plannedServiceSeconds).toBe(39.3);
    // Requested: the stop is at the end of this lap, from 29 - 8 = 21%: nothing to load.
    tracker.applyRest({ type: 'standings', veFraction: 0.29, fuelFraction: 0.4, pitState: 'request', penalties: 0 });
    expect(context(tracker, at(0))?.pit).toMatchObject({ serviceSeconds: 0, serviceMaxSeconds: 0 });
    // In the pit lane the game's own estimate stands.
    tracker.applyRest({ type: 'standings', veFraction: 0.29, fuelFraction: 0.4, pitState: 'entering', penalties: 0 });
    tracker.applyRest({ type: 'estimate', total: 6.1, damage: 0, penalties: 0, fuel: 4.2, ve: 6.1, tires: 0 });
    expect(context(tracker, at(0))?.pit).toMatchObject({ serviceSeconds: 6, serviceMaxSeconds: 8 });
  });

  it('turns the reserve seconds into laps at the player pace, half a lap without a lap time', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 0, 450);
    // Four 100 s laps measured: 45 s is 0.45 of a lap.
    expect(context(tracker, at(460), { reserveSeconds: 45 })?.resource?.reserveLaps).toBe(0.45);
    const garage = at(0, { inRealtime: false, gamePhase: 0, endEt: 64, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 0 }) });
    expect(context(new LiveStrategyTracker(), garage, { reserveSeconds: 45, lapsLeft: null })?.garage?.reserveLaps).toBe(0.5);
  });

  it('plans the garage load from the session length and the event lap time, beside the setting', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 40, selected: null });
    tracker.applyRest({ type: 'garage', veStart: 50, fuelStart: null });
    // The race garage before the start: the schedule's 15 minutes, twelve laps at 1:15 plus the formation lap (no VE on it).
    tracker.applyRest({ type: 'schedule', raceMinutes: 15, hasQualifying: true });
    const garage = at(0, { inRealtime: false, gamePhase: 0, endEt: 64, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    const strategy = context(tracker, garage, { lapsLeft: null });
    expect(strategy?.resource).toBeNull();
    expect(strategy?.garage).toMatchObject({ kind: 've', sessionMinutes: 15, laps: 13, lapSeconds: 75, perLap: 2.5, needed: 32, setInGarage: 50 });
    // On the grid the plan stays: the driver can still go back to the garage before the start.
    const grid = at(0, { gamePhase: 0, endEt: 64, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    expect(context(tracker, grid, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: 15, laps: 13, needed: 32, setInGarage: 50 });
    // Once the race runs there is no garage plan.
    expect(context(tracker, at(10, { gamePhase: 5 }))?.garage).toBeNull();
  });

  it('starts the next session of the event from the game estimate, so the fuel ratio is there before qualifying', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 40, selected: null });
    tracker.applyRest({ type: 'pitMenu', menu: { resourceValue: null, resourceText: null, tyres: null, repair: null, fuelRatioOptions: [0.8, 0.84, 0.86, 0.88] } });
    tracker.applyRest({ type: 'garage', veStart: 50, fuelStart: null, fuelRatio: 0.86 });
    const practice = at(30, { sessionCode: 1, inRealtime: false, endEt: 600, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 100 }) });
    expect(context(tracker, practice, { lapsLeft: null })?.fuelRatio?.recommended).toBe(0.84);
    // Qualifying loads: its own tyre screen is not read yet, the practice estimate stands for the same car and layout.
    const qualifying = at(5, { sessionCode: 5, inRealtime: false, endEt: 600, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 100 }) });
    const strategy = context(tracker, qualifying, { lapsLeft: null });
    expect(strategy?.fuelRatio).toMatchObject({ recommended: 0.84, source: 'game' });
    expect(strategy?.garage).toMatchObject({ perLap: 2.5, perLapSource: 'game' });
    // Another track: the estimate goes with the event.
    const other = at(5, { trackName: 'Bahrain International Circuit', sessionCode: 5, inRealtime: false, endEt: 600 });
    expect(context(tracker, other, { lapsLeft: null })?.fuelRatio ?? null).toBeNull();
  });

  it('plans from the time left to the session end, and not from the countdown before a race', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 40, selected: null });
    // A 3-minute practice whose clock ends at 210 s (seen live): 3 minutes and two laps at 1:46 from 30 s.
    const practice = at(30, { sessionCode: 1, inRealtime: false, endEt: 210, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 106 }) });
    expect(context(tracker, practice, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: 3, laps: 2 });
    // On the race grid `endEt` is the 64 s countdown to the start: the race length is unknown until the green flag.
    const grid = at(3, { inRealtime: false, gamePhase: 0, endEt: 64, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 103 }) });
    expect(context(tracker, grid, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: null, laps: null, needed: null });
    // In the race garage LMU can report the paused phase with the clock at 0 and the end at 5 s (seen 2026-10-17).
    const paused = at(0, { inRealtime: false, gamePhase: 9, endEt: 5, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 103 }) });
    expect(context(tracker, paused, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: null, laps: null });
    // The event's schedule gives the race length: 5 minutes, three laps at 1:43 plus the formation lap.
    tracker.applyRest({ type: 'schedule', raceMinutes: 5, hasQualifying: true });
    expect(context(tracker, paused, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: 5, laps: 4 });
    expect(context(tracker, grid, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: 5, laps: 4 });
    // Back in the garage with the race clock running: the formation lap is behind, 5 minutes left are three laps to the flag.
    const racing = at(60, { inRealtime: false, gamePhase: 5, endEt: 360, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 103 }) });
    expect(context(tracker, racing, { lapsLeft: null })?.garage).toMatchObject({ sessionMinutes: 5, laps: 3 });
  });

  it('plans the race from the qualifying garage, with the schedule and the game tyre change time, until the race runs', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 3, selected: { compound: 'Medium', used: false, wear: 1 } });
    tracker.applyRest({ type: 'pitStopTimes', fixRandom: 0, fuelRandom: 0, tireRandom: 0, veRandom: 0, fuelFillRate: 4, veFillRate: 2.5,
      fuelInsert: 0, veInsert: 0, fourTyreChange: 12 });
    const qualifying = at(5, { sessionCode: 5, inRealtime: false, endEt: 600, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    expect(context(tracker, qualifying, { lapsLeft: null })?.garage?.raceStrategy).toBeNull();
    // 15 minutes at 1:15, the leader at that pace: 12 racing laps on 2.5 % a lap, the formation lap on none.
    tracker.applyRest({ type: 'schedule', raceMinutes: 15, hasQualifying: true });
    expect(context(tracker, qualifying, { lapsLeft: null })?.garage?.raceStrategy).toMatchObject({ raceMinutes: 15, laps: 12,
      chosen: { name: 'NO STOP', stops: 0, loadStart: 32, tyresStart: 'NEW MEDIUM', tyresStop: null }, nextBest: null });
    const racing = at(60, { inRealtime: false, gamePhase: 5, endEt: 960, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    expect(context(tracker, racing, { lapsLeft: null })?.garage?.raceStrategy).toBeNull();
  });

  it('uses the actual weekend in practice: no race plan on practice servers, no qualifying set without qualifying', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 4, fuelPerLap: 3, newSets: 2,
      selected: { compound: 'Medium', used: false, wear: 1 } });
    const practice = at(5, { sessionCode: 1, inRealtime: false, endEt: 7200,
      player: vehicleReading({ totalLaps: 0, estimatedLapTime: 100 }) });
    const garage = () => context(tracker, practice, { lapsLeft: null })?.garage;
    expect(garage()?.raceStrategy).toBeNull();
    tracker.applyRest({ type: 'schedule', raceMinutes: null, hasQualifying: false });
    expect(garage()).toMatchObject({ sessionMinutes: 120, perLap: 4, raceStrategy: null });
    // Practice then a race: both new sets belong to the race, so changing tyres at the one stop is possible.
    tracker.applyRest({ type: 'schedule', raceMinutes: 60, hasQualifying: false });
    expect(garage()?.raceStrategy).toMatchObject({ chosen: { stops: 1, tyresStart: 'NEW MEDIUM' },
      nextBest: { tyresStop: 'NEW MEDIUM' } });
    // The same race with qualifying: its set must be kept aside, leaving no new set for a race stop.
    tracker.applyRest({ type: 'schedule', raceMinutes: 60, hasQualifying: true });
    expect(garage()?.raceStrategy).toMatchObject({ chosen: { stops: 1 }, nextBest: null });
    // Qualifying alone also has no race to plan.
    tracker.applyRest({ type: 'schedule', raceMinutes: null, hasQualifying: true });
    expect(garage()?.raceStrategy).toBeNull();
  });

  it('keeps the weekend through its sessions and waits for a new schedule after leaving a server', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 4, fuelPerLap: 3, newSets: 3, selected: null });
    tracker.applyRest({ type: 'schedule', raceMinutes: 20, hasQualifying: true });
    const practice = at(5, { sessionCode: 1, inRealtime: false, endEt: 7200,
      player: vehicleReading({ totalLaps: 0, estimatedLapTime: 100 }) });
    expect(context(tracker, practice)?.garage?.raceStrategy).not.toBeNull();
    const qualifying = { ...practice, sessionCode: 5 };
    expect(context(tracker, qualifying)?.garage?.raceStrategy).not.toBeNull();
    tracker.update(null, { lifecycle: 'menu', session: null }, { carClass: 'GT3', layoutKey: null,
      lapsLeft: null, latestLap: null, reserveSeconds: LAP / 2 });
    // Another server with the same car and layout: no plan before its schedule, or after its practice-only answer.
    expect(context(tracker, practice)?.garage?.raceStrategy).toBeNull();
    tracker.applyRest({ type: 'schedule', raceMinutes: null, hasQualifying: false });
    expect(context(tracker, practice)?.garage?.raceStrategy).toBeNull();
  });

  it('plans the race from earlier races on the layout before the event has a lap (the load too), the wear on the same compound only', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'tireManagement', vePerLap: 2.5, fuelPerLap: 2.1, newSets: 3, selected: { compound: 'Medium', used: false, wear: 1 } });
    tracker.applyRest({ type: 'schedule', raceMinutes: 15, hasQualifying: true });
    const qualifying = at(5, { sessionCode: 5, inRealtime: false, endEt: 600, player: vehicleReading({ totalLaps: 0, estimatedLapTime: 75 }) });
    expect(context(tracker, qualifying, { lapsLeft: null })?.garage?.raceStrategy).toMatchObject({
      chosen: { loadStart: 32, treadAtFlag: null }, basis: { use: 'game', wear: null, races: 0 } });
    // Three races here: 3 % a lap, and 2 % of tread a lap on mediums. The soft race's wear stays out.
    tracker.setRaceHistory([pastRace(2.9, 0.019, 'Medium'), pastRace(3.1, 0.021, 'Medium'), pastRace(3, 0.05, 'Soft')]);
    const garage = context(tracker, qualifying, { lapsLeft: null })?.garage;
    // The 50 s reserve is two thirds of a 1:15 lap: (12 + 0.67) x 3 = 38.01, set as 39.
    expect(garage?.raceStrategy).toMatchObject({
      chosen: { loadStart: 39, treadAtFlag: 0.76 }, basis: { use: 'history', wear: 'history', races: 3 } });
    // The garage load and the whole dashboard use the same history, not the game's estimate.
    expect(garage).toMatchObject({ perLap: 3, perLapSource: 'history' });
    // Another layout or class: no history.
    tracker.setRaceHistory([]);
    expect(context(tracker, qualifying, { lapsLeft: null })?.garage?.raceStrategy?.basis).toEqual({ use: 'game', wear: null, races: 0 });
  });

  it('says the next forecast change of this session on the lap it lands', () => {
    const tracker = new LiveStrategyTracker();
    tracker.applyRest({ type: 'forecast', sessions: { RACE: [{ fraction: 0, rainChance: 0 }, { fraction: 0.5, rainChance: 60 }, { fraction: 1, rainChance: 60 }] } });
    expect(context(tracker, at(150))?.forecast).toEqual({ change: 'rain', chance: 60, atSeconds: 750, lap: 8 });
  });

  it('gives nothing in the menu, keeps the event through it, and forgets it when the track or car changes', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 0, 450);
    const menu = at(460);
    expect(tracker.update(menu, deriveLiveState(menu, 'driving', 'menu'), { carClass: 'GT3', layoutKey: null, lapsLeft: null, latestLap: null, reserveSeconds: LAP / 2 })).toBeNull();
    // Back from the menu with the same car on the same track: the event's measured use is kept.
    expect(context(tracker, at(10))?.resource).toMatchObject({ perLap: 3.02, lapsMeasured: 3 });
    const other = at(10, { trackName: 'Bahrain International Circuit' });
    expect(context(tracker, other)?.resource).toMatchObject({ perLap: null, lapsMeasured: 0, amount: null });
  });

  it('keeps the event across sessions of one layout, and forgets it when another layout of the same track name loads', () => {
    const tracker = new LiveStrategyTracker();
    drive(tracker, 0, 450, 'bahrain_gp');
    // The next session of the event: the layout is unresolved until the navigation read, then the same.
    const next = (layoutKey: string | null) => context(tracker, at(10, { sessionCode: 5 }), { layoutKey })?.resource;
    expect(next(null)).toMatchObject({ perLap: 3.02, lapsMeasured: 3 });
    expect(next('bahrain_gp')).toMatchObject({ perLap: 3.02, lapsMeasured: 3 });
    // Same track name and car, the other layout: nothing measured there yet.
    expect(next('bahrain_outer')).toMatchObject({ perLap: null, lapsMeasured: 0 });
  });
});
