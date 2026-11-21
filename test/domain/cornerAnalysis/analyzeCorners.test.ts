import { describe, expect, it } from 'vitest';
import { analyzeCorners, compareLapTurn, MAX_HABITS } from '../../../shared/domain/cornerAnalysis/analyzeCorners.js';
import { isExitOnly } from '../../../shared/domain/cornerAnalysis/habitRules.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';
import type { AnalysisDriver, CornerAnalysisInput } from '../../../shared/types/corners/cornerAnalysis.js';

interface Drive {
  toApex?: number; fromApex?: number; entry?: number; min?: number; exit?: number; minM?: number; brakeM?: number | null;
  peakBrake?: number | null; brakeSec?: number; partThrottle?: number | null; gear?: number | null; abs?: number; coast?: number; aheadGap?: number | null;
  /** The line: the arc's radius (positive turning left), the turn-in point and the road position (m, positive left). */
  arc?: number | null; turnInM?: number | null; apexLat?: number | null;
}

/** A pass through turn `segment`: 2 s to the slowest point at 800 m and 2 s out, braking at 700 m, no line measured, by default. */
function pass(segment: number, lapNumber: number, drive: Drive = {}): CornerPass {
  const entrySec = lapNumber * 100 + segment * 10;
  const toApex = drive.toApex ?? 2, fromApex = drive.fromApex ?? 2;
  return {
    slot: 0, lapNumber, segment, entrySec, minSpeedSec: entrySec + toApex, exitSec: entrySec + toApex + fromApex,
    entrySpeedKmh: drive.entry ?? 200, minSpeedKmh: drive.min ?? 90, exitSpeedKmh: drive.exit ?? 150,
    minSpeedM: drive.minM ?? 800 + segment * 1000, brakeM: drive.brakeM === undefined ? 700 + segment * 1000 : drive.brakeM,
    turnInM: drive.turnInM ?? null, throttleM: null, minSpeedGear: drive.gear === undefined ? 3 : drive.gear,
    peakBrake: drive.peakBrake === undefined ? 0.9 : drive.peakBrake,
    brakeSec: drive.brakeSec ?? 1, partThrottleSec: drive.partThrottle === undefined ? 0.5 : drive.partThrottle, absSec: drive.abs ?? 0,
    coastSec: drive.coast ?? 0,
    arcRadiusM: drive.arc ?? null, apexLateralM: drive.apexLat ?? null,
    aheadSlot: null, aheadGapSec: drive.aheadGap ?? null,
  };
}

/** A driver with `laps` counted laps through turns 0 and 1, each lap's drive per turn from `drive`, and a true pace. */
function driver(name: string, laps: number, drive: (turn: number, lap: number) => Drive = () => ({}), paceSec: number | null = 100): AnalysisDriver {
  return {
    sessionId: 's1', driverOrdinal: name.length, name, car: 'Car A', paceSec,
    laps: Array.from({ length: laps }, (_, k) => ({ lapOrdinal: k + 1, passes: [0, 1].map(turn => pass(turn, k + 2, drive(turn, k))) })),
  };
}

const input = (own: AnalysisDriver, others: AnalysisDriver[]): CornerAnalysisInput => ({
  lengthM: 5000, minReferenceLaps: 3, driver: own, others,
  corners: [{ id: 0, label: 'SQ1', name: 'T1–T2', turnIds: [0, 1] }],
  turns: [{ id: 0, label: 'T1' }, { id: 1, label: 'T2' }],
});

/** The driver's T1 driven one way on every lap, against Bob's. */
const atT1 = (own: Drive, bob: Drive = {}, bobCar = 'Car A') => analyzeCorners(input(
  driver('Ann', 4, turn => (turn === 0 ? own : {})), [{ ...driver('Bob', 4, turn => (turn === 0 ? bob : {})), car: bobCar }]));

