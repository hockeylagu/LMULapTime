import { describe, expect, it } from 'vitest';
import type { SessionStrategy } from '../../../shared/types/index.js';
import { estimateFromHistory } from '../../../shared/domain/strategy/strategyHistory.js';

const race = (kind: 've' | 'fuel', perLap: { fuel: number | null; ve: number | null; laps: number }, compound: string | null, wearPerLap: number | null): SessionStrategy => ({
  kind, laps: 14, start: { fuel: 50, ve: kind === 've' ? 100 : null }, flag: { fuel: 5, ve: null, laps: 1 }, perLap,
  fuelRatio: { set: null, needed: null }, tyres: { compound, corner: 'FL', wearPerLap, treadAtFlag: 0.7 }, stops: [],
  pace: { clean: 100, first: 100, last: 100, laps: 10 },
});

describe('race strategy from earlier races', () => {
  it('takes the median use of the races on the same resource and the wear of the races on the same compound', () => {
    const races = [
      race('ve', { fuel: 6.6, ve: 8.1, laps: 6 }, 'Medium', 0.0114),
      race('ve', { fuel: 6.4, ve: 7.9, laps: 8 }, 'medium', 0.012),
      race('ve', { fuel: 6.5, ve: 8.4, laps: 1 }, 'Soft', 0.03),
      race('fuel', { fuel: 2.3, ve: null, laps: 9 }, 'Medium', 0.0035),
    ];
    // The one-lap race is too short for the use; the soft race's wear is another compound's.
    expect(estimateFromHistory(races, 've', 'MEDIUM')).toEqual({ perLap: 8, wearPerLap: 0.0114, useRaces: 2, wearRaces: 3 });
    expect(estimateFromHistory(races, 'fuel', 'Hard')).toEqual({ perLap: 2.3, wearPerLap: null, useRaces: 1, wearRaces: 0 });
    // An unknown compound takes every race's wear.
    expect(estimateFromHistory(races, 've', null).wearRaces).toBe(4);
    expect(estimateFromHistory([], 've', null)).toEqual({ perLap: null, wearPerLap: null, useRaces: 0, wearRaces: 0 });
  });
});
