import { describe, expect, it } from 'vitest';
import { deriveLiveState, isLiveOnTrack, isLiveSessionLoaded, liveSessionKind } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import type { LiveLifecycle } from '../../../shared/types/live.js';

function reading(overrides: Partial<LiveScoringReading> = {}): LiveScoringReading {
  return scoringReading({ player: vehicleReading({ id: 3, place: 4, totalLaps: 7 }), ...overrides });
}

describe('live lifecycle', () => {
  it.each<[string, LiveScoringReading | null, LiveLifecycle, LiveLifecycle, boolean]>([
    ['no shared memory', null, 'driving', 'offline', false],
    ['no vehicles in the session', reading({ numVehicles: 0 }), 'offline', 'menu', false],
    ['in the monitor', reading({ inRealtime: false }), 'driving', 'garage', false],
    ['grid (phase 0)', reading({ gamePhase: 0 }), 'garage', 'starting', false],
    ['formation (phase 3)', reading({ gamePhase: 3 }), 'garage', 'starting', false],
    ['countdown (phase 4)', reading({ gamePhase: 4 }), 'garage', 'starting', false],
    ['green (phase 5)', reading({ gamePhase: 5 }), 'starting', 'driving', false],
    ['full course yellow (phase 6)', reading({ gamePhase: 6 }), 'driving', 'driving', false],
    ['stopped (phase 7)', reading({ gamePhase: 7 }), 'driving', 'driving', false],
    ['checkered (phase 8)', reading({ gamePhase: 8 }), 'driving', 'finished', false],
    ['paused keeps the previous lifecycle', reading({ gamePhase: 9 }), 'finished', 'finished', true],
    ['paused with no history is on track', reading({ gamePhase: 9 }), 'offline', 'driving', true],
    ['unknown phase keeps the previous lifecycle', reading({ gamePhase: 42 }), 'driving', 'driving', false],
  ])('%s', (_name, input, previous, lifecycle, paused) => {
    expect(deriveLiveState(input, previous)).toMatchObject({ lifecycle, paused });
  });

  it('describes the session only while one is loaded', () => {
    expect(deriveLiveState(null, 'driving').session).toBeNull();
    expect(deriveLiveState(reading({ numVehicles: 0 }), 'offline').session).toBeNull();
    expect(deriveLiveState(reading({ endEt: 3600, maxLaps: 2147483647 }), 'offline').session).toMatchObject({
      kind: 'race', sessionCode: 10, trackName: 'Circuit de la Sarthe', vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3',
      endSeconds: 3600, maxLaps: null, playerLapsCompleted: 7, playerPlace: 4, elapsedSeconds: 120,
    });
    expect(deriveLiveState(reading({ endEt: 1e30, maxLaps: 30, player: null }), 'offline').session).toMatchObject({
      endSeconds: null, maxLaps: 30, vehicleName: '', playerLapsCompleted: null, playerPlace: null,
    });
  });

  it.each([
    [0, 'practice'], [1, 'practice'], [4, 'practice'], [5, 'qualifying'], [8, 'qualifying'],
    [9, 'warmup'], [10, 'race'], [13, 'race'], [14, 'unknown'], [-1, 'unknown'],
  ])('maps session code %i to %s', (code, kind) => {
    expect(liveSessionKind(code)).toBe(kind);
  });

  it('classifies which lifecycles hold the game files and stream pedals', () => {
    expect((['offline', 'menu', 'garage', 'starting', 'driving', 'finished'] as const).map(isLiveSessionLoaded))
      .toEqual([false, false, true, true, true, true]);
    expect((['offline', 'menu', 'garage', 'starting', 'driving', 'finished'] as const).map(isLiveOnTrack))
      .toEqual([false, false, false, true, true, true]);
  });
});
