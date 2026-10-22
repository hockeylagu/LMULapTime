import { describe, expect, it } from 'vitest';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LiveSessionTracker } from '../../../shared/domain/live/liveSessionTracker.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import { liveStrategy } from '../../helpers/liveSnapshot.js';

const TRACK = 10_000;
/** The planned stop still ahead, the game estimating 10 s of service. */
const planned = liveStrategy();
const strategy = (state: 'none' | 'entering') => liveStrategy({ pit: { ...planned.pit!, state, serviceSeconds: 10 } });

/**
 * The leader's race to a 1020 s clock at 100 s a lap, with a stop on lap 4: in the lane from 380 s (8000 m) to 425 s
 * (9500 m), standing in the box from 395 to 405 s, across the line at 430 s; the out-lap takes 110 s, to 540 s.
 */
function position(et: number): { laps: number; lapStart: number; dist: number; inPits: boolean } {
  if (et < 380) return { laps: Math.floor(et / 100), lapStart: Math.floor(et / 100) * 100, dist: (et % 100) * 100, inPits: false };
  if (et < 425) {
    const dist = et < 395 ? 8000 + ((et - 380) / 15) * 500 : et <= 405 ? 8500 : 8500 + ((et - 405) / 20) * 1000;
    return { laps: 3, lapStart: 300, dist, inPits: true };
  }
  if (et < 430) return { laps: 3, lapStart: 300, dist: 9500 + (et - 425) * 100, inPits: false };
  if (et < 540) return { laps: 4, lapStart: 430, dist: ((et - 430) / 110) * TRACK, inPits: false };
  const laps = 5 + Math.floor((et - 540) / 100);
  return { laps, lapStart: 540 + (laps - 5) * 100, dist: ((et - 540) % 100) * 100, inPits: false };
}

function at(et: number): LiveScoringReading {
  const { laps, lapStart, dist, inPits } = position(et);
  const lastLapTime = laps === 0 ? -1 : laps === 4 ? 130 : laps === 5 ? 110 : 100;
  const player = vehicleReading({ id: 3, totalLaps: laps, lapStartEt: lapStart, lapDist: dist, estimatedLapTime: 100, inPits,
    lastLapTime, lastSector1: -1, lastSector2: -1 });
  return scoringReading({ currentEt: et, endEt: 1020, trackLength: TRACK, player, leader: player });
}

function drive(tracker: LiveSessionTracker, from: number, to: number) {
  let lapsLeft = null;
  for (let et = from; et <= to; et += 1) {
    const reading = at(et);
    lapsLeft = tracker.apply(reading, deriveLiveState(reading, 'driving'), strategy(reading.player?.inPits ? 'entering' : 'none')).lapsLeft;
  }
  return lapsLeft;
}

describe('LiveSessionTracker race distance', () => {
  it('counts the stored pit lane loss of a planned stop from the start, before any stop of its own', () => {
    // At 250 s, half round lap 3: the next line at 300. With the stored 40 s and 10 s of service: (1020 - 300 - 50) / 100.
    const stored = new LiveSessionTracker();
    stored.setStoredLaneLoss(40);
    expect(drive(stored, 0, 250)).toEqual({ laps: 8, estimated: true });
    // Nothing stored: only the service, 1 + ceil(710 / 100).
    expect(drive(new LiveSessionTracker(), 0, 250)).toEqual({ laps: 9, estimated: true });
  });

  it('measures a stop as the in-lap and out-lap over two laps at pace, less the time standing in the box', () => {
    const tracker = new LiveSessionTracker();
    drive(tracker, 0, 539);
    expect(tracker.takeLaneLoss()).toBeNull();
    // The out-lap ends at 540 s: 130 + 110 - 2 x 100 - 10 = 30 s, once.
    drive(tracker, 540, 541);
    expect(tracker.takeLaneLoss()).toEqual({ seconds: 30, inLap: 4 });
    expect(tracker.takeLaneLoss()).toBeNull();
    // Its pace leaves both stop laps out; the next stop then costs 30 + 10 s: 1 + ceil((1020 - 640 - 40) / 100).
    expect(drive(tracker, 542, 600)).toEqual({ laps: 5, estimated: true });
  });

  it('does not measure a stop with damage from its pace laps on, and a stored loss leads the measured one', () => {
    const withDamage = (impactLap: number) => {
      const tracker = new LiveSessionTracker();
      for (let et = 0; et <= 541; et += 1) {
        const reading = at(et);
        tracker.apply(reading, deriveLiveState(reading, 'driving'), liveStrategy({ ...strategy('none'), damage: { ...damageOf(), impactLap } }));
      }
      return tracker.takeLaneLoss();
    };
    // A hit on the out-lap spoils the stop on lap 4 (older damage: `damageSpoilsStop`).
    expect(withDamage(5)).toBeNull();
    const stored = new LiveSessionTracker();
    stored.setStoredLaneLoss(80);
    drive(stored, 0, 541);
    // 80 + 10 s: 1 + ceil((1020 - 640 - 90) / 100) at 600 s.
    expect(drive(stored, 542, 600)).toEqual({ laps: 4, estimated: true });
  });
});

function damageOf() {
  return { wheel: null, body: 0.2, suspension: 0, partsDetached: false, impactLap: 2, lapsSinceImpact: 0,
    paceLossPerLap: null, lossToFinish: null, repairSeconds: 0, significant: false };
}
