import { describe, expect, it } from 'vitest';
import { damageSpoilsStop, pitLaneLoss } from '../../../shared/domain/live/livePitLane.js';

describe('pitLaneLoss', () => {
  it('is the in-lap and out-lap over two laps at pace, less the time standing in the box', () => {
    // Le Mans race 2026-10-22, the second stop: 6.6 s in the box.
    expect(pitLaneLoss(223.3, 242.2, 214.8, 6.6)).toBe(29.3);
    // The time in the box never counts, however long: a repair of 184 s leaves the same lane.
    expect(pitLaneLoss(223.3, 419.6, 214.8, 184)).toBe(29.3);
  });

  it('is null without both laps or a pace, or when nothing was lost', () => {
    expect(pitLaneLoss(null, 242.2, 214.8, 6.6)).toBeNull();
    expect(pitLaneLoss(223.3, 242.2, null, 6.6)).toBeNull();
    expect(pitLaneLoss(214, 215, 214.8, 6.6)).toBeNull();
    expect(pitLaneLoss(223.3, 242.2, 214.8, Number.NaN)).toBeNull();
  });
});

describe('damageSpoilsStop', () => {
  it('leaves out a stop hit on its pace laps, in-lap or out-lap, not one with older damage', () => {
    // Bahrain 2026-10-21: hit on lap 2, steady on the damaged car, in on lap 14. Le Mans 2026-10-22: hit on the in-lap.
    expect(damageSpoilsStop(2, 14)).toBe(false);
    expect(damageSpoilsStop(2, 2)).toBe(true);
    expect(damageSpoilsStop(9, 14)).toBe(true);
    expect(damageSpoilsStop(8, 14)).toBe(false);
    expect(damageSpoilsStop(15, 14)).toBe(true);
    expect(damageSpoilsStop(null, 14)).toBe(false);
  });
});
