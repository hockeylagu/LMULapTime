import { describe, it, expect } from 'vitest';
import { describeLapTraffic, describeNonRepresentative, describeTrafficSpell, NON_REPRESENTATIVE_LABELS } from '../../src/utils/lapTrafficText.js';
import type { LapTraffic, TrafficCar, TrafficSpell } from '../../shared/types/index.js';

const car = (name: string, carClass: string, sameClass = carClass === 'Hyper'): TrafficCar => ({ name, carClass, sameClass });

const traffic = (overrides: Partial<LapTraffic>): LapTraffic => ({
  ahead: null, behind: null, following: false, passed: [], passedBy: [], ...overrides,
});

describe('describeLapTraffic', () => {
  it('says whether the driver was attacking, defending, following or in other classes, attacking first', () => {
    expect(describeLapTraffic(traffic({
      passed: [car('A', 'GT3'), car('B', 'GT3'), car('Rui Paiva', 'Hyper')],
      passedBy: [car('Vinicius Ares', 'Hyper'), car('C', 'LMP2'), car('D', 'LMP2')],
    }))).toEqual([
      'Attacking: passed Rui Paiva',
      'Defending: passed by Vinicius Ares',
      'Other classes: passed 2 GT3; passed by 2 LMP2',
    ]);
  });

  it('calls a car of the class close all lap attacking ahead and defending behind, another class ahead following', () => {
    const rival = { car: car('Vinicius Ares', 'Hyper'), gapSec: 0.44 };
    const gt3 = { car: car('Rui Paiva', 'GT3'), gapSec: 0.7 };
    expect(describeLapTraffic(traffic({ ahead: rival, following: true, behind: rival, pressured: true }))).toEqual([
      'Attacking: within 1 s of Vinicius Ares all lap',
      'Defending: Vinicius Ares within 1 s behind all lap',
    ]);
    expect(describeLapTraffic(traffic({ ahead: gt3, following: true, behind: gt3, pressured: true }))).toEqual([
      'Following: within 1 s of Rui Paiva (GT3) all lap',
      'Other classes: Rui Paiva (GT3) within 1 s behind all lap',
    ]);
    expect(describeLapTraffic(traffic({ ahead: rival }))).toEqual([]);
    // The car close ahead at the start and then passed was attacked, not followed.
    expect(describeLapTraffic(traffic({ ahead: rival, following: true, passed: [rival.car] }))).toEqual(['Attacking: passed Vinicius Ares']);
  });

  it('names the rivals passed and the places the passes won or lost', () => {
    const rivals = ['A', 'B', 'C', 'D', 'E'].map((name) => car(name, 'Hyper'));
    expect(describeLapTraffic(traffic({ passed: rivals.slice(0, 2) }), { from: 18, to: 16, inClass: true }))
      .toEqual(['Attacking: passed A and B, now P16 in class (+2)']);
    expect(describeLapTraffic(traffic({ passedBy: rivals }), { from: 3, to: 8, inClass: false }))
      .toEqual(['Defending: passed by A, B, C and 2 more, now P8 (−5)']);
    // A place gained elsewhere (a rival pitting) is not put on a lost pass.
    expect(describeLapTraffic(traffic({ passedBy: rivals.slice(0, 1) }), { from: 5, to: 4, inClass: false }))
      .toEqual(['Defending: passed by A']);
  });

  it('says nothing for a lap without traffic data', () => {
    expect(describeLapTraffic(undefined)).toEqual([]);
  });
});

describe('describeNonRepresentative', () => {
  it('names what the driver was doing on a traffic lap', () => {
    expect(describeNonRepresentative('traffic', traffic({
      passed: [car('A', 'Hyper')], passedBy: [car('B', 'GT3')], ahead: { car: car('C', 'GT3'), gapSec: 0.5 }, following: true,
    }))).toBe('Slower than your median lap while attacking, following a car and in multiclass traffic');
    expect(describeNonRepresentative('traffic', undefined)).toBe(NON_REPRESENTATIVE_LABELS.traffic.title);
    expect(describeNonRepresentative('contact', undefined)).toBe(NON_REPRESENTATIVE_LABELS.contact.title);
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
