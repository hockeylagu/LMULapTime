import { describe, expect, it } from 'vitest';
import { analyzeCorners, MAX_HABITS } from '../../../shared/domain/cornerAnalysis/analyzeCorners.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';
import type { AnalysisDriver, CornerAnalysisInput } from '../../../shared/types/corners/cornerAnalysis.js';

interface Drive {
  toApex?: number; fromApex?: number; entry?: number; min?: number; exit?: number; minM?: number; brakeM?: number | null;
  peakBrake?: number | null; brakeSec?: number; partThrottle?: number | null; gear?: number | null; abs?: number; coast?: number; aheadGap?: number | null;
}

/** A pass through turn `segment`: 2 s to the slowest point at 800 m and 2 s out, braking at 700 m, by default. */
function pass(segment: number, lapNumber: number, drive: Drive = {}): CornerPass {
  const entrySec = lapNumber * 100 + segment * 10;
  const toApex = drive.toApex ?? 2, fromApex = drive.fromApex ?? 2;
  return {
    slot: 0, lapNumber, segment, entrySec, minSpeedSec: entrySec + toApex, exitSec: entrySec + toApex + fromApex,
    entrySpeedKmh: drive.entry ?? 200, minSpeedKmh: drive.min ?? 90, exitSpeedKmh: drive.exit ?? 150,
    minSpeedM: drive.minM ?? 800 + segment * 1000, brakeM: drive.brakeM === undefined ? 700 + segment * 1000 : drive.brakeM,
    turnInM: null, throttleM: null, minSpeedGear: drive.gear === undefined ? 3 : drive.gear,
    peakBrake: drive.peakBrake === undefined ? 0.9 : drive.peakBrake,
    brakeSec: drive.brakeSec ?? 1, partThrottleSec: drive.partThrottle === undefined ? 0.5 : drive.partThrottle, tcSec: 0, absSec: drive.abs ?? 0,
    coastSec: drive.coast ?? 0,
    aheadSlot: null, aheadGapSec: drive.aheadGap ?? null, behindSlot: null, behindGapSec: null,
  };
}

/** A driver with `laps` counted laps through turns 0 and 1, each lap's drive per turn from `drive`. */
function driver(name: string, laps: number, drive: (turn: number, lap: number) => Drive = () => ({}), sameSession = true): AnalysisDriver {
  return {
    sessionId: sameSession ? 's1' : 's0', driverOrdinal: name.length, name, car: 'Car A', sameSession,
    laps: Array.from({ length: laps }, (_, k) => ({ lapOrdinal: k + 1, passes: [0, 1].map(turn => pass(turn, k + 2, drive(turn, k))) })),
  };
}

const input = (own: AnalysisDriver, others: AnalysisDriver[]): CornerAnalysisInput => ({
  lengthM: 5000, minReferenceLaps: 3, driver: own, others,
  corners: [{ id: 0, label: 'SQ1', name: 'T1–T2', turnIds: [0, 1] }],
  turns: [{ id: 0, label: 'T1' }, { id: 1, label: 'T2' }],
});

