import { describe, expect, it } from 'vitest';
import { liveResourceKind, planGarage, planRace, sessionLaps } from '../../../shared/domain/live/liveResourcePlan.js';
import { LiveUsageMeter } from '../../../shared/domain/live/liveUsage.js';

const race = (patch: Partial<Parameters<typeof planRace>[0]> = {}) => planRace({
  amount: 50, perLap: 4, reserveLaps: 0.5, capacity: 100, lapsLeft: 20, lapFraction: 0, lapNumber: 11, ...patch,
});

describe('liveResourceKind', () => {
  it('uses VE for GT3 and Hypercar only, fuel for every other class and an unknown one', () => {
    expect(liveResourceKind('GT3')).toBe('ve');
    expect(liveResourceKind('Hyper')).toBe('ve');
    expect(liveResourceKind('LMP2')).toBe('fuel');
    expect(liveResourceKind('LMP3')).toBe('fuel');
    expect(liveResourceKind(null)).toBe('fuel');
  });
});

describe('planRace', () => {
  it('pits on the last line reached with the reserve and sets the MFD for the rest plus the reserve', () => {
    // 50% at 4%/lap with half a lap kept: 12 crossings from the line, so lap 11 + 11 = 22 is the pit lap.
    expect(race()).toEqual({
      finishReachable: false, atFinish: null, pitInLaps: 11, pitLap: 22,
      sparePerLap: 0, neededAfterStop: 34, neededStopNow: 78, stopsAfterNext: 0,
    });
  });

  it('counts the part of the lap already driven and says pit this lap when only this line is reachable', () => {
    expect(race({ amount: 4, lapFraction: 0.5 })).toMatchObject({ pitInLaps: 0, pitLap: 11, sparePerLap: 0 });
    // Not even this line with the reserve: still this lap, with the over-use per lap shown.
    expect(race({ amount: 1, lapFraction: 0.2 })).toMatchObject({ pitInLaps: 0, sparePerLap: -5.25 });
  });

  it('reports spare per lap and the amount at the finish when the finish is reachable (no pit stop)', () => {
    expect(race({ amount: 30, lapsLeft: 6, lapFraction: 0.5 })).toEqual({
      finishReachable: true, atFinish: 8, pitInLaps: null, pitLap: null,
      sparePerLap: 1.45, neededAfterStop: null, neededStopNow: 22, stopsAfterNext: 0,
    });
  });

  it('keeps no reserve at the finish: a reachable flag never calls a stop', () => {
    // Le Mans race 2026-10-22, last lap: 11% VE at 7.67%/lap, under the 11.5% with the reserve; finished with 3%.
    expect(race({ amount: 11, perLap: 7.67, lapsLeft: 1, lapFraction: 0 })).toMatchObject({ finishReachable: true, atFinish: 3.3, pitInLaps: null });
    expect(race({ amount: 7, perLap: 7.67, lapsLeft: 1, lapFraction: 0 })).toMatchObject({ finishReachable: false, pitInLaps: 0 });
  });

  it('caps the amount after the stop at a full tank and counts the further stops', () => {
    expect(race({ amount: 20, lapsLeft: 60 })).toMatchObject({ neededAfterStop: 100, neededStopNow: 100, stopsAfterNext: 2 });
  });

  it('sets a stop at the end of this lap for every lap after it plus the reserve, more than the later planned stop', () => {
    // Planned in 11 laps: 8 laps after it (34). Stopping now leaves 19 laps after it: 19.5 x 4 = 78.
    expect(race()).toMatchObject({ pitInLaps: 11, neededAfterStop: 34, neededStopNow: 78 });
    // On the pit lap the two agree.
    expect(race({ amount: 4, lapFraction: 0.5 })).toMatchObject({ pitInLaps: 0, neededAfterStop: 78, neededStopNow: 78 });
    // On the last lap only the reserve is left to load.
    expect(race({ amount: 1, lapsLeft: 1 }).neededStopNow).toBe(2);
  });

  it('rounds the MFD amount up to a whole unit', () => {
    // 19 crossings reached, 6 laps after the stop: 6.5 x 2.53 = 16.4, set as 17.
    expect(race({ perLap: 2.53, lapsLeft: 25 }).neededAfterStop).toBe(17);
  });
});

