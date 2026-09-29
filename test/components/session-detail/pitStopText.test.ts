import { describe, expect, it } from 'vitest';
import { damageBeforeStop, describePitService } from '../../../src/components/session-detail/table/pitStopText.js';
import type { LapData, PitService } from '../../../shared/types/index.js';

const service: PitService = {
  pitLaneSec: 123.1, serviceSec: 73.2, classMedianServiceSec: 29.3, energyFrom: 32, energyTo: 100, refillSec: 27.3, unexplainedSec: 44,
};

describe('describePitService', () => {
  it('gives the time in the box against the class, the refill and a guess at repairs after damage', () => {
    expect(describePitService(service, { lapNum: 11, description: 'New suspension damage reported' })).toEqual([
      'In the box: 73 s (usual for your class: 29 s)',
      'Energy: 32% → 100% (refill 27 s)',
      "Likely repairs: 44 s longer than the refill and your class's usual stop, after the suspension damage on lap 11",
    ]);
  });

  it('describes a drive-through, a stop without refill and a penalty served', () => {
    expect(describePitService({ pitLaneSec: 31, serviceSec: null, classMedianServiceSec: null })).toEqual(['No stop in the box: drive-through']);
    expect(describePitService({ pitLaneSec: null, serviceSec: 40, classMedianServiceSec: null, energyFrom: 50, energyTo: 50, penaltyServed: true }))
      .toEqual(['In the box: 40 s', 'Energy: no refill (50%)', 'Penalty: served during the stop']);
  });
});

describe('damageBeforeStop', () => {
  const lap = (lapNum: number, extra: Partial<LapData> = {}) => ({ lapNum, isPitStop: false, ...extra } as LapData);
  const damage = (description: string) => ({ incidents: [{ type: 'damage' as const, description }] });

  it('finds the last damage since the previous stop', () => {
    const laps = [lap(2, damage('New engine damage reported')), lap(3, { isPitStop: true }), lap(5, damage('New suspension damage reported')), lap(8, { isPitStop: true })];
    expect(damageBeforeStop(laps, laps[3])).toEqual({ lapNum: 5, description: 'New suspension damage reported' });
    expect(damageBeforeStop(laps.slice(0, 2).concat(lap(4)), laps[1])).toEqual({ lapNum: 2, description: 'New engine damage reported' });
    expect(damageBeforeStop([lap(9, { isPitStop: true })], lap(9, { isPitStop: true }))).toBeUndefined();
  });
});