describe('analyzeCorners', () => {
  it('names an early brake point into the slowest point as the habit, against the quickest of the session over the lap', () => {
    // Braking 10 m earlier into T1 and 0.1 s slower to its slowest point, on every lap.
    const own = driver('Ann', 5, turn => (turn === 0 ? { brakeM: 690, toApex: 2.1 } : {}));
    const analysis = analyzeCorners(input(own, [driver('Bob', 4), driver('Cy', 4, () => ({ toApex: 2.2 }))]));
    expect(analysis.corners[0]).toMatchObject({ label: 'SQ1', reference: { name: 'Bob', sameSession: true, laps: 4 } });
    expect(analysis.corners[0].lossSec).toBeCloseTo(0.1);
    expect(analysis.habits).toHaveLength(1);
    expect(analysis.habits[0]).toMatchObject({ turnLabel: 'T1', half: 'in', rule: 'brakeEarly', gap: 10, repeatability: 1, line: 'Brake 10 m later into T1' });
    expect(analysis.habits[0].lossSec).toBeCloseTo(0.1);
    expect(analysis.mistakes).toEqual([]);
  });

  it("names each side's lap closest to the usual through the corner, the one a view opens", () => {
    // Bob's laps through T1: 2.0, 2.3, 2.1 s to the slowest point; his usual (2.1 + 2.0) is his third lap.
    const bob = driver('Bob', 3, (turn, lap) => (turn === 0 ? { toApex: [2, 2.3, 2.1][lap] } : {}));
    const own = driver('Ann', 3, (turn, lap) => (turn === 0 ? { toApex: [2.2, 2.4, 2.6][lap] } : {}));
    const [corner] = analyzeCorners(input(own, [bob])).corners;
    expect(corner.usualLapOrdinal).toBe(2);
    expect(corner.reference).toMatchObject({ name: 'Bob', car: 'Car A', usualLapOrdinal: 3 });
  });

  it("takes the layout's fastest only when nobody in the session was quicker, at lower confidence", () => {
    const own = driver('Ann', 5, turn => (turn === 1 ? { fromApex: 2.2, min: 95, exit: 145 } : {}));
    const slowerHere = driver('Bob', 4, () => ({ fromApex: 2.3 }));
    const elsewhere = driver('Dee', 4, () => ({}), false);
    const analysis = analyzeCorners(input(own, [slowerHere, elsewhere]));
    expect(analysis.corners[0].reference).toMatchObject({ name: 'Dee', sameSession: false });
    // T2: 5 km/h quicker in the middle, 5 km/h slower out, 0.2 s lost after the slowest point.
    expect(analysis.habits[0]).toMatchObject({ turnLabel: 'T2', half: 'out', rule: 'inFastOutSlow', confidence: 0.8,
      line: 'Give up 5 km/h in the middle of T2 for a faster exit' });
  });

  it('tells braking where the class lifts, a dragged brake, an early apex, lifting where it stays flat, gear and a slow way to full throttle', () => {
    const lift = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, peakBrake: 0.4 } : {})),
      [driver('Bob', 4, turn => (turn === 0 ? { brakeM: null, peakBrake: 0 } : {}))]));
    expect(lift.habits.map(habit => habit.line)).toEqual(["Lift, don't brake, into T1"]);
    // Braking 0.5 s longer at 60 % where the class brakes at 90 %: a dragged brake, not only a slower slowest point.
    const drag = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, min: 85, peakBrake: 0.6, brakeSec: 1.5 } : {})), [driver('Bob', 4)]));
    expect(drag.habits.map(habit => habit.line)).toEqual(['Brake harder, then release sooner into T1']);
    // Off both pedals 0.4 s longer than the class between the braking and the throttle, ahead of a slower slowest point.
    const coast = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, min: 85, coast: 0.6 } : {})), [driver('Bob', 4, () => ({ coast: 0.2 }))]));
    expect(coast.habits.map(habit => habit.line)).toEqual(["Don't coast into T1: off the brake, onto the throttle"]);
    const harder = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, min: 85, brakeSec: 1.5 } : {})), [driver('Bob', 4)]));
    expect(harder.habits.map(habit => habit.line)).toEqual(['Carry 5 km/h more through T1']);
    const flat = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { fromApex: 2.2, partThrottle: 0.7 } : {})),
      [driver('Bob', 4, turn => (turn === 0 ? { partThrottle: 0 } : {}))]));
    expect(flat.habits.map(habit => habit.line)).toEqual(['Stay flat through T1']);
    const apex = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { fromApex: 2.2, minM: 790 } : {})), [driver('Bob', 4)]));
    expect(apex.habits.map(habit => habit.line)).toEqual(['Turn in later: your slowest point in T1 is 10 m early']);
    const gear = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { fromApex: 2.2, gear: 2 } : {})), [driver('Bob', 4)]));
    expect(gear.habits.map(habit => habit.line)).toEqual(['Try gear 3 through T1']);
    // Another car's gearbox: its gear numbers say nothing about this car's.
    const otherCar = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { fromApex: 2.2, gear: 2 } : {})), [{ ...driver('Bob', 4), car: 'Car B' }]));
    expect(otherCar.habits).toEqual([]);
    expect(otherCar.unexplained.map(habit => habit.turnLabel)).toEqual(['T1']);
    const throttle = analyzeCorners(input(driver('Ann', 4, turn => (turn === 0 ? { fromApex: 2.2, partThrottle: 1.2 } : {})), [driver('Bob', 4)]));
    expect(throttle.habits.map(habit => habit.line)).toEqual(['Get to full throttle sooner out of T1']);
  });

  it('tells the car apart: a loss the quickest driver in the same car shares is the car, never a habit', () => {
    const ann = driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, brakeM: 690 } : {}));
    const bob = { ...driver('Bob', 4, turn => (turn === 1 ? { toApex: 1.8 } : {})), car: 'Car B' };
    // Cy, in Ann's car, brakes where she does into T1 and is only quicker into T2: T1 is the car.
    const carOnly = analyzeCorners(input(ann, [bob, driver('Cy', 4, turn => (turn === 0 ? { toApex: 2.2, brakeM: 690 } : { toApex: 1.7 }))]));
    expect(carOnly.sameCarReference).toMatchObject({ name: 'Cy' });
    expect(carOnly.habits).toEqual([]);
    expect(carOnly.carDifferences.map(habit => [habit.turnLabel, habit.rule, habit.sameCarLossSec])).toEqual([['T1', 'brakeEarly', 0]]);
    // Cy brakes later into T1 too: the habit stands, with what the same car gains there.
    const driving = analyzeCorners(input(ann, [bob, driver('Cy', 4, turn => (turn === 1 ? { toApex: 1.9 } : {}))]));
    expect(driving.habits.map(habit => habit.line)).toEqual(['Brake 10 m later into T1']);
    expect(driving.habits[0].sameCarLossSec).toBeCloseTo(0.2);
    expect(driving.carDifferences).toEqual([]);
    // A same-car driver gaining a quarter of what Bob gains shows nothing about the car: no check, the habit stands.
    const weak = analyzeCorners(input(ann, [bob, driver('Cy', 4, turn => (turn === 0 ? { toApex: 2.2, brakeM: 690 } : { toApex: 1.9 }))]));
    expect(weak.sameCarReference).toBeNull();
    expect(weak.habits.map(habit => habit.line)).toEqual(['Brake 10 m later into T1']);
  });

  it('lists a loss no rule explains apart, and ranks the habits by priority', () => {
    const own = driver('Ann', 4, () => ({ toApex: 2.1 }));
    const analysis = analyzeCorners(input(own, [driver('Bob', 4)]));
    expect(analysis.habits).toEqual([]);
    expect(analysis.unexplained.map(habit => habit.line)).toEqual([
      'Losing time into T1: no clear cause', 'Losing time into T2: no clear cause']);
    // Two turns of six corners each braking early: only the top MAX_HABITS.
    const many: CornerAnalysisInput = {
      ...input(driver('Ann', 4, () => ({ brakeM: null })), []),
      corners: [0, 1, 2, 3, 4, 5].map(id => ({ id, label: `SQ${id + 1}`, name: `T${id + 1}`, turnIds: [id] })),
      turns: [0, 1, 2, 3, 4, 5].map(id => ({ id, label: `T${id + 1}` })),
    };
    const early = (id: number, lapNumber: number, toApex: number) => pass(id, lapNumber, { brakeM: 690 + id * 1000, toApex });
    many.driver.laps = [2, 3, 4, 5].map((lapNumber, k) => ({ lapOrdinal: k + 1, passes: [0, 1, 2, 3, 4, 5].map(id => early(id, lapNumber, 2 + 0.05 * (id + 1))) }));
    many.others = [driver('Bob', 4)];
    many.others[0].laps = [2, 3, 4].map((lapNumber, k) => ({ lapOrdinal: k + 1, passes: [0, 1, 2, 3, 4, 5].map(id => pass(id, lapNumber)) }));
    const top = analyzeCorners(many).habits.slice(0, MAX_HABITS);
    expect(top.map(habit => habit.turnLabel)).toEqual(['T6', 'T5', 'T4']);
  });

  it("finds the laps clearly worse than the driver's own usual, with their cause", () => {
    const own = driver('Ann', 6, (turn, lap) => {
      if (turn === 0 && lap === 1) return { toApex: 2.5, abs: 0.6 };
      if (turn === 0 && lap === 3) return { toApex: 2.4, aheadGap: 0.4 };
      if (turn === 1 && lap === 4) return { toApex: 2.3, brakeM: 1680 };
      if (turn === 1 && lap === 5) return { fromApex: 2.3 };
      return {};
    });
    const analysis = analyzeCorners(input(own, []));
    expect(analysis.corners[0].reference).toBeNull();
    expect(analysis.mistakes.map(mistake => [mistake.lapOrdinal, mistake.turnLabel, mistake.cause])).toEqual([
      [2, 'T1', 'lockup'], [4, 'T1', 'traffic'], [5, 'T2', 'brakeEarly'], [6, 'T2', null]]);
    expect(analysis.mistakes[0].line).toBe('T1 +0.50 s: a lockup (ABS)');
  });
});
