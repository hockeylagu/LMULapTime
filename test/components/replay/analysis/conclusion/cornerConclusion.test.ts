import { describe, expect, it } from 'vitest';
import { cornerConclusion } from '../../../../../src/components/replay/analysis/conclusion/cornerConclusion.js';
import { analysis } from '../../../session-detail/debrief/debriefFixtures.js';

describe('cornerConclusion', () => {
  it("says the corner's habit over the session as the debrief does, and what the shown lap lost there", () => {
    expect(cornerConclusion(analysis, 5, 3)).toEqual({
      costSec: 0.2,
      focus: true,
      habit: {
        line: 'Carry 4 km/h more through T2', rule: 'overSlowing', share: 1,
        tryLine: 'Get closer to the inside at the apex', tryTitle: 'The target is 1.2 m closer to the inside at the apex than you',
        speedCue: 'Apex 96 → 100 km/h', diagnosis: 'tighter arc (80 m radius against 87 m)',
        causes: ['braking 0.4 s longer', '0.2 s more coasting'],
      },
      mistake: { turnLabel: 'T2', lossSec: 0.3, cause: 'slowExit' },
    });
  });

  it('has no try line under a brake point headline, and no lap line for a lap that lost nothing there', () => {
    const conclusion = cornerConclusion(analysis, 9, 2);
    expect(conclusion?.habit).toMatchObject({ line: 'Brake 10 m later into T4', rule: 'brakeEarly', tryLine: null, diagnosis: null });
    expect(conclusion?.mistake).toBeNull();
  });

  it("takes the lap's biggest loss in the corner", () => {
    const mistakes = [...analysis.mistakes, { lapOrdinal: 3, cornerId: 5, turnId: 1, turnLabel: 'T1', lossSec: 0.45, cause: 'lockup' as const, line: '' }];
    expect(cornerConclusion({ ...analysis, mistakes }, 5, 3)?.mistake).toEqual({ turnLabel: 'T1', lossSec: 0.45, cause: 'lockup' });
  });

  it('falls back to a loss no rule explains, without a speed to hit', () => {
    const conclusion = cornerConclusion({ ...analysis, habits: [] }, 9, undefined);
    expect(conclusion).toMatchObject({ focus: true, costSec: 0.1, mistake: null });
    expect(conclusion?.habit).toMatchObject({ line: 'Losing time into T4: no clear cause', rule: null, tryLine: null, speedCue: null, diagnosis: null });
  });

  it('has no habit at a corner that loses nothing worth telling, and nothing for a corner the analysis does not hold', () => {
    expect(cornerConclusion({ ...analysis, habits: [], unexplained: [] }, 9, 1)?.habit).toBeNull();
    expect(cornerConclusion(analysis, 3, 1)).toBeNull();
  });
});
