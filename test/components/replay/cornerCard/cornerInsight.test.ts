import { describe, expect, it } from 'vitest';
import type { CornerPass, CornerPassLap } from '../../../../shared/types/corners/cornerPasses.js';
import {
  cornerInsightAt, currentPass, indexCornerInsight, lapClockToReplay, lapCounts, lapInsightAt, type BuiltCornerPasses,
} from '../../../../src/components/replay/cornerCard/cornerInsight.js';

// Turn 1 from 100 to 300 m, turn 2 from 300 to 600 m; each lap 100 s, the car in T1 from 10 s into the lap to 14 s.
const TURNS = [
  { id: 1, label: 'T1', title: 'Turn 1', apexM: 200, startM: 100, endM: 300 },
  { id: 2, label: 'T2', title: 'Turn 2', apexM: 450, startM: 300, endM: 600 },
];
function pass(slot: number, lapNumber: number, segment: number, timeSec: number, extra: Partial<CornerPass> = {}): CornerPass {
  const entrySec = lapNumber * 100 + (segment === 1 ? 10 : 14);
  return {
    slot, lapNumber, segment, entrySec, minSpeedSec: entrySec + timeSec / 2, exitSec: entrySec + timeSec,
    entrySpeedKmh: 250, minSpeedKmh: 100, exitSpeedKmh: 180,
    minSpeedM: segment === 1 ? 200 : 450, brakeM: segment === 1 ? 150 : 350, turnInM: segment === 1 ? 170 : 380, throttleM: segment === 1 ? 220 : 480,
    aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null, ...extra,
  };
}
function lap(slot: number, lapNumber: number, extra: Partial<CornerPassLap> = {}): CornerPassLap {
  return { slot, lapNumber, startSec: lapNumber * 100, endSec: lapNumber * 100 + 100, isValid: true, isPitStop: false, isOutLap: false, wet: false, ...extra };
}
function built(passes: CornerPass[], laps: CornerPassLap[], contacts: BuiltCornerPasses['contacts'] = []): BuiltCornerPasses {
  return {
    available: true, layoutKey: 'test', startStationM: 0, trackLengthM: 1000, turns: TURNS,
    cars: [{ slot: 1, name: 'Own', carClass: 'GT3', carNumber: '4' }, { slot: 2, name: 'Rival', carClass: 'GT3', carNumber: '7' },
      { slot: 3, name: 'Proto', carClass: 'Hyper', carNumber: '50' }],
    passes, laps, contacts,
  };
}

/** Own car: laps 1-6 through T1 (lap 1 the start, lap 3 a pit in-lap), rival laps 2-4, a hypercar faster than both. */
function race() {
  const times: Record<number, number> = { 1: 6, 2: 4.2, 3: 5, 4: 4.0, 5: 4.4, 6: 4.1 };
  const passes = Object.entries(times).map(([n, t]) => pass(1, Number(n), 1, t));
  passes.push(pass(1, 5, 2, 3), ...[2, 3, 4].map(n => pass(2, n, 1, 3.9 + n / 100)), ...[2, 3, 4].map(n => pass(3, n, 1, 3)));
  const laps = [1, 2, 3, 4, 5, 6].map(n => lap(1, n, n === 3 ? { isPitStop: true } : {}))
    .concat([2, 3, 4].map(n => lap(2, n)), [2, 3, 4].map(n => lap(3, n)));
  return indexCornerInsight(built(passes, laps, [{ slot: 1, timeSec: 412 }]));
}

describe('lapCounts', () => {
  it('counts racing laps after the first, traffic laps included', () => {
    expect(lapCounts(lap(1, 2))).toBe(true);
    expect(lapCounts(lap(1, 2, { nonRepresentativeReason: 'traffic' }))).toBe(true);
    for (const left of [lap(1, 1), lap(1, 2, { isValid: false }), lap(1, 2, { isPitStop: true }), lap(1, 2, { isOutLap: true }),
      lap(1, 2, { nonRepresentativeReason: 'contact' }), lap(1, 2, { nonRepresentativeReason: 'offPace' }), undefined]) {
      expect(lapCounts(left)).toBe(false);
    }
  });
});

