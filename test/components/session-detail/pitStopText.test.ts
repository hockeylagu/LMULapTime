import { describe, expect, it } from 'vitest';
import { damageBeforeStop, describePitService } from '../../../src/components/session-detail/table/pitStopText.js';
import type { LapData, PitService } from '../../../shared/types/index.js';

const service: PitService = {
  pitLaneSec: 123.1, serviceSec: 73.2, classMedianServiceSec: 29.3, energyFrom: 32, energyTo: 100, refillSec: 27.3, unexplainedSec: 44,
};

describe('describePitService', () => {
  it('gives the time in the box against the class, the refill and a guess at repairs after damage', () => {
    expect(describePitService(service, { lapNumber: 11, description: 'New suspension damage reported' })).toEqual([
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
  const lap = (lapNumber: number, extra: Partial<LapData> = {}) => ({ lapNumber, isPitStop: false, ...extra } as LapData);
  const damage = (lapNumber: number, description: string) => ({ type: 'damage' as const, description, lapNumber });

  it('finds the last damage since the previous stop', () => {
    const laps = [lap(2), lap(3, { isPitStop: true }), lap(5), lap(8, { isPitStop: true })];
    const incidents = [damage(2, 'New engine damage reported'), damage(5, 'New suspension damage reported')];
    expect(damageBeforeStop({ laps, incidents }, laps[3])).toEqual({ lapNumber: 5, description: 'New suspension damage reported' });
    expect(damageBeforeStop({ laps: laps.slice(0, 2).concat(lap(4)), incidents }, laps[1])).toEqual({ lapNumber: 2, description: 'New engine damage reported' });
    expect(damageBeforeStop({ laps: [lap(9, { isPitStop: true })], incidents }, lap(9, { isPitStop: true }))).toBeUndefined();
  });
});
