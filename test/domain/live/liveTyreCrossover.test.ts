import { describe, expect, it } from 'vitest';
import { tyreCrossover } from '../../../shared/domain/live/liveTyreCrossover.js';

const base = { avgPathWetness: 0.125, compound: 'Medium', dryCompound: 'Medium', pitInLaps: null, lapsLeft: null, sessionKind: 'race' } as const;
describe('tyreCrossover', () => {
  it.each([0.125, 0.4, 0.6, 1])('boxes slicks for wets at wetness %s', avgPathWetness => {
    expect(tyreCrossover({ ...base, avgPathWetness })).toEqual({ action: 'wets', compound: 'Wet', when: 'now', reason: 'slightly-wet', wetness: avgPathWetness });
  });
  it.each(['Medium', 'Wet'])('holds %s in Damp', compound => {
    expect(tyreCrossover({ ...base, compound, avgPathWetness: 0.05 })).toBeNull();
  });
  it('holds tyres already suited to the surface and below the wet threshold', () => {
    expect(tyreCrossover({ ...base, compound: 'Wet' })).toBeNull();
    expect(tyreCrossover({ ...base, avgPathWetness: 0 })).toBeNull();
    expect(tyreCrossover({ ...base, avgPathWetness: 0.1249 })).toBeNull();
    expect(tyreCrossover({ ...base, compound: 'Wet', avgPathWetness: 0.001 })).toBeNull();
  });
  it.each([0, 2, 3, 4])('merges only into stops within three laps (%s)', pitInLaps => {
    expect(tyreCrossover({ ...base, pitInLaps })?.when).toBe(pitInLaps <= 3 ? 'planned-stop' : 'now');
  });
  it('names the previous dry compound, retaining unknown when starting on wets', () => {
    expect(tyreCrossover({ ...base, compound: 'Wet', avgPathWetness: 0 })).toMatchObject({ action: 'slicks', compound: 'Medium', reason: 'dry' });
    expect(tyreCrossover({ ...base, compound: 'Wet', avgPathWetness: 0, dryCompound: null })?.compound).toBeNull();
  });
  it.each(['practice', 'qualifying', 'warmup', 'unknown'] as const)('is silent in %s', sessionKind => {
    expect(tyreCrossover({ ...base, sessionKind })).toBeNull();
  });
  it.each([null, undefined, NaN, Infinity, -1, 1.1])('rejects missing or invalid wetness %s', avgPathWetness => {
    expect(tyreCrossover({ ...base, avgPathWetness })).toBeNull();
  });
  it.each([1, 2, 3])('is silent in the last two laps (%s left)', lapsLeft => {
    expect(tyreCrossover({ ...base, lapsLeft }) === null).toBe(lapsLeft <= 2);
    expect(tyreCrossover({ ...base, compound: 'Wet', avgPathWetness: 0, lapsLeft }) === null).toBe(lapsLeft <= 2);
  });
  it('requires the fitted compound', () => { expect(tyreCrossover({ ...base, compound: null })).toBeNull(); });
});
