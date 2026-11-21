import { describe, it, expect } from 'vitest';
import { isSessionEmpty } from '../../../shared/domain/sessions/sessionLaps.js';

describe('isSessionEmpty', () => {
  it('returns true when session has no playerDriver and 0 driversCount', () => {
    expect(isSessionEmpty({ driversCount: 0 })).toBe(true);
    expect(isSessionEmpty({ driversCount: 5 })).toBe(false);
  });

  it('returns true if player driver has 0 laps or bestLapTime is null', () => {
    expect(isSessionEmpty({ playerDriver: { lapsCount: 0, bestLapTime: null } })).toBe(true);
    expect(isSessionEmpty({ playerDriver: { lapsCount: 0, bestLapTime: 100 } })).toBe(true);
    expect(isSessionEmpty({ playerDriver: { lapsCount: 3, bestLapTime: null } })).toBe(true);
  });

  it('returns false if player driver has valid laps and best lap time', () => {
    expect(isSessionEmpty({ playerDriver: { lapsCount: 5, bestLapTime: 95.2 } })).toBe(false);
  });
});