describe('planGarage', () => {
  it('projects a multiclass race to the overall leader flag, then converts that time to class laps', () => {
    const input = { kind: 've' as const, formationLap: true, sessionSeconds: 3600, raceLeaderLapSeconds: 110, lapSeconds: 120,
      perLap: 3.2, perLapSource: 'measured' as const, lapsMeasured: 8, reserveLaps: .5, capacity: 100, setInGarage: 100 };
    // Overall leader: 33 x 110 = 3630 s. GT3: 31 racing laps plus one formation lap, not 33 Hyper laps.
    expect(planGarage(input)).toMatchObject({ laps: 32, needed: 100, stops: 1 });
    // Without the leader's pace the flag can fall up to one of our laps after the clock: 3720 s, 31 laps plus formation,
    // not the 30 the bare clock gives (one lap short behind a faster leader).
    expect(planGarage({ ...input, raceLeaderLapSeconds: null })).toMatchObject({ laps: 32 });
    expect(planGarage({ ...input, raceLeaderLapSeconds: 0 })).toMatchObject({ laps: 32 });
    // Practice and qualifying end with the clock: no flag lap added.
    expect(planGarage({ ...input, formationLap: false, raceLeaderLapSeconds: null })).toMatchObject({ laps: 30 });
  });
  it('previews the first racing pit lap from the selected load, formation use and reserve', () => {
    const input = { kind: 've' as const, formationLap: true, sessionSeconds: 2700, raceLeaderLapSeconds: 121.4, lapSeconds: 121.4, perLap: 4.5,
      perLapSource: 'measured' as const, lapsMeasured: 8, reserveLaps: .5, capacity: 100, setInGarage: 100 };
    expect(planGarage(input)).toMatchObject({ laps: 24, stops: 1, firstPitLap: 20 });
    expect(planGarage({ ...input, setInGarage: 80 })).toMatchObject({ firstPitLap: 16 });
    expect(planGarage({ ...input, setInGarage: null }).firstPitLap).toBeNull();
    expect(planGarage({ ...input, perLap: null }).firstPitLap).toBeNull();
    expect(planGarage({ ...input, perLap: 0 }).firstPitLap).toBeNull();
    expect(planGarage({ ...input, setInGarage: 2 }).firstPitLap).toBeNull();
    expect(planGarage({ ...input, sessionSeconds: 1200 })).toMatchObject({ stops: 0, firstPitLap: null });
  });
  it('loads the session laps (laps started before the clock ends, plus a race formation lap) and the reserve', () => {
    // The out lap of practice is one of the laps the clock allows; a race adds its formation lap.
    expect(sessionLaps(900, 75, false)).toBe(12);
    expect(sessionLaps(900, 75, true)).toBe(13);
    // A 3-minute practice at 1:46 is two laps, not three.
    expect(sessionLaps(180, 106, false)).toBe(2);
    expect(planGarage({
      kind: 've', formationLap: false, sessionSeconds: 900, lapSeconds: 75, perLap: 2.5, perLapSource: 'measured', lapsMeasured: 6,
      reserveLaps: 0.5, capacity: 100, setInGarage: 50,
    })).toEqual({
      kind: 've', unit: '%', sessionMinutes: 15, laps: 12, lapSeconds: 75, perLap: 2.5, perLapSource: 'measured',
      lapsMeasured: 6, reserveLaps: 0.5, needed: 32, stops: 0, setInGarage: 50, firstPitLap: null,
    });
  });

  it('caps at a full tank with the stops a long race needs, and stays unknown without a lap time', () => {
    const base = { kind: 'fuel' as const, formationLap: true, perLapSource: 'game' as const, lapsMeasured: 0, reserveLaps: 0.5, setInGarage: null };
    expect(planGarage({ ...base, sessionSeconds: 3600, lapSeconds: 120, perLap: 3, capacity: 75 })).toMatchObject({ needed: 75, stops: 1, unit: 'L' });
    expect(planGarage({ ...base, sessionSeconds: 3600, lapSeconds: null, perLap: 3, capacity: 75 })).toMatchObject({ laps: null, needed: null, stops: null });
  });
});

describe('LiveUsageMeter', () => {
  it('measures each lap between interpolated amounts at its two crossings', () => {
    const meter = new LiveUsageMeter();
    // 2.5% per lap of 75 s, sampled every 3 s with the crossings between samples.
    for (let et = 0; et <= 240; et += 3) meter.addSample(et, 50 - (2.5 * et) / 75);
    meter.addCrossing(1, 74, false);
    meter.addCrossing(2, 149, false);
    meter.addCrossing(3, 224, false);
    expect(meter.laps).toEqual([2.5, 2.5]);
    expect(meter.perLap()).toBe(2.5);
  });

  it('measures crossings that arrive before the samples around them, and keeps the last three for the figure', () => {
    const meter = new LiveUsageMeter();
    meter.addSample(0, 60);
    meter.addCrossing(1, 1.5, false);
    meter.addSample(3, 59);
    const uses = [2, 3, 4, 5];
    let amount = 59;
    let et = 3;
    uses.forEach((use, index) => {
      meter.addCrossing(index + 2, et + 1.5, false);
      amount -= use;
      et += 3;
      meter.addSample(et, amount);
    });
    // Crossings halfway between samples split each step between the laps either side: 1.5, 2.5, 3.5, 4.5.
    expect(meter.laps).toEqual([1.5, 2.5, 3.5, 4.5]);
    expect(meter.perLap()).toBe(3.5);
  });

  it('leaves out pit and caution laps, refuelled laps, unbracketed crossings, and keeps laps across a new session', () => {
    const meter = new LiveUsageMeter();
    const at = (et: number, amount: number) => meter.addSample(et, amount);
    at(0, 50); meter.addCrossing(1, 1, false); at(2, 49);
    at(80, 46); meter.addCrossing(2, 81, true); at(82, 45);
    at(160, 90); meter.addCrossing(3, 161, false); at(162, 89);
    meter.addCrossing(4, 240, false); at(270, 85);
    at(300, 84); meter.addCrossing(5, 301, false); at(302, 83);
    expect(meter.laps).toEqual([]);
    at(380, 80); meter.addCrossing(6, 381, false); at(382, 79);
    expect(meter.laps).toEqual([4]);
    // The clock goes back: a new session of the same event keeps its measured laps.
    at(10, 70);
    expect(meter.perLap()).toBe(4);
    meter.clear();
    expect(meter.perLap()).toBeNull();
  });
});
