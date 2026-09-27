import { describe, it, expect } from 'vitest';
import { describeLapGaps, describeLapTraffic, describeTrafficSpell, NON_REPRESENTATIVE_LABELS } from '../../src/utils/lapTrafficText.js';
import type { LapTraffic, TrafficCar, TrafficSpell } from '../../shared/types/index.js';

const car = (name: string, carClass: string, sameClass = carClass === 'Hyper'): TrafficCar => ({ name, carClass, sameClass });

const traffic = (overrides: Partial<LapTraffic>): LapTraffic => ({
  ahead: null, behind: null, following: false, passed: [], passedBy: [], ...overrides,
});

describe('describeLapTraffic', () => {
  it('names a single car and counts several per class', () => {
    expect(describeLapTraffic(traffic({ passed: [car('Rui Paiva', 'GT3')] }))).toEqual(['Passed Rui Paiva (GT3)']);
    expect(describeLapTraffic(traffic({
      passed: [car('A', 'GT3'), car('B', 'GT3'), car('C', 'Hyper')],
      passedBy: [car('Vinicius Ares', 'Hyper')],
    }))).toEqual(['Passed 2 GT3, 1 Hyper', 'Passed by Vinicius Ares (Hyper)']);
  });

  it('describes following the car ahead with the gap at the start of the lap', () => {
    const ahead = { car: car('Vinicius Ares', 'Hyper'), gapSec: 0.44 };
    expect(describeLapTraffic(traffic({ ahead, following: true }))).toEqual(['Followed Vinicius Ares (Hyper) 0.44s']);
    expect(describeLapTraffic(traffic({ ahead }))).toEqual([]);
  });

  it('says nothing for a lap without traffic data', () => {
    expect(describeLapTraffic(undefined)).toEqual([]);
    expect(describeLapGaps(undefined)).toEqual([]);
  });
});

describe('describeLapGaps', () => {
  it('lists the cars ahead and behind on the road', () => {
    expect(describeLapGaps(traffic({
      ahead: { car: car('A', 'Hyper'), gapSec: 2.7 },
      behind: { car: car('B', 'GT3'), gapSec: 0.24 },
    }))).toEqual(['Ahead on the road: A (Hyper) 2.70s', 'Behind on the road: B (GT3) 0.24s']);
  });
});

describe('describeTrafficSpell', () => {
  const spell = (kind: TrafficSpell['kind'], direction: TrafficSpell['direction'], carClass?: string): TrafficSpell => ({
    carName: 'Vinicius Ares', carClass, kind, direction, startSec: 0, endSec: 3, startStationM: 0, endStationM: 100, closestGapSec: 0.4,
  });

  it('says what the other car was to the driver', () => {
    expect(describeTrafficSpell(spell('battle', 'ahead'))).toBe('Attacking Vinicius Ares');
    expect(describeTrafficSpell(spell('battle', 'behind'))).toBe('Defending from Vinicius Ares');
    expect(describeTrafficSpell(spell('lapping', 'ahead'))).toBe('Lapping Vinicius Ares');
    expect(describeTrafficSpell(spell('beingLapped', 'behind'))).toBe('Being lapped by Vinicius Ares');
    expect(describeTrafficSpell(spell('multiclass', 'ahead', 'GT3'))).toBe('Behind Vinicius Ares (GT3)');
    expect(describeTrafficSpell(spell('multiclass', 'ahead'))).toBe('Behind Vinicius Ares');
  });
});

describe('NON_REPRESENTATIVE_LABELS', () => {
  it('states the off-pace cutoff the parser uses', () => {
    expect(NON_REPRESENTATIVE_LABELS.offPace.title).toBe('More than 2% slower than your median lap');
    expect(NON_REPRESENTATIVE_LABELS.traffic.label).toBe('Traffic');
  });
});
