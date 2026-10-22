import { describe, expect, it } from 'vitest';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LiveSessionTracker } from '../../../shared/domain/live/liveSessionTracker.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import { liveStrategy } from '../../helpers/liveSnapshot.js';

const LAP = 100;
const TRACK = 10_000;
/** The planned stop still ahead, the game estimating 10 s of service. */
const planned = liveStrategy();
const pit = (state: 'none' | 'entering') => liveStrategy({ pit: { ...planned.pit!, state, serviceSeconds: 10 } });

/** The leader's race to a 2050 s clock: laps of 100 s; `lane` puts it in the pit lane from 395 to 440 s. */
function at(et: number, lane = false): LiveScoringReading {
  const inPits = lane && et >= 395 && et < 440;
  // Through the lane: 1000 m in 45 s, across the line at 410 s; on pace again from 500 m at 440 s.
  const laps = lane && et >= 410 ? Math.floor((et - 410) / LAP) + 4 : Math.min(Math.floor(et / LAP), lane ? 3 : Infinity);
  const lapStart = lane && et >= 410 ? 410 + (laps - 4) * LAP : laps * LAP;
  const dist = !lane || et < 395 ? ((et - lapStart) / LAP) * TRACK
    : et < 440 ? (9500 + ((et - 395) / 45) * 1000) % TRACK : 500 + ((et - 440) / LAP) * TRACK;
  const player = vehicleReading({ id: 3, totalLaps: laps, lapStartEt: lapStart, lapDist: dist, estimatedLapTime: LAP, inPits,
    lastLapTime: laps > 0 ? LAP : -1, lastSector1: -1, lastSector2: -1 });
  return scoringReading({ currentEt: et, endEt: 2050, trackLength: TRACK, player, leader: player });
}

function drive(tracker: LiveSessionTracker, from: number, to: number, lane: boolean) {
  for (let et = from; et <= to; et += 1) {
    const reading = at(et, lane);
    tracker.apply(reading, deriveLiveState(reading, 'driving'), pit(reading.player?.inPits ? 'entering' : 'none'));
  }
}

describe('LiveSessionTracker race distance', () => {
  it('counts its own pace, the lap slowed by the stop and the planned stop measured at the first one', () => {
    const tracker = new LiveSessionTracker();
    // Through the lane at 395-440 s: 45 s, less 10 s of racing over its 1000 m and 10 s of service, loses 25 s.
    drive(tracker, 0, 499, true);
    // At 500 s, 65% round a lap started at 410: next line at 535. The next stop costs 25 + 10 s: (2050 - 535 - 35) / 100.
    const reading = at(500, true);
    expect(tracker.apply(reading, deriveLiveState(reading, 'driving'), pit('none')).lapsLeft).toEqual({ laps: 16, estimated: true });

    // Before any stop only the service is known: (2050 - 535 - 10) / 100 rounds up to one more lap.
    const fresh = new LiveSessionTracker();
    drive(fresh, 0, 349, true);
    const first = at(500, true);
    expect(fresh.apply({ ...first, player: { ...first.player!, inPits: false } }, deriveLiveState(first, 'driving'), pit('none')).lapsLeft)
      .toEqual({ laps: 17, estimated: true });
  });
});