describe('analyzeCorners', () => {
  it('names an early brake point into the slowest point as the habit, against the target', () => {
    // Braking 10 m earlier into T1 and 0.1 s slower to its slowest point, on every lap.
    const own = driver('Ann', 5, turn => (turn === 0 ? { brakeM: 690, toApex: 2.1 } : {}));
    const analysis = analyzeCorners(input(own, [driver('Bob', 4), driver('Cy', 4, () => ({ toApex: 2.2 }), 101)]));
    expect(analysis.target).toMatchObject({ name: 'Bob', paceSec: 100 });
    expect(analysis.corners[0]).toMatchObject({ label: 'SQ1', reference: { name: 'Bob', laps: 4 } });
    expect(analysis.corners[0].lossSec).toBeCloseTo(0.1);
    expect(analysis.habits).toHaveLength(1);
    expect(analysis.habits[0]).toMatchObject({
      turnLabel: 'T1', half: 'in', rule: 'brakeEarly', gap: 10, repeatability: 1, line: 'Brake 10 m later into T1',
      // The brake point is its own action, and it is not said again as a cause.
      action: { type: 'brakeLater', gap: 10, line: 'Brake 10 m later' }, causes: [],
      speeds: { minKmh: 90, targetMinKmh: 90, exitKmh: 150, targetExitKmh: 150 }, kind: null, arc: null,
    });
    expect(analysis.habits[0].lossSec).toBeCloseTo(0.1);
    expect(analysis.mistakes).toEqual([]);
    // Every measured turn carries its gaps, whether or not a rule holds there: a series over sessions has no holes.
    expect(analysis.measures).toEqual([
      { turnId: 0, rules: { brakesWhereLift: 0, overSlowing: 0, brakeEarly: 10, exitSpeed: 0 },
        actions: { lift: 0, brakeLater: 10, brakeShorter: 0, turnInEarlier: null, reachInside: null } },
      { turnId: 1, rules: { brakesWhereLift: 0, overSlowing: 0, brakeEarly: 0, exitSpeed: 0 },
        actions: { lift: 0, brakeLater: 0, brakeShorter: 0, turnInEarlier: null, reachInside: null } },
    ]);
  });

  it('ignores a stopped pass while keeping the other measured turn', () => {
    const own = driver('Ann', 1, turn => (turn === 0 ? { toApex: 35, min: 0, aheadGap: 0.027 } : {}));
    const analysis = analyzeCorners(input(own, [driver('Bob', 4)]));
    expect(analysis.corners[0]).toMatchObject({ usualSec: null, usualLapOrdinal: null, lossSec: null });
    expect(analysis.measures.map(measure => measure.turnId)).toEqual([1]);
    expect(analysis.habits).toEqual([]);
    expect(analysis.unexplained).toEqual([]);
    expect(analysis.mistakes).toEqual([]);
  });

  it('uses the moving passes for both drivers and excludes a stop from the whole corner time', () => {
    const own = driver('Ann', 2, (turn, lap) => (turn === 0 && lap === 1 ? { toApex: 20, min: 0.1 } : {}));
    const target = driver('Bob', 4, (turn, lap) => (turn === 1 && lap === 0 ? { toApex: 20, min: 0 } : {}));
    const analysis = analyzeCorners(input(own, [target]));
    expect(analysis.corners[0]).toMatchObject({ usualSec: 8, usualLapOrdinal: 1, lossSec: 0, reference: { usualSec: 8, usualLapOrdinal: 2 } });
    expect(analysis.measures.map(measure => measure.rules.overSlowing)).toEqual([0, 0]);
    expect(analysis.habits).toEqual([]);
    expect(analysis.mistakes).toEqual([]);
  });

  it('reads a brake point up to 60 m before the target as early braking, and none further apart', () => {
    const early = (m: number) => atT1({ brakeM: 700 - m, toApex: 2.2 });
    expect(early(55).habits[0]).toMatchObject({ rule: 'brakeEarly', gap: 55, line: 'Brake 55 m later into T1' });
    expect(early(65).habits).toEqual([]);
    expect(early(65).unexplained[0]).toMatchObject({ turnLabel: 'T1', half: 'in' });
    // Usual inside 60 m (54 m) with individual laps past 60 m still counts those laps toward repeatability.
    const mixed = analyzeCorners(input(
      driver('Ann', 5, (turn, lap) => (turn === 0 ? { brakeM: 700 - [0, 50, 54, 63, 66][lap], toApex: 2.2 } : {})),
      [driver('Bob', 4)],
    ));
    expect(mixed.habits[0]).toMatchObject({ rule: 'brakeEarly', gap: 54, repeatability: 0.8 });
  });

  it("names each side's lap closest to the usual through the corner, the one a view opens", () => {
    // Bob's laps through T1: 2.0, 2.3, 2.1 s to the slowest point; his usual (2.1 + 2.0) is his third lap.
    const bob = driver('Bob', 3, (turn, lap) => (turn === 0 ? { toApex: [2, 2.3, 2.1][lap] } : {}));
    const own = driver('Ann', 3, (turn, lap) => (turn === 0 ? { toApex: [2.2, 2.4, 2.6][lap] } : {}));
    const [corner] = analyzeCorners(input(own, [bob])).corners;
    expect(corner.usualLapOrdinal).toBe(2);
    expect(corner.reference).toMatchObject({ name: 'Bob', car: 'Car A', usualLapOrdinal: 3 });
  });

  it('takes the best true pace with a usual through the corners as the target, whoever is quickest through one', () => {
    const own = driver('Ann', 5, turn => (turn === 1 ? { fromApex: 2.2, min: 95, exit: 145 } : {}));
    // Quicker out of the corner on a worse pace, quicker still without a pace, and the best pace on too few laps.
    const quickHere = driver('Bob', 4, () => ({ fromApex: 1.9 }), 101);
    const noPace = driver('Eve', 4, () => ({ fromApex: 1.8 }), null);
    const fewLaps = driver('Fay', 2, () => ({}), 90);
    const analysis = analyzeCorners(input(own, [quickHere, noPace, fewLaps, driver('Dee', 4, () => ({}), 99)]));
    expect(analysis.target).toMatchObject({ name: 'Dee', paceSec: 99 });
    expect(analysis.corners[0].reference).toMatchObject({ name: 'Dee' });
    // T2: 5 km/h quicker in the middle, 5 km/h slower out, 0.2 s lost after the slowest point: slower at the exit only.
    const [habit] = analysis.habits;
    expect(habit).toMatchObject({ turnLabel: 'T2', half: 'out', rule: 'exitSpeed', gap: 5, confidence: 1, line: 'Exit T2 5 km/h faster', kind: 'exitOnly', action: null });
    expect(habit.detail).toBe('Exit 145 km/h, target 150 km/h · apex 95 km/h, target 90 km/h · no action is measured for a slower exit alone');
    expect(isExitOnly(habit)).toBe(true);
    // Tied on pace, the lower driver ordinal of the session: the choice never depends on the order given.
    const tied = [driver('Bobby', 4), driver('Cy', 4)];
    expect([tied, tied.toReversed()].map(others => analyzeCorners(input(own, others)).corners[0].reference?.name)).toEqual(['Cy', 'Cy']);
    // The driver being quicker than the target changes nothing: the cost is negative.
    const quickOwn = analyzeCorners(input(driver('Ann', 5, () => ({ toApex: 1.9 })), [driver('Dee', 4)]));
    expect(quickOwn.corners[0].reference).toMatchObject({ name: 'Dee' });
    expect(quickOwn.corners[0].lossSec).toBeCloseTo(-0.2);
    // No candidate: no target.
    expect(analyzeCorners(input(own, [])).target).toBeNull();
  });

  it('says the usual gap in the headline: the number its detail and the series over sessions show', () => {
    const slowTo = (mins: number[]) => analyzeCorners(input(
      driver('Ann', mins.length, (turn, lap) => (turn === 0 ? { min: mins[lap], toApex: 2.1 } : {})), [driver('Bob', 4)]));
    // Under Bob's 90 km/h on 4 laps of 5 (by 6, 6, 2 and 2); the usual is 88.
    const usual = slowTo([84, 84, 88, 88, 90]);
    expect(usual.habits[0]).toMatchObject({
      rule: 'overSlowing', gap: 2, repeatability: 0.8, line: 'Carry 2 km/h more through T1', speeds: { minKmh: 88, targetMinKmh: 90 },
    });
    expect(usual.measures[0].rules.overSlowing).toBe(2);
    // A short session where half the laps are under and the usual is level (89): no habit is named, the loss stays unexplained.
    const short = slowTo([84, 88, 90, 92]);
    expect(short.habits).toEqual([]);
    expect(short.unexplained[0]).toMatchObject({ rule: null, turnLabel: 'T1', line: 'Losing time into T1: no clear cause', speeds: { minKmh: 89, targetMinKmh: 90 } });
  });

  it('headlines braking where the target lifts, with the lift as its action', () => {
    const lift = atT1({ toApex: 2.2, peakBrake: 0.4 }, { brakeM: null, peakBrake: 0 });
    expect(lift.habits).toHaveLength(1);
    expect(lift.habits[0]).toMatchObject({ rule: 'brakesWhereLift', gap: 40, line: "Lift, don't brake, into T1", action: { type: 'lift', line: 'Lift instead of braking' } });
    expect(lift.habits[0].detail).toBe('You brake up to 40 %, target 0 % · apex 90 km/h, target 90 km/h');
  });

  it('names the kind of loss under a lower minimum speed and offers the largest action of that kind', () => {
    // 5 km/h slower on an 80 m arc where Bob's is 89.7 m at the same sideways g: all of the gap is the arc.
    // Bob turns in 6 m earlier (2 steps), and is 2 m closer to the inside at the apex (5 steps): the apex is the try.
    const tighter = atT1({ toApex: 2.2, min: 85, arc: 80, turnInM: 760, apexLat: 1 }, { arc: 89.7, turnInM: 754, apexLat: 3 });
    expect(tighter.habits[0]).toMatchObject({
      rule: 'overSlowing', gap: 5, line: 'Carry 5 km/h more through T1', kind: 'tighterArc', arc: { radiusM: 80, targetRadiusM: 89.7 },
      action: { type: 'reachInside', gap: 2, line: 'Get much closer to the inside at the apex' },
      // What else can be tried, for a try that gives no gain.
      otherActions: [{ type: 'turnInEarlier', gap: 6, line: 'Turn in 6 m earlier' }],
      detail: 'Apex 85 km/h, target 90 km/h · tighter arc (80 m radius against 90 m)',
    });
    expect(tighter.measures[0].actions).toMatchObject({ turnInEarlier: 6, reachInside: 2 });
    // Turning right, the inside is the other way: the same road positions read mirrored.
    const right = atT1({ toApex: 2.2, min: 85, arc: -80, apexLat: -1 }, { arc: -89.7, apexLat: -3 });
    expect(right.habits[0]).toMatchObject({ kind: 'tighterArc', action: { type: 'reachInside', gap: 2 } });
    // Braking early on a tighter arc offers brakeLater too, competing by gap in steps alongside the line cues.
    const tighterBrake = atT1({ toApex: 2.2, min: 85, arc: 80, brakeM: 682, apexLat: 2 }, { arc: 89.7, apexLat: 3 });
    expect(tighterBrake.habits[0]).toMatchObject({
      kind: 'tighterArc',
      action: { type: 'brakeLater', gap: 18, line: 'Brake 18 m later' },
      otherActions: [{ type: 'reachInside', gap: 1, line: 'Get closer to the inside at the apex' }],
      causes: [],
    });

    // The same arc as Bob, 5 km/h slower: less grip used. Braking 8 m earlier (2.7 steps) and 0.5 s longer (3.3 steps).
    const grip = atT1({ toApex: 2.2, min: 85, arc: 89.7, brakeM: 692, brakeSec: 1.5 }, { arc: 89.7 });
    expect(grip.habits[0]).toMatchObject({
      rule: 'overSlowing', kind: 'lessGrip', action: { type: 'brakeShorter', line: 'Come off the brake 0.5 s sooner' },
      otherActions: [{ type: 'brakeLater', gap: 8, line: 'Brake 8 m later' }],
      // What the action says is not said again; the brake point is.
      causes: [{ type: 'brakePoint', gap: 8, line: 'braking 8 m earlier' }],
    });
    expect(grip.habits[0].detail).toContain('same arc, less grip used (0.63 g against 0.71 g)');

    // Half the gap in the arc, half in the grip: both kinds' actions are offered.
    const both = atT1({ toApex: 2.2, min: 85, arc: 84.7, brakeSec: 1.5, apexLat: 1 }, { arc: 89.7, apexLat: 1.4 });
    expect(both.habits[0]).toMatchObject({ kind: 'arcAndGrip', action: { type: 'brakeShorter' } });
    expect(both.habits[0].detail).toContain('tighter arc and less grip used');

    // No arc measured: the kind is unknown, the pedal actions still stand.
    const unknown = atT1({ toApex: 2.2, min: 85, brakeSec: 1.5 });
    expect(unknown.habits[0]).toMatchObject({ rule: 'overSlowing', kind: null, arc: null, action: { type: 'brakeShorter' }, detail: 'Apex 85 km/h, target 90 km/h' });
    // Arcs on opposite sides compare nothing.
    expect(atT1({ toApex: 2.2, min: 85, arc: 80 }, { arc: -89.7 }).habits[0]).toMatchObject({ kind: null, arc: null });
    // Nothing worth trying: no action, and the row still carries the speed to hit.
    expect(atT1({ toApex: 2.2, min: 85 }).habits[0]).toMatchObject({ rule: 'overSlowing', action: null, otherActions: [], causes: [] });
  });

  it('says what else was measured under the headline, never as a headline of its own', () => {
    // Slower out of T1 with a lower minimum: the exit speed headlines, the pedal timing and the gear are its causes.
    const out = atT1({ fromApex: 2.2, min: 87, exit: 145, partThrottle: 1.2, gear: 2 });
    expect(out.habits).toHaveLength(1);
    expect(out.habits[0]).toMatchObject({ half: 'out', rule: 'exitSpeed', line: 'Exit T1 5 km/h faster' });
    expect(out.habits[0].causes.map(cause => cause.line)).toEqual(['0.7 s more part throttle', 'gear 2 against 3']);
    expect(isExitOnly(out.habits[0])).toBe(false);
    // Another car's gearbox: its gear numbers say nothing about this car's.
    const otherCar = atT1({ fromApex: 2.2, min: 87, exit: 145, partThrottle: 1.2, gear: 2 }, {}, 'Car B');
    expect(otherCar.habits[0].causes.map(cause => cause.line)).toEqual(['0.7 s more part throttle']);
    // Into the turn: the entry speed, the brake pedal and the coasting.
    const into = atT1({ toApex: 2.2, min: 85, entry: 195, peakBrake: 0.6, coast: 0.6 }, { coast: 0.2 });
    expect(into.habits[0].causes.map(cause => cause.line)).toEqual(['arriving 5 km/h slower (lost before this corner)', 'peak brake 30 points softer', '0.4 s more coasting']);
    // Braking 10 m earlier than the target already lowers the speed at the corner's start: only the brake point is said.
    const early = atT1({ toApex: 2.2, min: 85, entry: 195, brakeM: 690 });
    expect(early.habits[0].causes.map(cause => cause.type)).not.toContain('entrySpeed');
    // A dragged brake, coasting or a slow way to full throttle alone name no habit: they failed the outcome check.
    for (const drive of [{ toApex: 2.2, peakBrake: 0.6, brakeSec: 1.5 }, { toApex: 2.2, coast: 0.6 }, { fromApex: 2.2, partThrottle: 1.2 }, { fromApex: 2.2, minM: 790 }]) {
      const analysis = atT1(drive);
      expect(analysis.habits).toEqual([]);
      expect(analysis.unexplained.map(habit => [habit.turnLabel, habit.action, habit.causes])).toEqual([['T1', null, []]]);
    }
  });

  it('tells the car apart: a loss the quickest driver in the same car shares is the car, never a habit', () => {
    const ann = driver('Ann', 4, turn => (turn === 0 ? { toApex: 2.2, brakeM: 690 } : {}));
    const bob = { ...driver('Bob', 4, turn => (turn === 1 ? { toApex: 1.8 } : {}), 99), car: 'Car B' };
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

describe('compareLapTurn', () => {
  it('says what one lap did differently where it loses time to the other, and nothing the other way', () => {
    // 10 m earlier on the brake and 0.1 s slower to the slowest point.
    const slow = pass(0, 2, { brakeM: 690, toApex: 2.1 }), quick = pass(0, 3);
    const comparison = compareLapTurn(slow, quick, 5000, true);
    expect(comparison).toMatchObject({ traffic: false, absMoreSec: null });
    // The brake point is the headline, so it is not listed again under it.
    expect(comparison?.differences).toEqual([{ half: 'in', lossSec: expect.closeTo(0.1) as unknown, rule: 'brakeEarly', gap: 10, kindLine: null, causes: [] }]);
    expect(compareLapTurn(quick, slow, 5000, true)?.differences).toEqual([]);
  });

  it('names the lower minimum speed first, with the kind of loss and the pedals under it', () => {
    const slow = pass(0, 2, { min: 86, toApex: 2.2, arc: 80, brakeM: 690, brakeSec: 1.4 });
    const [difference] = compareLapTurn(slow, pass(0, 3, { arc: 87 }), 5000, true)?.differences ?? [];
    expect(difference).toMatchObject({ half: 'in', rule: 'overSlowing', gap: 4, kindLine: 'tighter arc (80 m radius against 87 m)' });
    expect(difference.causes.map(cause => cause.line)).toEqual(['braking 10 m earlier', 'braking 0.4 s longer']);
  });

  it('compares the whole turn when the laps are slowest at different places', () => {
    const slow = pass(0, 2, { minM: 820, fromApex: 2.2, exit: 145 });
    expect(compareLapTurn(slow, pass(0, 3), 5000, true)?.differences).toMatchObject([{ half: 'whole', rule: 'exitSpeed', gap: 5, kindLine: null }]);
  });

  it('tells a loss nothing measured explains, and leaves out a loss too small to tell', () => {
    expect(compareLapTurn(pass(0, 2, { toApex: 2.1 }), pass(0, 3), 5000, true)?.differences).toMatchObject([{ half: 'in', rule: null, gap: null, causes: [] }]);
    expect(compareLapTurn(pass(0, 2, { toApex: 2.04, brakeM: 690 }), pass(0, 3), 5000, true)?.differences).toEqual([]);
  });

  it('flags a car close ahead or much longer ABS only on the lap that loses time there', () => {
    const slow = pass(0, 2, { toApex: 2.3, aheadGap: 0.5, abs: 0.5 }), quick = pass(0, 3, { aheadGap: 0.5 });
    expect(compareLapTurn(slow, quick, 5000, true)).toMatchObject({ traffic: true, absMoreSec: 0.5 });
    expect(compareLapTurn(quick, slow, 5000, true)).toMatchObject({ traffic: false, absMoreSec: null });
    // Longer ABS on a lap that only loses out of the turn explains nothing.
    expect(compareLapTurn(pass(0, 2, { fromApex: 2.3, abs: 0.5 }), pass(0, 3), 5000, true)).toMatchObject({ absMoreSec: null });
  });

  it('compares a gear only in the same car, and nothing against a stop', () => {
    const slow = pass(0, 2, { fromApex: 2.2, gear: 2 });
    expect(compareLapTurn(slow, pass(0, 3), 5000, true)?.differences[0].causes.map(cause => cause.line)).toEqual(['gear 2 against 3']);
    expect(compareLapTurn(slow, pass(0, 3), 5000, false)?.differences[0].causes).toEqual([]);
    expect(compareLapTurn(pass(0, 2, { min: 0 }), pass(0, 3), 5000, true)).toBeNull();
  });
});
