import { describe, expect, it } from 'vitest';
import { cornerLapDifference } from '../../../../../src/components/replay/analysis/conclusion/cornerLapDifference.js';
import { lapPass } from './lapPassFixtures.js';

const turns = [{ id: 0, label: 'T1' }, { id: 1, label: 'T2' }];

describe('cornerLapDifference', () => {
  it('says each half where either lap loses time, in lap order, with the slower lap as the subject', () => {
    // The shown lap brakes 10 m earlier into T1 and is quicker out of it; the baseline is 4 km/h slower through T2.
    const lap = [lapPass(0, 5, { brakeM: 690, toApex: 2.1, brakeSec: 1.3 }), lapPass(1, 5)];
    const baseline = [lapPass(0, 3, { fromApex: 2.2, exitSpeedKmh: 145, partThrottleSec: 0.9 }), lapPass(1, 3, { minSpeedKmh: 86, toApex: 2.15 })];
    expect(cornerLapDifference(turns, lap, baseline, 5000, true)).toEqual({
      notes: [],
      lines: [
        { key: '0|in', deltaSec: expect.closeTo(0.1) as unknown, where: 'into T1', text: 'This lap braked 10 m earlier', kindLine: null, causes: ['braking 0.3 s longer'] },
        { key: '0|out', deltaSec: expect.closeTo(-0.2) as unknown, where: 'out of T1', text: "The baseline was 5 km/h slower at the turn's end", kindLine: null, causes: ['0.4 s more part throttle'] },
        { key: '1|in', deltaSec: expect.closeTo(-0.15) as unknown, where: 'into T2', text: 'The baseline was 4 km/h slower at the slowest point', kindLine: null, causes: [] },
      ],
    });
  });

  it('words a lift against a brake, a loss nothing explains, and the whole turn', () => {
    const lifted = cornerLapDifference([turns[0]], [lapPass(0, 5, { toApex: 2.2, peakBrake: 0.6 })], [lapPass(0, 3, { peakBrake: 0.1 })], 5000, true);
    expect(lifted?.lines[0]).toMatchObject({ where: 'into T1', text: 'This lap braked where the baseline only lifted' });
    const plain = cornerLapDifference([turns[0]], [lapPass(0, 5)], [lapPass(0, 3, { minSpeedM: 830, fromApex: 2.1 })], 5000, true);
    expect(plain?.lines).toMatchObject([{ key: '0|whole', where: 'through T1', text: 'The baseline lost time: nothing measured stands out' }]);
  });

  it('notes a car close ahead and much longer ABS on the lap that loses time, and names a turn without a label by its place', () => {
    const lap = [lapPass(1, 5, { toApex: 2.3, aheadGapSec: 0.4, absSec: 0.6 })];
    expect(cornerLapDifference([{ id: 1, label: '' }], lap, [lapPass(1, 3)], 5000, true)?.notes).toEqual([
      'This lap had a car close ahead at turn 2: time lost there is not the driving.',
      'This lap had ABS working 0.6 s longer into turn 2.',
    ]);
  });

  it('has no line when the laps are level, and nothing when no turn was measured on both', () => {
    expect(cornerLapDifference(turns, [lapPass(0, 5)], [lapPass(0, 3)], 5000, true)).toEqual({ lines: [], notes: [] });
    expect(cornerLapDifference(turns, [lapPass(0, 5)], [lapPass(1, 3)], 5000, true)).toBeNull();
  });
});