describe('cornerInsightAt', () => {
  it('shows the whole pass from the turn\'s entry', () => {
    const index = race();
    // Lap 4, T1: entry 410 s, exit 414 s, where T2 starts.
    const out = cornerInsightAt(index, 1, 410);
    expect(out?.turn.label).toBe('T1');
    // The time in the corner runs with the replay: 1.5 s in at 411.5 s.
    expect(out?.elapsedSec).toBe(0);
    expect(cornerInsightAt(index, 1, 411.5)?.elapsedSec).toBeCloseTo(1.5);
    expect(out?.lapNumber).toBe(4);
    expect(out?.minSpeed).toEqual({ value: 100, delta: 0 });
    // Counted: laps 2, 4, 5, 6 (4.2, 4.0, 4.4, 4.1): usual 4.15.
    expect(out?.usualSec).toBeCloseTo(4.15);
    expect(out?.time?.value).toBeCloseTo(4);
    expect(out?.time?.delta).toBeCloseTo(-0.15);
    expect(out?.best).toEqual({ timeSec: 4, lapNumber: 4 });
  });

  it('measures against the compare lap\'s pass through the same turn, on the same layout only', () => {
    const index = race();
    // Own lap 4 through T1: 4.0 s, 2.0 in and 2.0 out. The compare lap: the rival's lap 3, 3.93 s, braking 6 m later.
    const other = indexCornerInsight(built([pass(2, 3, 1, 3.93, { brakeM: 156, minSpeedKmh: 103 })], []));
    const versus = cornerInsightAt(index, 1, 411, { index: other, slot: 2, lapNumber: 3 })?.versus;
    expect(versus).toMatchObject({ carNumber: '7', lapNumber: 3, brakeM: 6, minSpeedKmh: 3, throttleM: 0, minSpeedDelta: -3 });
    expect(versus?.timeDelta).toBeCloseTo(0.07);
    expect(versus?.entrySec).toBeCloseTo(0.035);
    expect(versus?.exitSec).toBeCloseTo(0.035);
    // No pass of the compare lap through the turn, or another layout: no compare.
    expect(cornerInsightAt(index, 1, 411, { index: other, slot: 2, lapNumber: 4 })?.versus).toBeNull();
    const elsewhere = indexCornerInsight({ ...built([pass(2, 3, 1, 3.93)], []), layoutKey: 'other' });
    expect(cornerInsightAt(index, 1, 411, { index: elsewhere, slot: 2, lapNumber: 3 })?.versus).toBeNull();
    expect(cornerInsightAt(index, 1, 411)?.versus).toBeNull();
  });

  it('marks the incident and the pit lane', () => {
    const index = race();
    const lap4 = cornerInsightAt(index, 1, 414);
    expect(lap4?.marks).toMatchObject({ incident: true, pitLane: false });
    const lap3 = cornerInsightAt(index, 1, 314);
    expect(lap3).toMatchObject({ counts: false, marks: { pitLane: true, incident: false } });
  });

  it('gives the spread, and the gain to the class\'s fastest usual (the class only), the turns ranked by gain', () => {
    const lap4 = cornerInsightAt(race(), 1, 414);
    // Counted T1 times 4.2, 4.0, 4.4, 4.1: standard deviation 0.148; the rival's usual 3.93 (3.92, 3.93, 3.94); the
    // faster hypercar is another class.
    expect(lap4?.spreadSec).toBeCloseTo(0.1479, 3);
    expect(lap4?.gain).toMatchObject({ carNumber: '7', rank: 1, of: 1 });
    expect(lap4?.gain?.deltaSec).toBeCloseTo(0.22);
    // Split at the slowest point (half way through each pass): 2.075 against 1.965 on the way in, and the same out.
    expect(lap4?.gain?.entrySec).toBeCloseTo(0.11);
    expect(lap4?.gain?.exitSec).toBeCloseTo(0.11);
    expect(lap4?.gain).toMatchObject({ brakeM: 0, minSpeedKmh: 0, throttleM: 0 });
    // T2 has no usual: no gain.
    expect(cornerInsightAt(race(), 1, 520)?.gain).toBeNull();
  });

  it('has no usual with fewer than three counted passes', () => {
    const index = race();
    // T2 has one pass (lap 5).
    expect(cornerInsightAt(index, 1, 520)).toMatchObject({ usualSec: null, best: null, gain: null, time: { value: 3, delta: null } });
  });

  it('strips the turn over the session: the current lap outlined, a divider after the pit stop', () => {
    const strip = cornerInsightAt(race(), 1, 414)?.strip ?? [];
    expect(strip.map(cell => cell.lapNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(strip.map(cell => cell.current)).toEqual([false, false, false, true, false, false]);
    expect(strip.map(cell => cell.pitAfter)).toEqual([false, false, true, false, false, false]);
    expect(strip.map(cell => cell.counts)).toEqual([false, true, false, true, true, true]);
    expect(strip[0].marks.start).toBe(true);
    expect(strip[3].deltaSec).toBeCloseTo(-0.15);
  });

  it('keeps wet and dry apart', () => {
    const passes = [2, 3, 4, 5].map(n => pass(1, n, 1, n < 5 ? 4 : 6));
    const laps = [2, 3, 4].map(n => lap(1, n)).concat(lap(1, 5, { wet: true }));
    const wet = cornerInsightAt(indexCornerInsight(built(passes, laps)), 1, 516);
    expect(wet).toMatchObject({ usualSec: null, marks: { wet: true } });
    expect(wet?.strip.map(cell => cell.deltaSec)).toEqual([0, 0, 0, null]);
  });

  it('shows nothing before the car reaches its first turn', () => {
    expect(cornerInsightAt(race(), 1, 100)).toBeNull();
    expect(cornerInsightAt(race(), 9, 500)).toBeNull();
  });
});

describe('currentPass and lapClockToReplay', () => {
  it('finds the last pass entered, and puts a lap clock on the replay clock', () => {
    const index = race();
    expect(currentPass(index, 1, 413)?.lapNumber).toBe(4);
    expect(currentPass(index, 1, 499)?.lapNumber).toBe(4);
    expect(currentPass(index, 1, 515)).toMatchObject({ lapNumber: 5, segment: 2 });
    expect(lapClockToReplay(index, 1, 4, 12.5)).toBe(412.5);
    expect(lapClockToReplay(index, 1, 9, 1)).toBeNull();
  });

  it('keeps a lap view on its own lap: a sample short of the line shows the lap\'s first turn', () => {
    const index = race();
    // Lap 5's first pass (T1) enters at 510 s; at 505 s the car is still in lap 4's last pass.
    expect(currentPass(index, 1, 505)?.lapNumber).toBe(4);
    expect(lapInsightAt(index, 1, 5, 505)).toMatchObject({ lapNumber: 5, turn: { id: 1 } });
    expect(lapInsightAt(index, 1, 5, 515)).toMatchObject({ lapNumber: 5, turn: { id: 2 } });
  });
});
