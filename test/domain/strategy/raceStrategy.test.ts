import { describe, expect, it } from 'vitest';
import { planRaceStrategies, type RaceStrategyInput } from '../../../shared/domain/strategy/raceStrategy.js';

// 60 minutes at 1:36.6 on 4 % VE a lap: 38 racing laps after the formation lap (it costs no VE), one stop.
const input = (over: Partial<RaceStrategyInput> = {}): RaceStrategyInput => ({
  kind: 've', raceMinutes: 60, lapSeconds: 96.6, perLap: 4, reserveLaps: 0.5, capacity: 100, qualifyingAhead: true,
  tyres: { compound: 'Medium', used: false, wear: 1, newSets: 3 }, compound: 'Medium', wearPerLap: 0.008, tyreChangeSeconds: 12, pitLaneSeconds: null, refuel: null, ...over,
});

describe('race strategy before the race', () => {
  it('stops for VE full at the start, loads what the finish needs, and keeps the set when its tread holds', () => {
    const plan = planRaceStrategies(input());
    expect(plan).toMatchObject({ raceMinutes: 60, laps: 38, unit: '%' });
    expect(plan?.chosen).toEqual({ name: 'NO TYRE CHANGE', stops: 1, pitLap: 24, loadStart: 100, loadToFinish: 58,
      tyresStart: 'NEW MEDIUM', tyresStop: 'NO CHANGE', treadAtFlag: 0.696, gapSeconds: 0 });
    expect(plan?.nextBest).toMatchObject({ name: 'NEW TYRES AT THE STOP', tyresStop: 'NEW MEDIUM', treadAtFlag: 0.888, gapSeconds: 12 });
  });

  it('changes tyres when one set would go below the floor, the quicker plan said with its tread', () => {
    const plan = planRaceStrategies(input({ wearPerLap: 0.02 }));
    expect(plan?.chosen).toMatchObject({ name: 'NEW TYRES AT THE STOP', treadAtFlag: 0.72 });
    expect(plan?.nextBest).toMatchObject({ name: 'NO TYRE CHANGE', treadAtFlag: 0.24, gapSeconds: -12 });
  });

  it('keeps a new set for qualifying: with one left for the race there is nothing to change to', () => {
    expect(planRaceStrategies(input({ tyres: { compound: 'Medium', used: false, wear: 1, newSets: 2 } }))?.nextBest).toBeNull();
  });

  it('starts the race garage on the set fitted, used included', () => {
    const plan = planRaceStrategies(input({ qualifyingAhead: false, tyres: { compound: 'Medium', used: true, wear: 0.9, newSets: 1 } }));
    expect(plan?.chosen).toMatchObject({ tyresStart: 'USED MEDIUM', treadAtFlag: 0.596 });
  });

  it('loads only the race without a stop, and leaves unknowns unknown', () => {
    expect(planRaceStrategies(input({ raceMinutes: 20 }))).toMatchObject({ laps: 13,
      chosen: { name: 'NO STOP', stops: 0, pitLap: null, loadStart: 54, loadToFinish: null, tyresStop: null }, nextBest: null });
    const unknown = planRaceStrategies(input({ wearPerLap: null, tyreChangeSeconds: null }));
    expect(unknown?.chosen).toMatchObject({ name: 'NO TYRE CHANGE', treadAtFlag: null });
    expect(unknown?.nextBest).toMatchObject({ treadAtFlag: null, gapSeconds: null });
    expect(planRaceStrategies(input({ raceMinutes: null }))).toBeNull();
    expect(planRaceStrategies(input({ perLap: null }))).toBeNull();
  });

  it('spaces further stops a full tank apart', () => {
    expect(planRaceStrategies(input({ raceMinutes: 120, perLap: 5 }))?.chosen).toMatchObject({ stops: 3, pitLap: 19, loadToFinish: 93 });
  });

  it('takes the stops off the clock: every car loses their time (Le Mans race 2026-10-23, 17 laps run)', () => {
    const lemans = input({ lapSeconds: 208.858, perLap: 8.16, qualifyingAhead: false, tyres: { compound: 'Medium', used: true, wear: 1, newSets: 0 },
      wearPerLap: 0.0126 });
    // Without the stop's time 3600 s read 18 racing laps; the 30.7 s lane and 51 % at 2.5 %/s cost 51 s: 17.
    expect(planRaceStrategies(lemans)).toMatchObject({ laps: 18, chosen: { pitLap: 11, loadToFinish: 62 } });
    expect(planRaceStrategies({ ...lemans, pitLaneSeconds: 30.7, refuel: { secondsPerUnit: 0.4, base: 0 } }))
      .toMatchObject({ laps: 17, chosen: { stops: 1, pitLap: 11, loadStart: 100, loadToFinish: 54 } });
    // A sprint has no stop to take off.
    expect(planRaceStrategies({ ...lemans, raceMinutes: 20, pitLaneSeconds: 30.7, refuel: { secondsPerUnit: 0.4, base: 0 } }))
      .toMatchObject({ laps: 6, chosen: { stops: 0, loadStart: 54 } });
  });
});
